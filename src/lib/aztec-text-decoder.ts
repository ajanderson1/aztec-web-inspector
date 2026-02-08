/**
 * Aztec barcode text decoder
 *
 * Implements the Aztec encoding mode state machine to map raw codeword
 * values back to decoded characters. Based on the ZXing Decoder.java
 * tables and the ISO/IEC 24778 specification.
 *
 * The decoder processes codewords sequentially, tracking the current
 * encoding mode (UPPER/LOWER/MIXED/PUNCT/DIGIT) and handling shifts
 * (temporary) vs latches (permanent) between modes.
 */

// ---------------------------------------------------------------------------
// Mode types
// ---------------------------------------------------------------------------

export type AztecTextMode = 'UPPER' | 'LOWER' | 'MIXED' | 'PUNCT' | 'DIGIT';

// ---------------------------------------------------------------------------
// Table entry types (discriminated union)
// ---------------------------------------------------------------------------

export type TableEntry =
  | { readonly kind: 'char'; readonly value: string }
  | { readonly kind: 'shift'; readonly toMode: AztecTextMode }
  | { readonly kind: 'latch'; readonly toMode: AztecTextMode }
  | { readonly kind: 'binary-shift' }
  | { readonly kind: 'flg-n' };

function char(value: string): TableEntry {
  return { kind: 'char', value };
}

function shift(toMode: AztecTextMode): TableEntry {
  return { kind: 'shift', toMode };
}

function latch(toMode: AztecTextMode): TableEntry {
  return { kind: 'latch', toMode };
}

const BINARY_SHIFT: TableEntry = { kind: 'binary-shift' };
const FLG_N: TableEntry = { kind: 'flg-n' };

// ---------------------------------------------------------------------------
// Mode tables (from ZXing Decoder.java)
// ---------------------------------------------------------------------------

/** UPPER mode: 5-bit codewords. Space + A-Z + control codes. */
export const UPPER_TABLE: readonly TableEntry[] = [
  /* 0  */ shift('PUNCT'),    // P/S
  /* 1  */ char(' '),
  /* 2  */ char('A'),
  /* 3  */ char('B'),
  /* 4  */ char('C'),
  /* 5  */ char('D'),
  /* 6  */ char('E'),
  /* 7  */ char('F'),
  /* 8  */ char('G'),
  /* 9  */ char('H'),
  /* 10 */ char('I'),
  /* 11 */ char('J'),
  /* 12 */ char('K'),
  /* 13 */ char('L'),
  /* 14 */ char('M'),
  /* 15 */ char('N'),
  /* 16 */ char('O'),
  /* 17 */ char('P'),
  /* 18 */ char('Q'),
  /* 19 */ char('R'),
  /* 20 */ char('S'),
  /* 21 */ char('T'),
  /* 22 */ char('U'),
  /* 23 */ char('V'),
  /* 24 */ char('W'),
  /* 25 */ char('X'),
  /* 26 */ char('Y'),
  /* 27 */ char('Z'),
  /* 28 */ latch('LOWER'),    // L/L
  /* 29 */ latch('MIXED'),    // M/L
  /* 30 */ latch('DIGIT'),    // D/L
  /* 31 */ BINARY_SHIFT,      // B/S
];

/** LOWER mode: 5-bit codewords. Space + a-z + control codes. */
export const LOWER_TABLE: readonly TableEntry[] = [
  /* 0  */ shift('PUNCT'),    // P/S
  /* 1  */ char(' '),
  /* 2  */ char('a'),
  /* 3  */ char('b'),
  /* 4  */ char('c'),
  /* 5  */ char('d'),
  /* 6  */ char('e'),
  /* 7  */ char('f'),
  /* 8  */ char('g'),
  /* 9  */ char('h'),
  /* 10 */ char('i'),
  /* 11 */ char('j'),
  /* 12 */ char('k'),
  /* 13 */ char('l'),
  /* 14 */ char('m'),
  /* 15 */ char('n'),
  /* 16 */ char('o'),
  /* 17 */ char('p'),
  /* 18 */ char('q'),
  /* 19 */ char('r'),
  /* 20 */ char('s'),
  /* 21 */ char('t'),
  /* 22 */ char('u'),
  /* 23 */ char('v'),
  /* 24 */ char('w'),
  /* 25 */ char('x'),
  /* 26 */ char('y'),
  /* 27 */ char('z'),
  /* 28 */ shift('UPPER'),    // U/S
  /* 29 */ latch('MIXED'),    // M/L
  /* 30 */ latch('DIGIT'),    // D/L
  /* 31 */ BINARY_SHIFT,      // B/S
];

/** MIXED mode: 5-bit codewords. Control chars + special symbols. */
export const MIXED_TABLE: readonly TableEntry[] = [
  /* 0  */ shift('PUNCT'),    // P/S
  /* 1  */ char(' '),
  /* 2  */ char('\x01'),      // SOH
  /* 3  */ char('\x02'),      // STX
  /* 4  */ char('\x03'),      // ETX
  /* 5  */ char('\x04'),      // EOT
  /* 6  */ char('\x05'),      // ENQ
  /* 7  */ char('\x06'),      // ACK
  /* 8  */ char('\x07'),      // BEL
  /* 9  */ char('\x08'),      // BS
  /* 10 */ char('\t'),        // HT
  /* 11 */ char('\n'),        // LF
  /* 12 */ char('\x0B'),      // VT
  /* 13 */ char('\x0C'),      // FF
  /* 14 */ char('\r'),        // CR
  /* 15 */ char('\x1B'),      // ESC
  /* 16 */ char('\x1C'),      // FS
  /* 17 */ char('\x1D'),      // GS
  /* 18 */ char('\x1E'),      // RS
  /* 19 */ char('\x1F'),      // US
  /* 20 */ char('@'),
  /* 21 */ char('\\'),
  /* 22 */ char('^'),
  /* 23 */ char('_'),
  /* 24 */ char('`'),
  /* 25 */ char('|'),
  /* 26 */ char('~'),
  /* 27 */ char('\x7F'),      // DEL
  /* 28 */ latch('LOWER'),    // L/L
  /* 29 */ latch('UPPER'),    // U/L
  /* 30 */ latch('PUNCT'),    // P/L
  /* 31 */ BINARY_SHIFT,      // B/S
];

/** PUNCT mode: 5-bit codewords. Punctuation and two-char sequences. */
export const PUNCT_TABLE: readonly TableEntry[] = [
  /* 0  */ FLG_N,             // FLG(n)
  /* 1  */ char('\r'),
  /* 2  */ char('\r\n'),
  /* 3  */ char('. '),
  /* 4  */ char(', '),
  /* 5  */ char(': '),
  /* 6  */ char('!'),
  /* 7  */ char('"'),
  /* 8  */ char('#'),
  /* 9  */ char('$'),
  /* 10 */ char('%'),
  /* 11 */ char('&'),
  /* 12 */ char("'"),
  /* 13 */ char('('),
  /* 14 */ char(')'),
  /* 15 */ char('*'),
  /* 16 */ char('+'),
  /* 17 */ char(','),
  /* 18 */ char('-'),
  /* 19 */ char('.'),
  /* 20 */ char('/'),
  /* 21 */ char(':'),
  /* 22 */ char(';'),
  /* 23 */ char('<'),
  /* 24 */ char('='),
  /* 25 */ char('>'),
  /* 26 */ char('?'),
  /* 27 */ char('['),
  /* 28 */ char(']'),
  /* 29 */ char('{'),
  /* 30 */ char('}'),
  /* 31 */ latch('UPPER'),    // U/L
];

/** DIGIT mode: 4-bit codewords. Space + 0-9 + , + . + control codes. */
export const DIGIT_TABLE: readonly TableEntry[] = [
  /* 0  */ shift('PUNCT'),    // P/S
  /* 1  */ char(' '),
  /* 2  */ char('0'),
  /* 3  */ char('1'),
  /* 4  */ char('2'),
  /* 5  */ char('3'),
  /* 6  */ char('4'),
  /* 7  */ char('5'),
  /* 8  */ char('6'),
  /* 9  */ char('7'),
  /* 10 */ char('8'),
  /* 11 */ char('9'),
  /* 12 */ char(','),
  /* 13 */ char('.'),
  /* 14 */ latch('UPPER'),    // U/L
  /* 15 */ shift('UPPER'),    // U/S
];

/** Look up table for a given mode */
const MODE_TABLES: Record<AztecTextMode, readonly TableEntry[]> = {
  UPPER: UPPER_TABLE,
  LOWER: LOWER_TABLE,
  MIXED: MIXED_TABLE,
  PUNCT: PUNCT_TABLE,
  DIGIT: DIGIT_TABLE,
};

/** Bits consumed per codeword in each mode (for the mode table lookup) */
const MODE_BITS: Record<AztecTextMode, number> = {
  UPPER: 5,
  LOWER: 5,
  MIXED: 5,
  PUNCT: 5,
  DIGIT: 4,
};

// ---------------------------------------------------------------------------
// CodewordInfo discriminated union
// ---------------------------------------------------------------------------

interface CodewordBase {
  /** Sequential index of this symbol in decode order (0-based) */
  readonly index: number;
  /** Raw numeric value extracted from grid bits */
  readonly rawValue: number;
  /** Bit width of this codeword (4, 6, 8, 10, or 12) */
  readonly bitSize: number;
  /** Start bit offset in the data bit stream (inclusive) */
  readonly startBit: number;
  /** End bit offset in the data bit stream (exclusive) */
  readonly endBit: number;
}

/** A codeword that decodes to one or more characters */
export interface CharacterCodeword extends CodewordBase {
  readonly kind: 'character';
  readonly decodedChars: string;
  readonly charPosition: number;
  readonly mode: AztecTextMode;
}

/** A codeword that shifts the mode temporarily (for next codeword only) */
export interface ShiftCodeword extends CodewordBase {
  readonly kind: 'shift';
  readonly fromMode: AztecTextMode;
  readonly toMode: AztecTextMode;
}

/** A codeword that latches to a new mode permanently */
export interface LatchCodeword extends CodewordBase {
  readonly kind: 'latch';
  readonly fromMode: AztecTextMode;
  readonly toMode: AztecTextMode;
}

/** An error correction codeword (Reed-Solomon parity) */
export interface EccCodeword extends CodewordBase {
  readonly kind: 'ecc';
}

/** Binary shift length indicator */
export interface BinaryShiftCodeword extends CodewordBase {
  readonly kind: 'binary-shift';
  readonly byteCount: number;
}

/** A raw binary byte within a binary shift sequence */
export interface BinaryByteCodeword extends CodewordBase {
  readonly kind: 'binary-byte';
  readonly decodedChar: string;
  readonly charPosition: number;
}

/** FLG(n) function code */
export interface FlgCodeword extends CodewordBase {
  readonly kind: 'flg';
  readonly flagValue: number;
}

export type CodewordInfo =
  | CharacterCodeword
  | ShiftCodeword
  | LatchCodeword
  | EccCodeword
  | BinaryShiftCodeword
  | BinaryByteCodeword
  | FlgCodeword;

// ---------------------------------------------------------------------------
// Codeword value extraction from grid
// ---------------------------------------------------------------------------

/**
 * Extract raw numeric values for each codeword by reading bit values
 * from the boolean grid in codeword module order.
 */
export function extractCodewordValues(
  grid: boolean[][],
  codewordModules: Map<number, [number, number][]>,
  codewordSize: number,
  totalCodewords: number,
): number[] {
  const values: number[] = [];
  for (let i = 0; i < totalCodewords; i++) {
    const modules = codewordModules.get(i);
    if (!modules) {
      values.push(0);
      continue;
    }
    let value = 0;
    for (let bit = 0; bit < modules.length && bit < codewordSize; bit++) {
      const [x, y] = modules[bit];
      if (grid[y]?.[x]) {
        value |= (1 << (codewordSize - 1 - bit));
      }
    }
    values.push(value);
  }
  return values;
}

// ---------------------------------------------------------------------------
// Bit stream reader (for sub-codeword field extraction)
// ---------------------------------------------------------------------------

/**
 * Read a sequence of bits from the codeword value stream.
 * Aztec mode tables use 4 or 5 bits per symbol, but the raw codeword
 * size can be larger (6, 8, 10, 12). This reader handles extracting
 * variable-width fields from a stream of fixed-width codewords.
 */
class BitStream {
  private bitBuffer = 0;
  private bitsAvailable = 0;
  private position = 0;

  constructor(
    private readonly values: readonly number[],
    private readonly codewordSize: number,
    startIndex: number = 0,
  ) {
    this.position = startIndex;
  }

  /** Absolute bit offset in the stream (bits consumed so far) */
  get bitOffset(): number {
    return this.position * this.codewordSize - this.bitsAvailable;
  }

  /** True if more codewords are available */
  get hasMore(): boolean {
    return this.bitsAvailable > 0 || this.position < this.values.length;
  }

  /** Read numBits from the stream, consuming across codeword boundaries */
  read(numBits: number): number {
    while (this.bitsAvailable < numBits) {
      if (this.position >= this.values.length) {
        // Pad with zeros if we run out
        this.bitsAvailable += this.codewordSize;
        this.bitBuffer <<= this.codewordSize;
        break;
      }
      this.bitBuffer = (this.bitBuffer << this.codewordSize) | this.values[this.position];
      this.bitsAvailable += this.codewordSize;
      this.position++;
    }
    this.bitsAvailable -= numBits;
    const result = (this.bitBuffer >> this.bitsAvailable) & ((1 << numBits) - 1);
    this.bitBuffer &= (1 << this.bitsAvailable) - 1;
    return result;
  }
}

// ---------------------------------------------------------------------------
// Decoder
// ---------------------------------------------------------------------------

/**
 * Decode a sequence of raw codeword values into annotated CodewordInfo objects.
 *
 * Each CodewordInfo represents a decoded **symbol** (not a codeword).
 * Symbols are variable-width (4/5/8 bits) and can span codeword boundaries.
 * The `startBit`/`endBit` fields track exactly which bits in the data
 * stream each symbol uses, enabling precise module-level highlighting.
 *
 * @param codewordValues - Raw numeric values extracted from grid
 * @param codewordSize - Bit width of each codeword (4, 6, 8, 10, or 12)
 * @param numDataCodewords - Number of data codewords (remainder are ECC)
 * @returns Array of CodewordInfo, one per decoded symbol + ECC entries
 */
export function decodeCodewords(
  codewordValues: readonly number[],
  codewordSize: number,
  numDataCodewords: number,
): CodewordInfo[] {
  const results: CodewordInfo[] = [];
  let charPosition = 0;
  let currentMode: AztecTextMode = 'UPPER';
  let shiftMode: AztecTextMode | null = null;
  let symbolIndex = 0;

  const dataBitLimit = numDataCodewords * codewordSize;
  const stream = new BitStream(codewordValues, codewordSize);

  while (stream.hasMore && stream.bitOffset < dataBitLimit) {
    const startBit = stream.bitOffset;
    const activeMode = shiftMode ?? currentMode;
    const table = MODE_TABLES[activeMode];
    const bitsNeeded = MODE_BITS[activeMode];

    // Don't read past data boundary
    if (startBit + bitsNeeded > dataBitLimit) break;

    const symbolValue = stream.read(bitsNeeded);
    const endBit = stream.bitOffset;

    if (symbolValue >= table.length) {
      results.push({
        kind: 'character',
        index: symbolIndex++,
        rawValue: symbolValue,
        bitSize: bitsNeeded,
        startBit,
        endBit,
        decodedChars: '?',
        charPosition: charPosition++,
        mode: activeMode,
      });
      shiftMode = null;
      continue;
    }

    const entry = table[symbolValue];

    switch (entry.kind) {
      case 'char': {
        results.push({
          kind: 'character',
          index: symbolIndex++,
          rawValue: symbolValue,
          bitSize: bitsNeeded,
          startBit,
          endBit,
          decodedChars: entry.value,
          charPosition,
          mode: activeMode,
        });
        charPosition += entry.value.length;
        shiftMode = null;
        break;
      }

      case 'shift': {
        results.push({
          kind: 'shift',
          index: symbolIndex++,
          rawValue: symbolValue,
          bitSize: bitsNeeded,
          startBit,
          endBit,
          fromMode: currentMode,
          toMode: entry.toMode,
        });
        shiftMode = entry.toMode;
        break;
      }

      case 'latch': {
        results.push({
          kind: 'latch',
          index: symbolIndex++,
          rawValue: symbolValue,
          bitSize: bitsNeeded,
          startBit,
          endBit,
          fromMode: currentMode,
          toMode: entry.toMode,
        });
        currentMode = entry.toMode;
        shiftMode = null;
        break;
      }

      case 'binary-shift': {
        // Binary shift: read 5-bit length; if 0, read 11-bit length + 31
        let byteCount = stream.read(5);
        if (byteCount === 0) {
          byteCount = stream.read(11) + 31;
        }
        const bsEndBit = stream.bitOffset;

        results.push({
          kind: 'binary-shift',
          index: symbolIndex++,
          rawValue: symbolValue,
          bitSize: bitsNeeded,
          startBit,
          endBit: bsEndBit,
          byteCount,
        });

        // Read raw bytes
        for (let i = 0; i < byteCount && stream.hasMore; i++) {
          const byteStartBit = stream.bitOffset;
          const byteVal = stream.read(8);
          const byteEndBit = stream.bitOffset;
          results.push({
            kind: 'binary-byte',
            index: symbolIndex++,
            rawValue: byteVal,
            bitSize: 8,
            startBit: byteStartBit,
            endBit: byteEndBit,
            decodedChar: String.fromCharCode(byteVal),
            charPosition,
          });
          charPosition++;
        }

        shiftMode = null;
        break;
      }

      case 'flg-n': {
        // FLG(n): read 3-bit flag value
        const flagValue = stream.read(3);
        const flgEndBit = stream.bitOffset;

        // FLG(0) = FNC1, FLG(1-6) = ECI designators, FLG(7) = reserved
        if (flagValue >= 1 && flagValue <= 6) {
          for (let i = 0; i < flagValue && stream.hasMore; i++) {
            stream.read(4);
          }
        }

        results.push({
          kind: 'flg',
          index: symbolIndex++,
          rawValue: symbolValue,
          bitSize: bitsNeeded,
          startBit,
          endBit: flgEndBit,
          flagValue,
        });

        shiftMode = null;
        break;
      }
    }
  }

  // Add ECC codewords (one entry per codeword, with exact bit ranges)
  for (let i = numDataCodewords; i < codewordValues.length; i++) {
    const cwStartBit = i * codewordSize;
    results.push({
      kind: 'ecc',
      index: symbolIndex++,
      rawValue: codewordValues[i],
      bitSize: codewordSize,
      startBit: cwStartBit,
      endBit: cwStartBit + codewordSize,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Bit-to-module mapping
// ---------------------------------------------------------------------------

/**
 * Given a symbol's bit range in the data stream, return the module positions
 * (x, y) that contribute to it.
 *
 * The `dataBitPositions` array maps each bit index in the data stream to its
 * (x, y) position on the grid, accounting for padding bits at the start.
 */
export function getModulesForBitRange(
  startBit: number,
  endBit: number,
  dataBitPositions: [number, number][],
): [number, number][] {
  const modules: [number, number][] = [];
  for (let bit = startBit; bit < endBit && bit < dataBitPositions.length; bit++) {
    modules.push(dataBitPositions[bit]);
  }
  return modules;
}

/**
 * Find which symbol a given bit offset belongs to.
 * Returns the CodewordInfo or undefined if not found.
 */
export function findSymbolAtBit(
  bitOffset: number,
  symbols: readonly CodewordInfo[],
): CodewordInfo | undefined {
  return symbols.find(s => bitOffset >= s.startBit && bitOffset < s.endBit);
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** Format a raw value as hex with correct padding for the bit size */
export function formatHex(value: number, bitSize: number): string {
  const hexDigits = Math.ceil(bitSize / 4);
  return '0x' + value.toString(16).toUpperCase().padStart(hexDigits, '0');
}

/** Format a raw value as binary with correct padding for the bit size */
export function formatBinary(value: number, bitSize: number): string {
  return value.toString(2).padStart(bitSize, '0');
}

/** Get a human-readable description for a CodewordInfo entry */
export function describeCodeword(info: CodewordInfo): string {
  switch (info.kind) {
    case 'character':
      if (info.decodedChars === '') return 'Empty';
      return `"${displayChar(info.decodedChars)}" (${info.mode})`;
    case 'shift':
      return `Shift ${info.fromMode} → ${info.toMode}`;
    case 'latch':
      return `Latch ${info.fromMode} → ${info.toMode}`;
    case 'ecc':
      return 'Reed-Solomon parity';
    case 'binary-shift':
      return `Binary shift (${info.byteCount} bytes)`;
    case 'binary-byte':
      return `Binary byte: "${displayChar(info.decodedChar)}"`;
    case 'flg':
      if (info.flagValue === 0) return 'FNC1';
      if (info.flagValue === 7) return 'FLG(reserved)';
      return `ECI (${info.flagValue} digits)`;
  }
}

/** Make control characters visible for display */
function displayChar(s: string): string {
  return s
    .replace(/\r\n/g, '\\r\\n')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
}
