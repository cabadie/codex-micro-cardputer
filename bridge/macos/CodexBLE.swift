import CoreBluetooth
import Foundation

private let bridgeService = CBUUID(string: "9F9C7001-7D2A-4C3F-A7E2-9B1C6D5E4F30")
private let bridgeRX = CBUUID(string: "9F9C7002-7D2A-4C3F-A7E2-9B1C6D5E4F30")
private let bridgeTX = CBUUID(string: "9F9C7003-7D2A-4C3F-A7E2-9B1C6D5E4F30")

private func emit(_ value: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: value), var line = String(data: data, encoding: .utf8) else {
        return
    }
    line.append("\n")
    FileHandle.standardOutput.write(Data(line.utf8))
}

final class CodexBLE: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var receiveCharacteristic: CBCharacteristic?
    private var transmitCharacteristic: CBCharacteristic?
    private var receiveBuffer = Data()
    private var outgoingBuffer = Data()
    private var stopping = false

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: .main)
        readStandardInput()
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state == .poweredOn {
            scan()
        } else {
            emit(["event": "unavailable", "state": central.state.rawValue])
        }
    }

    private func scan() {
        guard !stopping, peripheral == nil, central.state == .poweredOn else { return }
        if let connected = central.retrieveConnectedPeripherals(withServices: [bridgeService]).first {
            peripheral = connected
            connected.delegate = self
            central.connect(connected, options: [CBConnectPeripheralOptionNotifyOnDisconnectionKey: true])
            emit(["event": "connecting", "name": connected.name ?? "Codex Cardputer"])
            return
        }
        // The ESP32 Arduino BLE stack may place a 128-bit UUID in scan-response
        // data instead of the primary legacy advertisement. A strict CoreBluetooth
        // service filter can therefore miss it, so scan broadly and accept only
        // our exact local name or advertised service below.
        central.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
        emit(["event": "scanning"])
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        guard self.peripheral == nil else { return }
        let localName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
        let services = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? []
        guard localName == "Codex Cardputer" || peripheral.name == "Codex Cardputer" || services.contains(bridgeService) else { return }
        self.peripheral = peripheral
        central.stopScan()
        peripheral.delegate = self
        central.connect(peripheral, options: [CBConnectPeripheralOptionNotifyOnDisconnectionKey: true])
        emit(["event": "connecting", "name": peripheral.name ?? "Codex Cardputer"])
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.discoverServices([bridgeService])
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        emit(["event": "error", "message": error?.localizedDescription ?? "Bluetooth connection failed"])
        resetAndScan()
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        emit(["event": "disconnected", "message": error?.localizedDescription ?? ""])
        resetAndScan()
    }

    private func resetAndScan() {
        receiveCharacteristic = nil
        transmitCharacteristic = nil
        peripheral = nil
        receiveBuffer.removeAll(keepingCapacity: true)
        outgoingBuffer.removeAll(keepingCapacity: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in self?.scan() }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error {
            emit(["event": "error", "message": "Discover services: \(error.localizedDescription)"])
            central.cancelPeripheralConnection(peripheral)
            return
        }
        for service in peripheral.services ?? [] where service.uuid == bridgeService {
            peripheral.discoverCharacteristics([bridgeRX, bridgeTX], for: service)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        if let error {
            emit(["event": "error", "message": "Discover characteristics: \(error.localizedDescription)"])
            central.cancelPeripheralConnection(peripheral)
            return
        }
        for characteristic in service.characteristics ?? [] {
            if characteristic.uuid == bridgeRX { receiveCharacteristic = characteristic }
            if characteristic.uuid == bridgeTX {
                transmitCharacteristic = characteristic
                peripheral.setNotifyValue(true, for: characteristic)
            }
        }
        if receiveCharacteristic == nil || transmitCharacteristic == nil {
            emit(["event": "error", "message": "Codex BLE characteristics are missing"])
            central.cancelPeripheralConnection(peripheral)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        if let error {
            emit(["event": "error", "message": "Enable notifications: \(error.localizedDescription)"])
            central.cancelPeripheralConnection(peripheral)
            return
        }
        guard characteristic.uuid == bridgeTX, characteristic.isNotifying else { return }
        emit(["event": "connected", "name": peripheral.name ?? "Codex Cardputer", "id": peripheral.identifier.uuidString])
        flushPendingLines()
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error {
            emit(["event": "error", "message": error.localizedDescription])
            return
        }
        guard characteristic.uuid == bridgeTX, let value = characteristic.value else { return }
        receiveBuffer.append(value)
        while let newline = receiveBuffer.firstIndex(of: 0x0a) {
            let data = receiveBuffer.prefix(upTo: newline)
            receiveBuffer.removeSubrange(...newline)
            if let line = String(data: data, encoding: .utf8), !line.isEmpty {
                emit(["event": "message", "line": line])
            }
        }
    }

    private func readStandardInput() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            while let line = readLine() {
                DispatchQueue.main.async { self?.enqueue(line) }
            }
            DispatchQueue.main.async { self?.stopping = true }
        }
    }

    private func enqueue(_ line: String) {
        outgoingBuffer.append(Data((line + "\n").utf8))
        flushPendingLines()
    }

    private func flushPendingLines() {
        guard let peripheral, let characteristic = receiveCharacteristic,
              transmitCharacteristic?.isNotifying == true else { return }
        let writeType: CBCharacteristicWriteType = characteristic.properties.contains(.writeWithoutResponse) ? .withoutResponse : .withResponse
        let maximum = peripheral.maximumWriteValueLength(for: writeType)
        while !outgoingBuffer.isEmpty && peripheral.canSendWriteWithoutResponse {
            let count = min(maximum, outgoingBuffer.count)
            peripheral.writeValue(outgoingBuffer.prefix(count), for: characteristic, type: writeType)
            outgoingBuffer.removeFirst(count)
        }
    }

    func peripheralIsReady(toSendWriteWithoutResponse peripheral: CBPeripheral) {
        flushPendingLines()
    }
}

let helper = CodexBLE()
RunLoop.main.run()
