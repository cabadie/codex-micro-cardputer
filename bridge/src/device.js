const { EventEmitter } = require('node:events');

class CardputerDevice extends EventEmitter {
  constructor(config, log = console.log) {
    super();
    this.config = config;
    this.log = log;
    this.port = null;
    this.connectTimer = null;
  }

  async findPath(SerialPort) {
    if (this.config.serialPath) return this.config.serialPath;
    const ports = await SerialPort.list();
    const match = ports.find((port) =>
      (port.vendorId || '').toLowerCase() === '303a' || /usbmodem/i.test(port.path)
    );
    return match && match.path;
  }

  async connect() {
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
        return;
      }
      this.log(`device connected: ${devicePath}`);
      this.emit('connected', devicePath);
    });
    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
    parser.on('data', (line) => {
      try {
        this.emit('message', JSON.parse(line));
      } catch {
        this.emit('warning', `ignored invalid device line: ${line.slice(0, 100)}`);
      }
    });
    port.on('close', () => {
      if (this.port === port) this.port = null;
      this.emit('disconnected');
    });
    port.on('error', (error) => this.emit('error', error));
  }

  start() {
    this.connect();
    this.connectTimer = setInterval(() => this.connect(), 2000);
  }

  stop() {
    if (this.connectTimer) clearInterval(this.connectTimer);
    this.connectTimer = null;
    if (this.port && this.port.isOpen) this.port.close();
  }

  send(message) {
    if (!this.port || !this.port.isOpen) return false;
    this.port.write(`${JSON.stringify({ v: 1, ...message })}\n`);
    return true;
  }

  get connected() {
    return Boolean(this.port && this.port.isOpen);
  }
}

module.exports = { CardputerDevice };
