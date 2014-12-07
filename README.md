# DS2482

Provides an interface for the Dallas DS2482 onewire bridge

# Install

```
$ npm install ds2482
```

# Usage

```js
var DS2482 = require('ds2482');

var bridge = new DS2482();

bridge.init(function(err) {
  if (err) { throw err; }

  bridge.search(function(err, resp) {
    if (err) { throw err; }

    console.log(resp); // Returns a list of ROM addresses as hex encoded strings
  });
});
```

# API

### new DS2482([options])
Creates an interface for a Dallas DS2482 i2c to onewire bridge chip

- `options.address` the i2c address of the bridge chip, default: `0x18`
- `options.device` the location of the i2c interface, default: `/dev/i2c-1`

### bridge.init(callback)

_Alias:_ `bridge.reset`

Resets the bridge chip and any onewire devices connected to it

### bridge.sendCommand(command [, rom], callback)
Sends a command to a onewire device if specified or all onewire devices if omitted

- `command` the command to send as an unsigned integer
- `rom` the ROM address of the device to send the command to as a 16 character hex encoded string

### bridge.search(callback)
Searches the bus for all onewire devices and returns a list of ROM addresses as hex encoded strings

```js
[
  "2826274402000012",
  "2889075f0200003e",
  "3ae9f412000000a6"
]
```

### bridge.searchByFamily(family, callback)
Searches the bus for all onewire devices of a particular family and returns a list of ROM addresses as hex encoded strings

- `family` the family to search as either an unsigned integer or 2 character hex encoded string

```js
[
  "2826274402000012",
  "2889075f0200003e"
]
```

### bridge.searchROM(callback)
Searches the bus for the next onewire device and returns the ROM address as a hex encoded string

```js
"2826274402000012"
```

### bridge.readROM(callback)
Reads the ROM address of the single onewire device and returns it as a hex encoded string

__NOTE:__ Will return a `CRC mismatch` error if multiple devices are on the bus

### bridge.matchROM(rom, callback)
Selects a single onewire device to send a command to

- `rom` the ROM address of the device to select as a 16 character hex encoded string

### bridge.skipROM(callback)
Selects all onewire devices to send a command to

__NOTE:__ Can only be used for commands that don't return a response
