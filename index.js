var I2c = require('i2c'),
  cmds = require('./commands');

var DS2482 = function(address, options) {
  options = options || {};

  this.i2c = new I2c(0x18 | (address & 0x03), {
    device: options.device || '/dev/i2c-1',
    debug: options.debug || false
  });
};

DS2482.prototype.init = function(callback) {
  this.resetBridge(callback);
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

      that.i2c.readByte(function(err, resp) {
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

  if (reg) {
    this.i2c.writeBytes(cmds.SET_READ_POINTER, [reg], function(err) {
      if (err) { return callback(err); }

      that.i2c.readByte(callback);
    });

  } else {
    this.i2c.readByte(callback);
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
