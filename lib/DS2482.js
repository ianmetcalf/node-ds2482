'use strict';

const I2c = require('i2c');
const cmds = require('./commands');
const utils = require('./utils');

const ROM_SIZE = 8;

class DS2482 {
  constructor(options) {
    // eslint-disable-next-line no-param-reassign
    options = options || {};

    this.i2c = options.i2c || new I2c(0x18 | (options.address & 0x03), {
      device: options.device || '/dev/i2c-1',
    });

    this.channel = null;
  }

  /*
   * Main API
   */

  init() {
    return this.reset();
  }

  reset() {
    this.lastFound = null;
    this.lastConflict = 0;

    return this._resetBridge()
    .then(() => this._resetWire());
  }

  configureBridge(options) {
    let config = 0;

    if (options) {
      if (options.activePullup) config |= cmds.CONFIG.ACTIVE;
      if (options.strongPullup) config |= cmds.CONFIG.STRONG;
      if (options.overdrive) config |= cmds.CONFIG.OVERDRIVE;
    }

    return this._wait(true)
    .then(() => this._i2cWrite(cmds.WRITE_CONFIG, [((~config & 0x0F) << 4) | config]))
    .then(() => this._readBridge())
    .then(resp => {
      if (config !== resp) {
        throw new Error('Failed to configure bridge');
      }

      return resp;
    });
  }

  selectChannel(num) {
    const ch = cmds.SELECTION_CODES[num || 0];

    if (!ch) {
      return Promise.reject(new Error('Invalid channel'));
    }

    if (this.channel === num) {
      return Promise.resolve(ch.read);
    }

    return this._wait(true)
    .then(() => this.writeData(cmds.CHANNEL_SELECT, [ch.write]))
    .then(() => this._readBridge())
    .then(resp => {
      if (ch.read !== resp) {
        throw new Error('Failed to select channel');
      }

      this.channel = num;

      return resp;
    });
  }

  sendCommand(cmd, rom) {
    return (rom ? this.matchROM(rom) : this.skipROM())
    .then(() => this.writeData(cmd));
  }

  search() {
    this.lastFound = null;
    this.lastConflict = 0;

    const found = [];

    const searchNext = () => (
      this.searchROM().then(resp => {
        found.push(resp);

        if (this.lastConflict) {
          return searchNext();
        }

        this.lastFound = null;
        this.lastConflict = 0;

        return found;
      })
    );

    return searchNext();
  }

  searchByFamily(family) {
    if (typeof family === 'string') {
      // eslint-disable-next-line no-param-reassign
      family = parseInt(family, 16);
    }

    this.lastFound = Buffer.from([family, 0, 0, 0, 0, 0, 0, 0]);
    this.lastConflict = 64;

    const found = [];

    const searchNext = () => (
      this.searchROM().then(resp => {
        if (this.lastFound.readUInt8(0) === family) {
          found.push(resp);
        }

        if (this.lastConflict > 7 && found.length) {
          return searchNext();
        }

        this.lastFound = null;
        this.lastConflict = 0;

        return found;
      })
    );

    return searchNext();
  }

  /*
   * Onewire ROM API
   */

  searchROM() {
    const rom = Buffer.alloc(ROM_SIZE);

    let offset = 0;
    let mask = 0x01;
    let bit = 0;
    let lastConflict = 0;

    const direction = () => {
      if (this.lastFound && bit < this.lastConflict) {
        return this.lastFound.readUInt8(offset) & mask;
      }

      return bit === this.lastConflict ? 1 : 0;
    };

    const searchNextBit = () => (
      this.triplet(direction()).then(resp => {
        const sbr = (resp & cmds.STATUS.SINGLE_BIT);
        const tsb = (resp & cmds.STATUS.TRIPLE_BIT);
        const dir = (resp & cmds.STATUS.BRANCH_DIR);

        if (sbr && tsb) {
          throw new Error('Bad search result');
        }

        if (!sbr && !tsb && !dir) {
          lastConflict = bit;
        }

        const part = rom.readUInt8(offset);

        rom.writeUInt8(dir ? part | mask : part & ~mask, offset);

        mask <<= 1;
        bit += 1;

        if (mask > 128) {
          offset += 1;
          mask = 0x01;
        }

        if (offset < rom.length) {
          return searchNextBit();
        }

        if (rom[0] === 0) {
          throw new Error('ROM invalid');
        }

        if (!utils.checkCRC(rom)) {
          throw new Error('CRC mismatch');
        }

        this.lastFound = rom;
        this.lastConflict = lastConflict;

        return rom.toString('hex');
      })
    );

    return this._resetWire()
    .then(() => this.writeData(cmds.ONE_WIRE_SEARCH_ROM))
    .then(() => searchNextBit());
  }

  readROM() {
    return this._resetWire()
    .then(() => this.writeData(cmds.ONE_WIRE_READ_ROM))
    .then(() => this.readData(ROM_SIZE))
    .then(rom => {
      if (rom[0] === 0) {
        throw new Error('ROM invalid');
      }

      if (!utils.checkCRC(rom)) {
        throw new Error('CRC mismatch');
      }

      return rom.toString('hex');
    });
  }

  matchROM(rom) {
    if (typeof rom === 'string') {
      // eslint-disable-next-line no-param-reassign
      rom = Buffer.from(rom, 'hex');
    }

    if (rom[0] === 0 || rom.length !== ROM_SIZE) {
      return Promise.reject(new Error('ROM invalid'));
    }

    return this._resetWire()
    .then(() => this.writeData(cmds.ONE_WIRE_MATCH_ROM))
    .then(() => this.writeData(rom));
  }

  skipROM() {
    return this._resetWire()
    .then(() => this.writeData(cmds.ONE_WIRE_SKIP_ROM));
  }

  /*
   * Onewire read/write API
   */

  writeData(data) {
    if (!(data instanceof Buffer)) {
      // eslint-disable-next-line no-param-reassign
      data = Buffer.from(Array.isArray(data) ? data : [data]);
    }

    let offset = 0;

    const writeNextByte = () => (
      this._i2cWrite(cmds.ONE_WIRE_WRITE_BYTE, data.slice(offset, offset + 1))
      .then(() => this._wait())
      .then(resp => {
        offset += 1;

        if (offset < data.length) {
          return writeNextByte();
        }

        return resp;
      })
    );

    return this._wait(true).then(() => writeNextByte());
  }

  readData(size) {
    const data = Buffer.alloc(size);

    let offset = 0;

    const readNextByte = () => (
      this._i2cWrite(cmds.ONE_WIRE_READ_BYTE)
      .then(() => this._wait())
      .then(() => this._readBridge(cmds.REGISTERS.DATA))
      .then(resp => {
        data.writeUInt8(resp, offset);
        offset += 1;

        if (offset < data.length) {
          return readNextByte();
        }

        return data;
      })
    );

    return this._wait(true).then(() => readNextByte());
  }

  bit(setHigh) {
    return this._wait(true)
    .then(() => this._i2cWrite(cmds.ONE_WIRE_SINGLE_BIT, [setHigh ? 0x80 : 0]))
    .then(() => this._wait())
    .then(resp => (resp & cmds.STATUS.SINGLE_BIT ? 1 : 0));
  }

  triplet(dir) {
    return this._wait(true)
    .then(() => this._i2cWrite(cmds.ONE_WIRE_TRIPLET, [dir ? 0x80 : 0]))
    .then(() => this._wait());
  }

  /*
   * Private Methods
   */

  _resetBridge() {
    return this._i2cWrite(cmds.DEVICE_RESET)
    .then(() => this._wait())
    .then(resp => {
      this.channel = 0;

      return resp;
    });
  }

  _resetWire() {
    return this._wait(true)
    .then(() => this._i2cWrite(cmds.ONE_WIRE_RESET))
    .then(() => this._wait())
    .then(resp => {
      if (resp & cmds.STATUS.SHORT) {
        throw new Error('Detected onewire short');
      }

      if (!(resp & cmds.STATUS.PRESENCE)) {
        throw new Error('Failed to detected any onewire devices');
      }

      return resp;
    });
  }

  _wait(setPointer) {
    const checkBusy = reg => (
      this._readBridge(reg).then(resp => {
        if (resp & cmds.STATUS.BUSY) {
          return utils.delay(0).then(() => checkBusy());
        }

        return resp;
      })
    );

    return Promise.race([
      checkBusy(setPointer ? cmds.REGISTERS.STATUS : null),
      utils.delay(20).then(() => {
        throw new Error('Wait timeout');
      }),
    ]);
  }

  _readBridge(reg) {
    const read = () => (
      this._i2cRead().then(resp => (resp >>> 0) & 0xFF)
    );

    if (reg) {
      return this._i2cWrite(cmds.SET_READ_POINTER, [reg]).then(read);
    }

    return read();
  }

  _i2cWrite(cmd, bytes) {
    return new Promise((resolve, reject) => {
      if (bytes) {
        this.i2c.writeBytes(cmd, bytes, err => (err ? reject(err) : resolve()));
      } else {
        this.i2c.writeByte(cmd, err => (err ? reject(err) : resolve()));
      }
    });
  }

  _i2cRead() {
    return new Promise((resolve, reject) => {
      this.i2c.readByte((err, resp) => (err ? reject(err) : resolve(resp)));
    });
  }
}

Object.assign(DS2482, {
  ROM_SIZE,
  checkCRC: utils.checkCRC,
});

module.exports = DS2482;
