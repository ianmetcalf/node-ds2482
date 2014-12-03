var I2c = require('i2c'),
  cmds = require('./commands');

var DS2482 = function(options) {
  options = options || {};

  this.i2c = new I2c(0x18 | (options.address & 0x03), {
    device: options.device || '/dev/i2c-1',
    debug: options.debug || false
  });
};

DS2482.prototype.init =
DS2482.prototype.reset = function(callback) {
  var that = this;

  this.lastFound = null;
  this.lastConflict = 0;

  this.resetBridge(function(err) {
    if (err) { return callback(err); }

    that.resetWire(callback);
  });
};

DS2482.prototype.sendCommand = function(cmd, rom, callback) {
  var that = this;

  if (typeof rom === 'function') {
    callback = rom;
    rom = null;
  }

  function send(err) {
    if (err) { return callback(err); }

    that.writeByte(cmd, callback);
  };

  rom ? this.matchROM(rom, send) : this.skipROM(send);
};

DS2482.prototype.search = function(callback) {
  var that = this;

  this.lastFound = null;
  this.lastConflict = 0;

  function next(memo) {
    that.searchROM(function(err, resp) {
      if (err) { return callback(err); }

      memo = memo.concat(resp);

      if (that.lastConflict) {
        next(memo);

      } else {
        callback(null, memo);
      }
    });
  }

  next([]);
};

DS2482.prototype.searchByFamily = function(family, callback) {
  var that = this;

  if (typeof family === 'string') {
    family = parseInt(family, 16);
  }

  this.lastFound = new Buffer([family, 0, 0, 0, 0, 0, 0, 0]);
  this.lastConflict = 64;

  function next(memo) {
    that.searchROM(function(err, resp) {
      if (err) { return callback(err); }

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
};

function updateCRC(crc, data) {
  crc = crc ^ data;

  for (var i = 0; i < 8; i++) {
    if (crc & 0x01) {
      crc = (crc >> 1) ^ 0x8C;
    } else {
      crc >>= 1;
    }
  }

  return crc;
}

DS2482.prototype.searchROM = function(callback) {
  var rom = new Buffer(8),
    crc = 0,
    that = this;

  this.resetWire(function(err) {
    if (err) { return callback(err); }

    that.writeByte(cmds.ONE_WIRE_SEARCH_ROM, function(err) {
      if (err) { return callback(err); }

      function search(offset, mask, bit, conflict) {
        var part = rom.readUInt8(offset),
          sbr, tsb, dir;

        if (that.lastFound && bit < that.lastConflict) {
          dir = (that.lastFound.readUInt8(offset) & mask);

        } else if (bit === that.lastConflict) {
          dir = 1;

        } else {
          dir = 0;
        }

        that.triplet(dir, function(err, resp) {
          if (err) { return callback(err); }

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
          mask = mask << 1;

          if (mask > 128) {
            crc = updateCRC(crc, part);
            offset += 1;
            mask = 0x01;
          }

          if (offset < rom.length) {
            search(offset, mask, bit + 1, conflict);

          } else if (crc !== 0 || rom[0] === 0) {
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
};

DS2482.prototype.readROM = function(callback) {
  var rom = new Buffer(8),
    crc = 0,
    that = this;

  this.resetWire(function(err) {
    if (err) { return callback(err); }

    that.writeByte(cmds.ONE_WIRE_READ_ROM, function(err) {
      if (err) { return callback(err); }

      function read(offset) {
        that.readByte(function(err, resp) {
          if (err) { return callback(err); }

          rom.writeUInt8(resp, offset);
          crc = updateCRC(crc, resp);
          offset += 1;

          if (offset < rom.length) {
            read(offset);

          } else if (crc !== 0 || rom[0] === 0) {
            callback(new Error('CRC mismatch'));

          } else {
            callback(null, rom.toString('hex'));
          }
        });
      }

      read(0);
    });
  });
};

DS2482.prototype.matchROM = function(rom, callback) {
  var that = this;

  if (typeof rom === 'string') {
    rom = new Buffer(rom, 'hex');
  }

  if (rom.length !== 8) {
    return callback(new Error('Invalid ROM'));
  }

  this.resetWire(function(err) {
    if (err) { return callback(err); }

    that.writeByte(cmds.ONE_WIRE_MATCH_ROM, function(err) {
      if (err) { return callback(err); }

      function write(offset) {
        that.writeByte(rom.readUInt8(offset), function(err, resp) {
          if (err) { return callback(err); }

          offset += 1;

          if (offset < rom.length) {
            write(offset);

          } else {
            callback(null, resp);
          }
        });
      }

      write(0);
    });
  });
};

DS2482.prototype.skipROM = function(callback) {
  var that = this;

  this.resetWire(function(err) {
    if (err) { return callback(err); }

    that.writeByte(cmds.ONE_WIRE_SKIP_ROM, callback);
  });
};

DS2482.prototype.resetWire = function(callback) {
  var that = this;

  this.wait(true, function(err) {
    if (err) { return callback(err); }

    that.i2c.writeByte(cmds.ONE_WIRE_RESET, function(err) {
      if (err) { return callback(err); }

      that.wait(false, function(err, resp) {
        if (err) { return callback(err); }

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
};

DS2482.prototype.writeByte = function(data, callback) {
  var that = this;

  this.wait(true, function(err) {
    if (err) { return callback(err); }

    that.i2c.writeBytes(cmds.ONE_WIRE_WRITE_BYTE, [data], function(err) {
      if (err) { return callback(err); }

      that.wait(false, callback);
    });
  });
};

DS2482.prototype.readByte = function(callback) {
  var that = this;

  this.wait(true, function(err) {
    if (err) { return callback(err); }

    that.i2c.writeByte(cmds.ONE_WIRE_READ_BYTE, function(err) {
      if (err) { return callback(err); }

      that.wait(false, function(err) {
        if (err) { return callback(err); }

        that.readBridge(cmds.REGISTERS.DATA, callback);
      });
    });
  });
};

DS2482.prototype.bit = function(setHigh, callback) {
  var that = this;

  if (typeof setHight === 'function') {
    callback = setHigh;
    setHigh = true;
  }

  this.wait(true, function(err) {
    if (err) { return callback(err); }

    that.i2c.writeBytes(cmds.ONE_WIRE_SINGLE_BIT, [setHigh ? 0x80 : 0], function(err) {
      if (err) { return callback(err); }

      that.wait(false, function(err, resp) {
        if (err) { return callback(err); }

        callback(null, resp & cmds.STATUS.SINGLE_BIT ? 1 : 0);
      });
    });
  });
};

DS2482.prototype.triplet = function(direction, callback) {
  var that = this;

  if (typeof direction === 'function') {
    callback = direction;
    direction = 0;
  }

  this.wait(true, function(err) {
    if (err) { return callback(err); }

    that.i2c.writeBytes(cmds.ONE_WIRE_TRIPLET, [direction ? 0x80 : 0], function(err) {
      if (err) { return callback(err); }

      that.wait(false, callback);
    });
  });
};

DS2482.prototype.resetBridge = function(callback) {
  var that = this;

  this.i2c.writeByte(cmds.DEVICE_RESET, function(err) {
    if (err) { return callback(err); }

    that.wait(false, function(err, resp) {
      if (err) { return callback(err); }

      that.channel = 0;

      callback(null, resp);
    });
  });
};

DS2482.prototype.configureBridge = function(config, callback) {
  var data = ((~config & 0x0F) << 4) | (config & 0x0F),
    that = this;

  this.wait(true, function(err) {
    if (err) { return callback(err); }

    that.i2c.writeBytes(cmds.WRITE_CONFIG, [data], function(err) {
      if (err) { return callback(err); }

      that.readBridge(function(err, resp) {
        if (err) { return callback(err); }

        if (resp !== config) {
          callback(new Error('Failed to configure bridge'));

        } else {
          callback(null, resp);
        }
      });
    });
  });
};

DS2482.prototype.readBridge = function(reg, callback) {
  var that = this;

  if (typeof reg === 'function') {
    callback = reg;
    reg = null;
  }

  function read(err, resp) {
    if (err) { return callback(err); }

    callback(null, (resp >>> 0) & 0xFF);
  }

  if (reg) {
    this.i2c.writeBytes(cmds.SET_READ_POINTER, [reg], function(err) {
      if (err) { return callback(err); }

      that.i2c.readByte(read);
    });

  } else {
    this.i2c.readByte(read);
  }
};

DS2482.prototype.wait = function(setPointer, callback) {
  var start = Date.now(),
    that = this;

  if (typeof setPointer === 'function') {
    callback = setPointer;
    setPointer = true;
  }

  function check(err, resp) {
    if (err) { return callback(err); }

    if ((resp & cmds.STATUS.BUSY) === 0) {
      callback(null, resp);

    } else if (Date.now() - start < 20) {
      setTimeout(function() {
        that.readBridge(check);
      }, 0);

    } else {
      callback(new Error('Timeout'));
    }
  }

  this.readBridge(setPointer ? cmds.REGISTERS.STATUS : null, check);
};

module.exports = DS2482;
