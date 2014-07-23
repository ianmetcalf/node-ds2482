var I2c = require('i2c'),
  cmds = require('./commands');

var DS2482 = function(address, options) {
  options = options || {};

  this.i2c = new I2c(0x18 | (address & 0x03), {
    device: options.device || '/dev/i2c-1',
    debug: options.debug || false
  });
};

module.exports = DS2482;
