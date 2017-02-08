'use strict';

exports.checkCRC = buffer => {
  let crc = 0;

  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer.readUInt8(i);

    for (let j = 0; j < 8; j += 1) {
      if (crc & 0x01) {
        crc = (crc >> 1) ^ 0x8C;
      } else {
        crc >>= 1;
      }
    }
  }

  return (crc === 0);
};

exports.delay = duration => new Promise(resolve => setTimeout(resolve, duration));
