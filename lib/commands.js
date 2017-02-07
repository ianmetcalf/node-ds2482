'use strict';

/*
 * Command: Device Reset
 * Parameters: None
 * Description: Performs a global reset of device state machine logic, which in turn selects
 *   IO0 as the active 1-Wire channel. Terminates any ongoing 1-Wire communication.
 * Typical Use: Device initialization after power-up; re-initialization (reset) as desired.
 * Restriction: None (can be executed at any time)
 * Error Response: None
 * Command Duration: Maximum 525ns, counted from falling SCL edge of the command code
 *   acknowledge bit.
 * 1-Wire Activity: Ends maximum 262.5ns after the falling SCL edge of the command code
 *   acknowledge bit.
 * Read Pointer Position: Status Register (for busy polling)
 * Status Bits Affected: RST set to 1, 1WB, PPD, SD, SBR, TSB, DIR set to 0
 * Configuration Bits Affected: 1WS, APU, SPU set to 0
 *
 */

exports.DEVICE_RESET = 0xF0;

/*
 * Command: Set Read Pointer
 * Parameters: Pointer Code
 * Description: Sets the read pointer to the specified register. Overwrites the read pointer
 *   position of any 1-Wire communication command in progress.
 * Typical Use: To prepare reading the result from a 1-Wire Byte command; random read access
 *   of registers.
 * Restriction: None (can be executed at any time)
 * Error Response: If the pointer code is not valid, the pointer code will not be acknowledged
 *   and the command will be ignored.
 * Command Duration: None; the read pointer is updated on the rising SCL edge of the pointer
 *   code acknowledge bit.
 * 1-Wire Activity: Not Affected
 * Read Pointer Position: As Specified by the Pointer Code
 * Status Bits Affected: None
 * Configuration Bits Affected: None
 *
 */

exports.SET_READ_POINTER = 0xE1;

exports.REGISTERS = {
  STATUS: 0xF0,
  DATA: 0xE1,
  CHANNEL: 0xD2,
  CONFIG: 0xC3,
};

exports.STATUS = {
  BUSY: (1 << 0),
  PRESENCE: (1 << 1),
  SHORT: (1 << 2),
  LOGIC_LEVEL: (1 << 3),
  RESET: (1 << 4),
  SINGLE_BIT: (1 << 5),
  TRIPLE_BIT: (1 << 6),
  BRANCH_DIR: (1 << 7),
};

exports.CONFIG = {
  ACTIVE: (1 << 0),
  STRONG: (1 << 2),
  OVERDRIVE: (1 << 3),
};

/*
 * Command: Write Configuration
 * Parameters: Configuration Byte
 * Description: Writes a new configuration byte. The new settings take effect immediately.
 *   NOTE: When writing to the Configuration Register, the new data is accepted only if the
 *   upper nibble (bits 7 to 4) is the one's complement of the lower nibble (bits 3 to 0).
 *   When read, the upper nibble is always 0h.
 * Typical Use: Defining the features for subsequent 1-Wire communication.
 * Restriction: 1-Wire activity must have ended before the DS2482 can process this command.
 * Error Response: Command code and parameter will not be acknowledged if 1WB = 1 at the time
 *   the command code is received and the command will be ignored.
 * Command Duration: None; the configuration register is updated on the rising SCL edge of the
 *   configuration byte acknowledge bit.
 * 1-Wire Activity: None
 * Read Pointer Position: Configuration Register (to verify write)
 * Status Bits Affected: RST set to 0
 * Configuration Bits Affected: 1WS, SPU, APU updated
 */

exports.WRITE_CONFIG = 0xD2;

/*
 * Command: Channel Select
 * Parameters: Selection Code
 * Description: Sets the 1-Wire IO channel for subsequent 1-Wire communication commands.
 *   NOTE: The selection code read back is different from the code written. See the table
 *   below for the respective values.
 * Typical Use: Selecting a 1-Wire IO channel other that IO0; randomly selecting one of the
 *   available 1-Wire IO channels.
 * Restriction: 1-Wire activity must have ended before the DS2482 can process this command.
 * Error Response: Command code and parameter will not be acknowledged if 1WB = 1 at the time
 *   the command code is received and the command will be ignored.  If the selection code is
 *   not valid, the selection code will not be acknowledged and the command will be ignored.
 * Command Duration: None; the channel selection register is updated on the rising SCL edge
 *   of the selection code acknowledge bit.
 * 1-Wire Activity: None
 * Read Pointer Position: Channel Selection Register (to verify write)
 * Status Bits Affected: None
 * Configuration Bits Affected: None
 */

exports.CHANNEL_SELECT = 0xC3;

exports.SELECTION_CODES = [
  {write: 0xF0, read: 0xB8},
  {write: 0xE1, read: 0xB1},
  {write: 0xD2, read: 0xAA},
  {write: 0xC3, read: 0xA3},
  {write: 0xB4, read: 0x9C},
  {write: 0xA5, read: 0x95},
  {write: 0x96, read: 0x8E},
  {write: 0x87, read: 0x87},
];

/*
 * Command: 1-Wire Reset
 * Parameters: None
 * Description: Generates a 1-Wire Reset/Presence Detect cycle (Figure 4) at the selected IO
 *   channel. The state of the 1-Wire line is sampled at tSI and tMSP and the result is
 *   reported to the host processor through the status register, bits PPD and SD.
 * Typical Use: To initiate or end any 1-Wire communication sequence.
 * Restriction: 1-Wire activity must have ended before the DS2482 can process this command.
 *   Strong pullup (see SPU bit) should not be used in conjunction with the 1-Wire Reset
 *   command. If SPU is enabled, the PPD bit may not be valid and may cause a violation of
 *   the device's absolute maximum rating.
 * Error Response:  Command code will not be acknowledged if 1WB = 1 at the time the command
 *   code is received and the command will be ignored.
 * Command Duration: tRSTL + tRSTH + maximum 262.5ns, counted from the falling SCL edge of
 *   the command code acknowledge bit.
 * 1-Wire Activity: Begins maximum 262.5ns after the falling SCL edge of the command code
 *   acknowledge bit.
 * Read Pointer Position: Status Register (for busy polling)
 * Status Bits Affected: 1WB (set to 1 for tRSTL + tRSTH), PPD is updated at tRSTL + tMSP,
 *   SD is updated at tRSTL + tSI
 * Configuration Bits Affected: 1WS, APU, SPU apply
 */

exports.ONE_WIRE_RESET = 0xB4;

/*
 * Command: 1-Wire Single Bit
 * Parameters: Bit Byte
 * Description: Generates a single 1-Wire time slot with a bit value ‘V’ as specified by the
 *   bit byte at the selected 1-Wire IO channel. A ‘V’ value of 0b will generate a write-zero
 *   time slot (Figure 5), a value of 1b will generate a write one slot, which also functions
 *   as a read data time slot (Figure 6). In either case the logic level at the 1-Wire line is
 *   tested at tMSR and SBR is updated.
 * Typical Use: To perform single bit writes or reads on a 1-Wire IO channel when single bit
 *   communication is necessary (the exception).
 * Restriction: 1-Wire activity must have ended before the DS2482 can process this command.
 * Error Response: Command code and bit byte will not be acknowledged if 1WB = 1 at the time
 *   the command code is received and the command will be ignored.
 * Command Duration: tSLOT + maximum 262.5ns, counted from the falling SCL edge of the first
 *   bit (MS bit) of the bit byte.
 * 1-Wire Activity: Begins maximum 262.5ns after the falling SCL edge of the MS bit of the
 *   bit byte.
 * Read Pointer Position: Status Register (for busy polling and data reading)
 * Status Bits Affected: 1WB (set to 1 for tSLOT), SBR is updated at tMSR,
 *   DIR (may change its state)
 * Configuration Bits Affected: 1WS, APU, SPU apply
 */

exports.ONE_WIRE_SINGLE_BIT = 0x87;

/*
 * Command: 1-Wire Write Byte
 * Parameters: Data Byte
 * Description: Writes single data byte to selected 1-Wire IO channel.
 * Typical Use: To write commands or data to a 1-Wire IO channel; equivalent to executing
 *   eight 1-Wire Single Bit commands, but faster due to less I2C traffic.
 * Restriction: 1-Wire activity must have ended before the DS2482 can process this command.
 * Error Response: Command code and data byte will not be acknowledged if 1WB = 1 at the time
 *   the command code is received and the command will be ignored.
 * Command Duration: 8 × tSLOT + maximum 262.5ns, counted from falling edge of the last bit
 *   (LS bit) of the data byte.
 * 1-Wire Activity: Begins maximum 262.5ns after falling SCL edge of the LS bit of the data
 *   byte (i.e., before the data byte acknowledge). NOTE: The bit order on the I2 C bus and
 *   the 1-Wire line is different.(1-Wire: LS-bit first; I2 C: MS-bit first) Therefore,
 *   1-Wire activity cannot begin before the DS2482 has received the full data byte.
 * Read Pointer Position: Position Status Register (for busy polling)
 * Status Bits Affected: 1WB (set to 1 for 8 × tSLOT)
 * Configuration Bits Affected: 1WS, SPU, APU apply
 */

exports.ONE_WIRE_WRITE_BYTE = 0xA5;

/*
 * Command: 1-Wire Read Byte
 * Parameters: None
 * Description: Generates eight read data time slots on the selected 1-Wire IO channel and
 *   stores result in the Read Data Register.
 * Typical Use: To read data from a 1-Wire IO channel; equivalent to executing eight 1-Wire
 *   Single Bit commands with V = 1 (write 1 time slot), but faster due to less I2C traffic.
 * Restriction: 1-Wire activity must have ended before the DS2482 can process this command.
 * Error Response: Command code will not be acknowledged if 1WB = 1 at the time the command
 *   code is received and the command will be ignored.
 * Command Duration: 8 × tSLOT + maximum 262.5ns, counted from the falling SCL edge of the
 *   command code acknowledge bit.
 * 1-Wire Activity: Begins maximum 262.5ns after the falling SCL edge of the command code
 *   acknowledge bit.
 * Read Pointer Position: Status Register (for busy polling)
 *   NOTE: To read the data byte received from the 1-Wire IO channel, issue the Set Read
 *   Pointer command and select the Read Data Register. Then access the DS2482 in read mode.
 * Status Bits Affected: 1WB (set to 1 for 8 × tSLOT)
 * Configuration Bits Affected: 1WS, APU apply
 */

exports.ONE_WIRE_READ_BYTE = 0x96;

/*
 * Command: 1-Wire Triplet
 * Parameters: Direction Byte
 * Description: Generates three times slots, two read-time slots and one-write time slot, at
 *   the selected 1-Wire IO channel. The type of write-time slot depends on the result of the
 *   read-time slots and the direction byte. The direction byte determines the type of
 *   write-time slot if both read-time slots are 0 (a typical case). In this case the DS2482
 *   will generate a write-1 time slot if V = 1 and a write-0 time slot if V = 0.
 *   If the read-time slots are 0 and 1, there will follow a write 0 time slot.
 *   If the read-time slots are 1 and 0, there will follow a write 1 time slot.
 *   If the read-time slots are both 1 (error case), the subsequent write time slot will
 *   be a write 1.
 * Typical Use: To perform a 1-Wire Search ROM sequence; a full sequence requires this command
 *   to be executed 64 times to identify and address one device.
 * Restriction: 1-Wire activity must have ended before the DS2482 can process this command.
 * Error Response: Command code and direction byte will not be acknowledged if 1WB = 1 at the
 *   time the command code is received and the command will be ignored.
 * Command Duration: 3 × tSLOT + maximum 262.5ns, counted from the falling SCL edge of the
 *   first bit (MS bit) of the direction byte.
 * 1-Wire Activity: Begins maximum 262.5ns after the falling SCL edge of the MS bit of the
 *   direction byte.
 * Read Pointer Position: Status Register (for busy polling)
 * Status Bits Affected: 1WB (set to 1 for 3 × tSLOT), SBR is updated at the first tMSR,
 *   TSB and DIR are updated at the second tMSR (i.e., at tSLOT + tMSR)
 * Configuration Bits Affected: 1WS, APU apply
 */

exports.ONE_WIRE_TRIPLET = 0x78;

/*
 * Command: Search ROM
 * Description: When a system is initially powered up, the master must identify the ROM
 *   codes of all slave devices on the bus, which allows the master to determine the number
 *   of slaves and their device types. The master learns the ROM codes through a process of
 *   elimination that requires the master to perform a Search ROM cycle (i.e., Search ROM
 *   command followed by data exchange) as many times as necessary to identify all of the
 *   slave devices. If there is only one slave on the bus, the simpler Read ROM command
 *   (see below) can be used in place of the Search ROM process.
 */

exports.ONE_WIRE_SEARCH_ROM = 0xF0;

/*
 * Command: Read ROM
 * Description: This command can only be used when there is one slave on the bus. It allows
 *   the bus master to read the slave’s 64-bit ROM code without using the Search ROM
 *   procedure. If this command is used when there is more than one slave present on the bus,
 *   a data collision will occur when all the slaves attempt to respond at the same time.
 */

exports.ONE_WIRE_READ_ROM = 0x33;

/*
 * Command: Match ROM
 * Description: The match ROM command followed by a 64-bit ROM code sequence allows the bus
 *   master to address a specific slave device on a multidrop or single-drop bus. Only the
 *   slave that exactly matches the 64-bit ROM code sequence will respond to the function
 *   command issued by the master; all other slaves on the bus will wait for a reset pulse.
 */

exports.ONE_WIRE_MATCH_ROM = 0x55;

/*
 * Command: Skip ROM
 * Description: The master can use this command to address all devices on the bus
 *   simultaneously without sending out any ROM code information. If more than one slave
 *   is present on the bus and, for example, a read command is issued following the Skip
 *   ROM command, data collision occurs on the bus as multiple slaves transmit simultaneously.
 */

exports.ONE_WIRE_SKIP_ROM = 0xCC;
