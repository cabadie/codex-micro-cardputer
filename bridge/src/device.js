const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const readline = require('node:readline');

class CardputerDevice extends EventEmitter {
  constructor(config, log = console.log, dependencies = {}) {
    super();
    this.config = config;
    this.log = log;
    this.spawn = dependencies.spawn || spawn;
    this.port = null;
    this.bleProcess = null;
    this.bleConnected = false;
    this.bleStatus = this.config.bluetooth?.enabled === false ? 'disabled' : 'stopped';
    this.connectTimer = null;
    this.stopping = false;
    this.lastTransport = null;
  }

  async findPath(SerialPort) {
    if (this.config.serialPath) return this.config.serialPath;
    const ports = await SerialPort.list();
    const match = ports.find((port) =>
      (port.vendorId || '').toLowerCase() === '303a' || /usbmodem/i.test(port.path)
    );
    return match && match.path;
  }

  updateConnection() {
    const next = this.transport;
    const previous = this.lastTransport;
    if (next === previous) return;
    this.lastTransport = next;
    if (next) {
      this.log(`device transport: ${next}`);
      this.emit('transport', next, previous);
      if (!previous) this.emit('connected', next);
    } else if (previous) {
      this.emit('disconnected', previous);
    }
  }

  async connectSerial() {
    if (this.port && this.port.isOpen) return;
    let SerialPort;
    let ReadlineParser;
    try {
      ({ SerialPort, ReadlineParser } = require('serialport'));
    } catch (error) {
      this.emit('error', new Error(`serialport dependency unavailable: ${error.message}`));
      return;
    }

    const devicePath = await this.findPath(SerialPort);
    if (!devicePath) return;
    this.log(`connecting to ${devicePath}`);
    const port = new SerialPort({ path: devicePath, baudRate: 115200, autoOpen: false });
    this.port = port;
    port.open((error) => {
      if (error) {
        this.emit('error', error);
        if (this.port === port) this.port = null;
        this.updateConnection();
        return;
      }
      this.log(`USB device connected: ${devicePath}`);
      this.updateConnection();
    });
    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
    parser.on('data', (line) => this.handleDeviceLine(line, 'usb'));
    port.on('close', () => {
      if (this.port === port) this.port = null;
      this.updateConnection();
    });
    port.on('error', (error) => this.emit('error', error));
  }

  connectBle() {
    if (this.stopping || this.config.bluetooth?.enabled === false || this.bleProcess) return;
    const helper = this.config.bluetooth?.helper;
    if (!helper) return;
    const child = this.spawn(helper, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.bleProcess = child;
    this.bleStatus = 'starting';
    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', (line) => this.handleBleEnvelope(line));
    child.stderr.on('data', (data) => {
      const message = data.toString('utf8').trim();
      if (message) this.emit('warning', `BLE helper: ${message.slice(0, 200)}`);
    });
    child.on('error', (error) => this.emit('error', new Error(`BLE helper failed: ${error.message}`)));
    child.on('close', (code, signal) => {
      if (this.bleProcess === child) this.bleProcess = null;
      this.bleConnected = false;
      this.bleStatus = this.stopping ? 'stopped' : 'restarting';
      this.updateConnection();
      if (!this.stopping && code && signal !== 'SIGTERM') {
        this.emit('warning', `BLE helper exited with code ${code}`);
      }
    });
  }

  handleBleEnvelope(line) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      this.emit('warning', `ignored invalid BLE helper line: ${line.slice(0, 100)}`);
      return;
    }
    if (event.event === 'connected') {
      this.bleConnected = true;
      this.bleStatus = 'connected';
      this.log(`BLE device connected: ${event.name || 'Codex Cardputer'}`);
      this.updateConnection();
    } else if (event.event === 'disconnected' || event.event === 'unavailable') {
      this.bleConnected = false;
      this.bleStatus = event.event;
      this.updateConnection();
    } else if (event.event === 'scanning' || event.event === 'connecting') {
      this.bleStatus = event.event;
    } else if (event.event === 'message') {
      this.handleDeviceLine(event.line, 'ble');
    } else if (event.event === 'error') {
      this.bleStatus = 'error';
      this.emit('warning', `BLE: ${event.message || 'unknown error'}`);
    }
  }

  handleDeviceLine(line, transport) {
    try {
      this.emit('message', JSON.parse(line), transport);
    } catch {
      this.emit('warning', `ignored invalid ${transport} device line: ${String(line).slice(0, 100)}`);
    }
  }

  start() {
    this.stopping = false;
    this.connectSerial();
    this.connectBle();
    this.connectTimer = setInterval(() => {
      this.connectSerial();
      this.connectBle();
    }, 2000);
  }

  stop() {
    this.stopping = true;
    if (this.connectTimer) clearInterval(this.connectTimer);
    this.connectTimer = null;
    if (this.port && this.port.isOpen) this.port.close();
    if (this.bleProcess) this.bleProcess.kill('SIGTERM');
  }

  send(message, transport = this.transport) {
    const line = `${JSON.stringify({ v: 1, ...message })}\n`;
    if (transport === 'usb' && this.port?.isOpen) {
      this.port.write(line);
      return true;
    }
    if (transport === 'ble' && this.bleConnected && this.bleProcess?.stdin?.writable) {
      this.bleProcess.stdin.write(line);
      return true;
    }
    return false;
  }

  get transport() {
    if (this.port && this.port.isOpen) return 'usb';
    if (this.bleConnected && this.bleProcess) return 'ble';
    return null;
  }

  get connected() { return Boolean(this.transport); }
}

module.exports = { CardputerDevice };
