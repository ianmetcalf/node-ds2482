'use strict';

const expect = require('expect');
const DS2482 = require('../../lib/DS2482');

const i2c = {
  writeBytes() {},
  writeByte() {},
  readByte() {},
};

describe('DS2482', function () {
  it('instantiates', function () {
    expect(new DS2482({i2c})).toExist();
  });
});
