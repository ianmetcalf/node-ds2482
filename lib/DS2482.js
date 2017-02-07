'use strict';

const I2c = require('i2c');
const cmds = require('./commands');
const utils = require('./utils');

const ROM_SIZE = 8;

class DS2482 {
  constructor(options) {
    options = options || {};

    this.i2c = options.i2c || new I2c(0x18 | (options.address & 0x03), {
      device: options.device || '/dev/i2c-1',
    });

    this.channel = null;
  }

  /*
   * Main API
   */

  init(callback) {
    this.reset(callback);
  }

  reset(callback) {
    const that = this;

    this.lastFound = null;
    this.lastConflict = 0;

    this._resetBridge(err => {
      if (err) return callback(err);

      that._resetWire(callback);
    });
  }

  sendCommand(cmd, rom, callback) {
    const that = this;

    if (typeof rom === 'function') {
      callback = rom;
      rom = null;
    }

    function send(err) {
      if (err) return callback(err);

      that.writeData(cmd, callback);
    }

    if (rom) {
      this.matchROM(rom, send);
    } else {
      this.skipROM(send);
    }
  }

  search(callback) {
    const that = this;

    this.lastFound = null;
    this.lastConflict = 0;

    function next(memo) {
      that.searchROM((err, resp) => {
        if (err) return callback(err);

        memo = memo.concat(resp);

        if (that.lastConflict) {
          next(memo);
        } else {
          callback(null, memo);
        }
      });
    }

    next([]);
  }

  searchByFamily(family, callback) {
    const that = this;

    if (typeof family === 'string') {
      family = parseInt(family, 16);
    }

    this.lastFound = Buffer.from([family, 0, 0, 0, 0, 0, 0, 0]);
    this.lastConflict = 64;

    function next(memo) {
      that.searchROM((err, resp) => {
        if (err) return callback(err);

        if (that.lastFound.readUInt8(0) === family) {
          memo = memo.concat(resp);
        }

        if (that.lastConflict > 7 && memo.length) {
          next(memo);
        } else {
          that.lastConflict = 0;
          callback(null, memo);
        }
      });
    }

    next([]);
  }

  /*
   * Onewire ROM API
   */

  searchROM(callback) {
    const rom = Buffer.alloc(ROM_SIZE);
    const that = this;

    this._resetWire(err => {
      if (err) return callback(err);

      that.writeData(cmds.ONE_WIRE_SEARCH_ROM, err => {
        if (err) return callback(err);

        function search(offset, mask, bit, conflict) {
          let part = rom.readUInt8(offset);
          let sbr, tsb, dir;

          if (that.lastFound && bit < that.lastConflict) {
            dir = (that.lastFound.readUInt8(offset) & mask);
          } else if (bit === that.lastConflict) {
            dir = 1;
          } else {
            dir = 0;
          }

          that.triplet(dir, (err, resp) => {
            if (err) return callback(err);

            sbr = (resp & cmds.STATUS.SINGLE_BIT);
            tsb = (resp & cmds.STATUS.TRIPLE_BIT);
            dir = (resp & cmds.STATUS.BRANCH_DIR);

            if (sbr && tsb) {
              return callback(new Error('Bad search result'));
            }

            if (!sbr && !tsb && !dir) {
              conflict = bit;
            }

            part = dir ? part | mask : part & ~mask;
            rom.writeUInt8(part, offset);
            mask <<= 1;

            if (mask > 128) {
              offset += 1;
              mask = 0x01;
            }

            if (offset < rom.length) {
              search(offset, mask, bit + 1, conflict);
            } else if (rom[0] === 0) {
              callback(new Error('ROM invalid'));
            } else if (!utils.checkCRC(rom)) {
              callback(new Error('CRC mismatch'));
            } else {
              that.lastFound = rom;
              that.lastConflict = conflict;
              callback(null, rom.toString('hex'));
            }
          });
        }

        search(0, 0x01, 0, 0);
      });
    });
  }

  readROM(callback) {
    const that = this;

    this._resetWire(err => {
      if (err) return callback(err);

      that.writeData(cmds.ONE_WIRE_READ_ROM, err => {
        if (err) return callback(err);

        that.readData(ROM_SIZE, (err, rom) => {
          if (err) return callback(err);

          if (rom[0] === 0) {
            callback(new Error('ROM invalid'));
          } else if (!utils.checkCRC(rom)) {
            callback(new Error('CRC mismatch'));
          } else {
            callback(null, rom.toString('hex'));
          }
        });
      });
    });
  }

  matchROM(rom, callback) {
    const that = this;

    if (typeof rom === 'string') {
      rom = Buffer.from(rom, 'hex');
    }

    if (rom[0] === 0 || rom.length !== ROM_SIZE) {
      return callback(new Error('ROM invalid'));
    }

    this._resetWire(err => {
      if (err) return callback(err);

      that.writeData(cmds.ONE_WIRE_MATCH_ROM, err => {
        if (err) return callback(err);

        that.writeData(rom, callback);
      });
    });
  }

  skipROM(callback) {
    const that = this;

    this._resetWire(err => {
      if (err) return callback(err);

      that.writeData(cmds.ONE_WIRE_SKIP_ROM, callback);
    });
  }

  /*
   * Onewire read/write API
   */

  writeData(data, callback) {
    const that = this;

    if (!(data instanceof Buffer)) {
      data = Buffer.from(Array.isArray(data) ? data : [data]);
    }

    function write(offset) {
      that.i2c.writeBytes(cmds.ONE_WIRE_WRITE_BYTE, data.slice(offset, offset + 1), err => {
        if (err) return callback(err);

        that._wait(false, (err, resp) => {
          if (err) return callback(err);

          offset += 1;

          if (offset < data.length) {
            write(offset);
          } else {
            callback(null, resp);
          }
        });
      });
    }

    this._wait(true, err => {
      if (err) return callback(err);

      write(0);
    });
  }

  readData(size, callback) {
    const data = Buffer.alloc(size);
    const that = this;

    function read(offset) {
      that.i2c.writeByte(cmds.ONE_WIRE_READ_BYTE, err => {
        if (err) return callback(err);

        that._wait(false, err => {
          if (err) return callback(err);

          that._readBridge(cmds.REGISTERS.DATA, (err, resp) => {
            if (err) return callback(err);

            data.writeUInt8(resp, offset);
            offset += 1;

            if (offset < data.length) {
              read(offset);
            } else {
              callback(null, data);
            }
          });
        });
      });
    }

    this._wait(true, err => {
      if (err) return callback(err);

      read(0);
    });
  }

  bit(setHigh, callback) {
    const that = this;

    if (typeof setHigh === 'function') {
      callback = setHigh;
      setHigh = true;
    }

    this._wait(true, err => {
      if (err) return callback(err);

      that.i2c.writeBytes(cmds.ONE_WIRE_SINGLE_BIT, [setHigh ? 0x80 : 0], err => {
        if (err) return callback(err);

        that._wait(false, (err, resp) => {
          if (err) return callback(err);

          callback(null, resp & cmds.STATUS.SINGLE_BIT ? 1 : 0);
        });
      });
    });
  }

  triplet(direction, callback) {
    const that = this;

    if (typeof direction === 'function') {
      callback = direction;
      direction = 0;
    }

    this._wait(true, err => {
      if (err) return callback(err);

      that.i2c.writeBytes(cmds.ONE_WIRE_TRIPLET, [direction ? 0x80 : 0], err => {
        if (err) return callback(err);

        that._wait(false, callback);
      });
    });
  }

  configureBridge(config, callback) {
    const data = ((~config & 0x0F) << 4) | (config & 0x0F);
    const that = this;

    this._wait(true, err => {
      if (err) return callback(err);

      that.i2c.writeBytes(cmds.WRITE_CONFIG, [data], err => {
        if (err) return callback(err);

        that._readBridge((err, resp) => {
          if (err) return callback(err);

          if (resp !== config) {
            callback(new Error('Failed to configure bridge'));
          } else {
            callback(null, resp);
          }
        });
      });
    });
  }

  /*
   * Private Methods
   */

  _resetBridge(callback) {
    const that = this;

    this.i2c.writeByte(cmds.DEVICE_RESET, err => {
      if (err) return callback(err);

      that._wait(false, (err, resp) => {
        if (err) return callback(err);

        that.channel = 0;

        callback(null, resp);
      });
    });
  }

  _resetWire(callback) {
    const that = this;

    this._wait(true, err => {
      if (err) return callback(err);

      that.i2c.writeByte(cmds.ONE_WIRE_RESET, err => {
        if (err) return callback(err);

        that._wait(false, (err, resp) => {
          if (err) return callback(err);

          if (resp & cmds.STATUS.SHORT) {
            callback(new Error('Detected onewire short'));
          } else if ((resp & cmds.STATUS.PRESENCE) === 0) {
            callback(new Error('Failed to detected any onewire devices'));
          } else {
            callback(null, resp);
          }
        });
      });
    });
  }

  _wait(setPointer, callback) {
    const start = Date.now();
    const that = this;

    if (typeof setPointer === 'function') {
      callback = setPointer;
      setPointer = true;
    }

    function check(err, resp) {
      if (err) return callback(err);

      if ((resp & cmds.STATUS.BUSY) === 0) {
        callback(null, resp);
      } else if (Date.now() - start < 20) {
        setTimeout(() => {
          that._readBridge(check);
        }, 0);
      } else {
        callback(new Error('Wait timeout'));
      }
    }

    this._readBridge(setPointer ? cmds.REGISTERS.STATUS : null, check);
  }

  _readBridge(reg, callback) {
    const that = this;

    if (typeof reg === 'function') {
      callback = reg;
      reg = null;
    }

    function read(err, resp) {
      if (err) return callback(err);

      callback(null, (resp >>> 0) & 0xFF);
    }

    if (reg) {
      this.i2c.writeBytes(cmds.SET_READ_POINTER, [reg], err => {
        if (err) return callback(err);

        that.i2c.readByte(read);
      });
    } else {
      this.i2c.readByte(read);
    }
  }
}

Object.assign(DS2482, {
  ROM_SIZE,
  checkCRC: utils.checkCRC,
});

module.exports = DS2482;
