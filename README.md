# DS2482 Onewire Bridge

[![Gitter](https://badges.gitter.im/Join Chat.svg)](https://gitter.im/ianmetcalf/node-ds2482?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

Provides an interface for the Dallas DS2482 onewire bridge

# Install

```
$ npm install ds2482
```

# Usage

```js
var DS2482 = require('ds2482');

var wire = new DS2482();

wire.init(function(err) {
  if (err) { throw err; }

  wire.search(function(err, resp) {
    if (err) { throw err; }

    console.log(resp); // Returns a list of ROM addresses as hex encoded strings
  });
});
```

# API

### DS2482.checkCRC(buffer)
Checks that the crc in the last byte matches the rest of the buffer

- `buffer` the data buffer to be checked

### new DS2482([options])
Creates an interface for a Dallas DS2482 i2c to onewire bridge chip

- `options.i2c` an instance of [i2c](https://github.com/kelly/node-i2c)
- `options.address` the i2c address of the bridge chip, default: `0x18`
- `options.device` the location of the i2c interface, default: `/dev/i2c-1`

### wire.init(callback)

_Alias:_ `wire.reset`

Resets the bridge chip and any onewire devices connected to it

### wire.sendCommand(command [, rom], callback)
Sends a command to a onewire device if specified or all onewire devices if omitted

- `command` the command to send as an unsigned integer
- `rom` the ROM address of the device to send the command to as a 16 character hex encoded string

### wire.search(callback)
Searches the bus for all onewire devices and returns a list of ROM addresses as hex encoded strings

```js
[
  "2826274402000012",
  "2889075f0200003e",
  "3ae9f412000000a6"
]
```

### wire.searchByFamily(family, callback)
Searches the bus for all onewire devices of a particular family and returns a list of ROM addresses as hex encoded strings

- `family` the family to search as either an unsigned integer or 2 character hex encoded string

```js
[
  "2826274402000012",
  "2889075f0200003e"
]
```

### wire.searchROM(callback)
Searches the bus for the next onewire device and returns the ROM address as a hex encoded string

```js
"2826274402000012"
```

### wire.readROM(callback)
Reads the ROM address of the single onewire device and returns it as a hex encoded string

__NOTE:__ Will return a `CRC mismatch` error if multiple devices are on the bus

### wire.matchROM(rom, callback)
Selects a single onewire device to send a command to

- `rom` the ROM address of the device to select as a 16 character hex encoded string

### wire.skipROM(callback)
Selects all onewire devices to send a command to

__NOTE:__ Can only be used for commands that don't return a response

### wire.writeData(data, callback)
Writes one or more bytes to the onewire bus

- `data` a single byte, array of bytes or data buffer to be written out

### wire.readData(size, callback)
Reads one or more bytes from the onewire bus and returns a data buffer

- `size` number of bytes to be read in
