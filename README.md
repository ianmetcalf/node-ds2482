# DS2482 Onewire Bridge

[![Gitter](https://badges.gitter.im/Join Chat.svg)](https://gitter.im/ianmetcalf/node-ds2482?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

Provides an interface for the Dallas DS2482 onewire bridge

# Install

```
$ npm install ds2482
```

# Usage

```js
const DS2482 = require('ds2482');

const wire = new DS2482();

wire.init()
.then(() => wire.search())

.then(found => {
  console.log(found); // Returns a list of ROM addresses as hex encoded strings
})

.catch(err => {
  console.error(err);
});
```

# API

### new DS2482([options])
Creates an interface for a Dallas DS2482 i2c to onewire bridge chip

__Options:__
- `i2c` an instance of [i2c](https://github.com/kelly/node-i2c)
- `address` the i2c address of the bridge chip, default: `0x18`
- `device` the location of the i2c interface, default: `/dev/i2c-1`

---

### wire.init() _alias: wire.reset()_
Resets the bridge chip and any onewire devices connected to it

__Returns:__ `Promise <Uint8>` resolves with status register

---

### wire.configureBridge([options])
Configures the onewire interface for subsequent communication

__Options:__
- `activePullup` controls whether to use active or passive pullup
- `strongPullup` enables strong pullup __only__ after next command then resets
- `overdrive` enable overdrive speed for the bridge chip

__Returns:__ `Promise <Uint8>` resolves with configuration register

---

### wire.selectChannel([channel])
Select the onewire channel to use for subsequent commands

_Note:_ Only for use with `DS2482-800`

__Arguments:__
- `channel` channel to select, defaults to 0

__Returns:__ `Promise <Uint8>` resolves with channel selection register

---

### wire.sendCommand(command [, rom])
Sends a command to a onewire device if specified or all onewire devices if omitted

__Arguments:__
- `command` command to send as an unsigned integer
- `rom` optional ROM address of the device to send the command to as a 16 character hex encoded string

__Returns:__ `Promise <Uint8>` resolves with status register

---

### wire.search()
Searches the bus for all onewire devices and returns a list of ROM addresses as hex encoded strings

__Returns:__ `Promise <String[]>` resolves with list of roms

```js
[
  "2826274402000012",
  "2889075f0200003e",
  "3ae9f412000000a6"
]
```

---

### wire.searchByFamily(family)
Searches the bus for all onewire devices of a particular family and returns a list of ROM addresses as hex encoded strings

__Arguments:__
- `family` the family to search as either an unsigned integer or 2 character hex encoded string

__Returns:__ `Promise <String[]>` resolves with list of roms

```js
[
  "2826274402000012",
  "2889075f0200003e"
]
```

---

### wire.searchROM()
Searches the bus for the next onewire device and returns the ROM address as a hex encoded string

__Returns:__ `Promise <String>` resolves with rom

```js
"2826274402000012"
```

---

### wire.readROM()
Reads the ROM address of the single onewire device and returns it as a hex encoded string

_NOTE:_ Will return a `CRC mismatch` error if multiple devices are on the bus

__Returns:__ `Promise <String>` resolves with rom

---

### wire.matchROM(rom)
Selects a single onewire device to send a command to

__Arguments:__
- `rom` the ROM address of the device to select as a 16 character hex encoded string

__Returns:__ `Promise <Uint8>` resolves with status register

---

### wire.skipROM()
Selects all onewire devices to send a command to

_NOTE:_ Can only be used for commands that don't return a response

__Returns:__ `Promise <Uint8>` resolves with status register

---

### wire.writeData(data)
Writes one or more bytes to the onewire bus

__Arguments:__
- `data` a single byte, array of bytes or data buffer to be written out

__Returns:__ `Promise <Uint8>` resolves with status register

---

### wire.readData(size)
Reads one or more bytes from the onewire bus and returns a data buffer

__Arguments:__
- `size` number of bytes to be read in

__Returns:__ `Promise <Buffer>` resolves with data buffer

---

### DS2482.checkCRC(buffer)
Checks that the crc in the last byte matches the rest of the buffer

__Arguments:__
- `buffer` the data buffer to be checked

__Returns:__ `Boolean`
