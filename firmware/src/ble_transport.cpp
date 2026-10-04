#include "ble_transport.h"

#include <Arduino.h>
#include <BLE2902.h>
#include <BLEAdvertising.h>
#include <BLECharacteristic.h>
#include <BLEDevice.h>
#include <USBHIDKeyboard.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <esp_attr.h>
#include <string.h>

#include "protocol.h"

static constexpr char DEVICE_NAME[] = "Codex Cardputer";
static constexpr char BRIDGE_SERVICE_UUID[] = "9f9c7001-7d2a-4c3f-a7e2-9b1c6d5e4f30";
static constexpr char BRIDGE_RX_UUID[] = "9f9c7002-7d2a-4c3f-a7e2-9b1c6d5e4f30";
static constexpr char BRIDGE_TX_UUID[] = "9f9c7003-7d2a-4c3f-a7e2-9b1c6d5e4f30";

static BLEServer* server = nullptr;
static BLECharacteristic* bridgeTx = nullptr;
static BLEAdvertising* bridgeAdvertising = nullptr;
static QueueHandle_t receiveQueue = nullptr;
static volatile bool clientConnected = false;
static volatile bool restartAdvertising = false;
static volatile bool advertisementConfigured = false;
static bool advertisementStartRequested = false;
static constexpr uint32_t BOOT_GUARD_MAGIC = 0xc0de7000;
RTC_DATA_ATTR static uint32_t bleBootGuard = 0;
static uint8_t recoveredStage = 0;
static bool initializationPending = false;

struct BleChunk {
    uint16_t length;
    uint8_t data[180];
};

struct KeyboardReport {
    uint8_t modifiers;
    uint8_t reserved;
    uint8_t keys[6];
};

static KeyboardReport keyboardReport = {};

#define SHIFT 0x80
static const uint8_t ASCII_MAP[128] = {
    0,0,0,0,0,0,0,0,0x2a,0x2b,0x28,0,0,0,0,0,
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
    0x2c,0x1e|SHIFT,0x34|SHIFT,0x20|SHIFT,0x21|SHIFT,0x22|SHIFT,0x24|SHIFT,0x34,
    0x26|SHIFT,0x27|SHIFT,0x25|SHIFT,0x2e|SHIFT,0x36,0x2d,0x37,0x38,
    0x27,0x1e,0x1f,0x20,0x21,0x22,0x23,0x24,0x25,0x26,0x33|SHIFT,0x33,0x36|SHIFT,0x2e,0x37|SHIFT,0x38|SHIFT,
    0x1f|SHIFT,0x04|SHIFT,0x05|SHIFT,0x06|SHIFT,0x07|SHIFT,0x08|SHIFT,0x09|SHIFT,0x0a|SHIFT,
    0x0b|SHIFT,0x0c|SHIFT,0x0d|SHIFT,0x0e|SHIFT,0x0f|SHIFT,0x10|SHIFT,0x11|SHIFT,0x12|SHIFT,
    0x13|SHIFT,0x14|SHIFT,0x15|SHIFT,0x16|SHIFT,0x17|SHIFT,0x18|SHIFT,0x19|SHIFT,0x1a|SHIFT,
    0x1b|SHIFT,0x1c|SHIFT,0x1d|SHIFT,0x2f,0x31,0x30,0x23|SHIFT,0x2d|SHIFT,
    0x35,0x04,0x05,0x06,0x07,0x08,0x09,0x0a,0x0b,0x0c,0x0d,0x0e,0x0f,0x10,0x11,0x12,
    0x13,0x14,0x15,0x16,0x17,0x18,0x19,0x1a,0x1b,0x1c,0x1d,0x2f|SHIFT,0x31|SHIFT,0x30|SHIFT,0x35|SHIFT,0,
};

static void sendKeyboardReport() {
    if (!clientConnected || !bridgeTx) return;
    char line[120];
    snprintf(
        line,
        sizeof(line),
        "{\"v\":1,\"t\":\"hid.report\",\"modifiers\":%u,\"keys\":[%u,%u,%u,%u,%u,%u]}",
        keyboardReport.modifiers,
        keyboardReport.keys[0],
        keyboardReport.keys[1],
        keyboardReport.keys[2],
        keyboardReport.keys[3],
        keyboardReport.keys[4],
        keyboardReport.keys[5]
    );
    bleTransportSendLine(line);
}

static uint8_t translateKey(uint8_t key, bool& shift) {
    shift = false;
    if (key >= 0x88) return key - 0x88;
    if (key >= 0x80) return 0;
    if (key >= sizeof(ASCII_MAP)) return 0;
    uint8_t result = ASCII_MAP[key];
    shift = (result & SHIFT) != 0;
    return result & 0x7f;
}

class ServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer*) override { clientConnected = true; }
    void onDisconnect(BLEServer*) override {
        clientConnected = false;
        restartAdvertising = true;
        memset(&keyboardReport, 0, sizeof(keyboardReport));
    }
};

class ReceiveCallbacks : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic* characteristic) override {
        if (!receiveQueue) return;
        const std::string value = characteristic->getValue();
        size_t offset = 0;
        while (offset < value.size()) {
            BleChunk chunk = {};
            chunk.length = min(value.size() - offset, sizeof(chunk.data));
            memcpy(chunk.data, value.data() + offset, chunk.length);
            if (xQueueSend(receiveQueue, &chunk, 0) != pdTRUE) break;
            offset += chunk.length;
        }
    }
};

static void markBootStage(uint8_t stage) {
    bleBootGuard = BOOT_GUARD_MAGIC | stage;
}

static void onGapEvent(esp_gap_ble_cb_event_t event, esp_ble_gap_cb_param_t* param) {
    if (event == ESP_GAP_BLE_ADV_DATA_RAW_SET_COMPLETE_EVT) {
        advertisementConfigured = param->adv_data_raw_cmpl.status == ESP_BT_STATUS_SUCCESS;
    }
}

bool bleTransportBegin() {
    if ((bleBootGuard & 0xffffff00) == BOOT_GUARD_MAGIC) {
        recoveredStage = bleBootGuard & 0xff;
        bleBootGuard = 0;
        return false;
    }

    markBootStage(1);
    receiveQueue = xQueueCreate(18, sizeof(BleChunk));
    BLEDevice::init(DEVICE_NAME);
    BLEDevice::setMTU(185);
    BLEDevice::setCustomGapHandler(onGapEvent);

    markBootStage(2);
    server = BLEDevice::createServer();
    server->setCallbacks(new ServerCallbacks());

    markBootStage(3);
    BLEService* bridgeService = server->createService(BLEUUID(BRIDGE_SERVICE_UUID), 12);
    bridgeTx = bridgeService->createCharacteristic(
        BRIDGE_TX_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
    );
    BLE2902* txNotifications = new BLE2902();
    bridgeTx->addDescriptor(txNotifications);

    BLECharacteristic* bridgeRx = bridgeService->createCharacteristic(
        BRIDGE_RX_UUID,
        BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
    );
    // This app-specific channel carries the same local control messages that
    // are available over USB and is limited to nearby BLE clients.
    bridgeRx->setCallbacks(new ReceiveCallbacks());
    bridgeService->start();

    markBootStage(4);
    bridgeAdvertising = server->getAdvertising();
    // Build the legacy advertisement explicitly. The library's automatic
    // scan-response path copies the 128-bit UUID, device name, and TX power
    // into one packet, which exceeds the 31-byte BLE limit and silently
    // prevents advertising from starting.
    BLEAdvertisementData advertisementData;
    advertisementData.setFlags(ESP_BLE_ADV_FLAG_GEN_DISC | ESP_BLE_ADV_FLAG_BREDR_NOT_SPT);
    advertisementData.setCompleteServices(BLEUUID(BRIDGE_SERVICE_UUID));
    bridgeAdvertising->setAdvertisementData(advertisementData);
    // Keep the RTC guard armed through asynchronous advertising startup.
    // Bluedroid can surface faults after init() returns, so clearing it here
    // would allow a post-init boot loop.
    markBootStage(5);
    initializationPending = true;
    return true;
}

uint8_t bleTransportRecoveredStage() { return recoveredStage; }

void bleTransportLoop() {
    if (advertisementConfigured && !advertisementStartRequested && bridgeAdvertising) {
        advertisementStartRequested = true;
        bridgeAdvertising->start();
    }
    BleChunk chunk;
    while (receiveQueue && xQueueReceive(receiveQueue, &chunk, 0) == pdTRUE) {
        protocolReceiveBle(chunk.data, chunk.length);
    }
    if (restartAdvertising && server) {
        restartAdvertising = false;
        delay(60);
        server->startAdvertising();
    }
    if (initializationPending && millis() >= 60000) {
        initializationPending = false;
        bleBootGuard = 0;
    }
}

bool bleTransportConnected() { return clientConnected; }

bool bleTransportSendLine(const char* line) {
    if (!clientConnected || !bridgeTx || !line) return false;
    const size_t length = strlen(line);
    size_t offset = 0;
    while (offset < length) {
        // Use the actual negotiated MTU, retaining the default 20-byte fallback.
        const uint16_t mtu = server ? server->getPeerMTU(server->getConnId()) : 23;
        const size_t payload = mtu > 23 ? min((size_t)180, (size_t)mtu - 3) : 20;
        const size_t count = min(payload, length - offset);
        bridgeTx->setValue((uint8_t*)line + offset, count);
        bridgeTx->notify();
        offset += count;
        delay(8);
    }
    const uint8_t newline = '\n';
    bridgeTx->setValue((uint8_t*)&newline, 1);
    bridgeTx->notify();
    return true;
}

void bleTransportSetBattery(uint8_t) {}

bool bleHidConnected() { return clientConnected && bridgeTx; }

void bleHidPress(uint8_t key) {
    if (key >= 0x80 && key < 0x88) {
        keyboardReport.modifiers |= 1 << (key - 0x80);
        sendKeyboardReport();
        return;
    }
    bool shift = false;
    uint8_t raw = translateKey(key, shift);
    if (!raw) return;
    if (shift) keyboardReport.modifiers |= 0x02;
    for (uint8_t& existing : keyboardReport.keys) {
        if (existing == raw) return;
        if (!existing) {
            existing = raw;
            break;
        }
    }
    sendKeyboardReport();
}

void bleHidReleaseAll() {
    memset(&keyboardReport, 0, sizeof(keyboardReport));
    sendKeyboardReport();
}

void bleHidWrite(uint8_t value) {
    bleHidPress(value);
    delay(6);
    bleHidReleaseAll();
}
