/**
 * Tests for aztec-text-decoder.ts
 *
 * Tests the Aztec encoding mode state machine, codeword value extraction,
 * and display formatting helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  decodeCodewords,
  extractCodewordValues,
  formatHex,
  formatBinary,
  describeCodeword,
  type CodewordInfo,
} from './aztec-text-decoder';

// ---------------------------------------------------------------------------
// decodeCodewords
// ---------------------------------------------------------------------------

describe('decodeCodewords', () => {
  // Helper: for simple cases where codeword size = 5 bits (matches mode table)
  // We pass values directly as 5-bit codewords
  const CW_SIZE = 5;

  describe('UPPER mode (default)', () => {
    it('decodes single UPPER character', () => {
      // Value 2 = 'A' in UPPER table
      const result = decodeCodewords([2], CW_SIZE, 1);
      const data = result.find(r => r.kind === 'character');
      expect(data).toBeDefined();
      expect(data!.kind).toBe('character');
      if (data!.kind === 'character') {
        expect(data!.decodedChars).toBe('A');
        expect(data!.mode).toBe('UPPER');
        expect(data!.charPosition).toBe(0);
      }
    });

    it('decodes multiple UPPER characters', () => {
      // A=2, B=3, C=4
      const result = decodeCodewords([2, 3, 4], CW_SIZE, 3);
      const chars = result.filter(r => r.kind === 'character');
      expect(chars).toHaveLength(3);
      if (chars[0].kind === 'character' && chars[1].kind === 'character' && chars[2].kind === 'character') {
        expect(chars[0].decodedChars).toBe('A');
        expect(chars[1].decodedChars).toBe('B');
        expect(chars[2].decodedChars).toBe('C');
      }
    });

    it('decodes space in UPPER mode', () => {
      // Space = 1
      const result = decodeCodewords([1], CW_SIZE, 1);
      const data = result.find(r => r.kind === 'character');
      expect(data).toBeDefined();
      if (data!.kind === 'character') {
        expect(data!.decodedChars).toBe(' ');
      }
    });

    it('decodes Z (last letter) in UPPER mode', () => {
      // Z = 27
      const result = decodeCodewords([27], CW_SIZE, 1);
      const data = result.find(r => r.kind === 'character');
      if (data!.kind === 'character') {
        expect(data!.decodedChars).toBe('Z');
      }
    });
  });

  describe('LOWER mode (via latch)', () => {
    it('handles UPPER → LOWER latch then lowercase char', () => {
      // UPPER: 28 = L/L (latch to LOWER)
      // LOWER: 2 = 'a'
      const result = decodeCodewords([28, 2], CW_SIZE, 2);
      const latchEntry = result.find(r => r.kind === 'latch');
      expect(latchEntry).toBeDefined();
      if (latchEntry!.kind === 'latch') {
        expect(latchEntry!.fromMode).toBe('UPPER');
        expect(latchEntry!.toMode).toBe('LOWER');
      }

      const charEntry = result.find(r => r.kind === 'character');
      expect(charEntry).toBeDefined();
      if (charEntry!.kind === 'character') {
        expect(charEntry!.decodedChars).toBe('a');
        expect(charEntry!.mode).toBe('LOWER');
      }
    });

    it('stays in LOWER mode after latch', () => {
      // L/L(28), 'a'(2), 'b'(3)
      const result = decodeCodewords([28, 2, 3], CW_SIZE, 3);
      const chars = result.filter(r => r.kind === 'character');
      expect(chars).toHaveLength(2);
      if (chars[0].kind === 'character' && chars[1].kind === 'character') {
        expect(chars[0].decodedChars).toBe('a');
        expect(chars[0].mode).toBe('LOWER');
        expect(chars[1].decodedChars).toBe('b');
        expect(chars[1].mode).toBe('LOWER');
      }
    });
  });

  describe('PUNCT shift (temporary)', () => {
    it('shifts to PUNCT for one codeword then returns', () => {
      // UPPER: 0 = P/S (shift to PUNCT)
      // PUNCT: 6 = '!'
      // UPPER: 2 = 'A' (back to UPPER)
      const result = decodeCodewords([0, 6, 2], CW_SIZE, 3);

      const shiftEntry = result.find(r => r.kind === 'shift');
      expect(shiftEntry).toBeDefined();
      if (shiftEntry!.kind === 'shift') {
        expect(shiftEntry!.fromMode).toBe('UPPER');
        expect(shiftEntry!.toMode).toBe('PUNCT');
      }

      const chars = result.filter(r => r.kind === 'character');
      expect(chars).toHaveLength(2);
      if (chars[0].kind === 'character' && chars[1].kind === 'character') {
        expect(chars[0].decodedChars).toBe('!');
        expect(chars[0].mode).toBe('PUNCT');
        expect(chars[1].decodedChars).toBe('A');
        expect(chars[1].mode).toBe('UPPER');
      }
    });

    it('handles PUNCT two-char sequences', () => {
      // P/S(0), ". "(3)
      const result = decodeCodewords([0, 3], CW_SIZE, 2);
      const charEntry = result.find(r => r.kind === 'character');
      if (charEntry!.kind === 'character') {
        expect(charEntry!.decodedChars).toBe('. ');
      }
    });
  });

  describe('MIXED mode', () => {
    it('latches to MIXED and decodes @', () => {
      // UPPER: 29 = M/L (latch to MIXED)
      // MIXED: 20 = '@'
      const result = decodeCodewords([29, 20], CW_SIZE, 2);
      const charEntry = result.find(r => r.kind === 'character');
      if (charEntry!.kind === 'character') {
        expect(charEntry!.decodedChars).toBe('@');
        expect(charEntry!.mode).toBe('MIXED');
      }
    });

    it('MIXED → LOWER via L/L', () => {
      // M/L(29), L/L(28 in MIXED), 'a'(2 in LOWER)
      const result = decodeCodewords([29, 28, 2], CW_SIZE, 3);
      const chars = result.filter(r => r.kind === 'character');
      expect(chars).toHaveLength(1);
      if (chars[0].kind === 'character') {
        expect(chars[0].decodedChars).toBe('a');
        expect(chars[0].mode).toBe('LOWER');
      }
    });
  });

  describe('DIGIT mode', () => {
    it('latches to DIGIT and decodes numbers', () => {
      // UPPER: 30 = D/L (latch to DIGIT)
      // DIGIT: 2='0', 3='1', 4='2' (4-bit codewords within the bit stream)
      const result = decodeCodewords([30, 2, 3, 4], CW_SIZE, 4);
      const chars = result.filter(r => r.kind === 'character');
      // In DIGIT mode, values are read as 4-bit symbols
      expect(chars.length).toBeGreaterThanOrEqual(1);
      if (chars[0].kind === 'character') {
        expect(chars[0].mode).toBe('DIGIT');
      }
    });
  });

  describe('ECC codewords', () => {
    it('marks codewords beyond numDataCodewords as ECC', () => {
      const result = decodeCodewords([2, 3, 0xA3, 0xB4], CW_SIZE, 2);
      const eccEntries = result.filter(r => r.kind === 'ecc');
      expect(eccEntries).toHaveLength(2);
      expect(eccEntries[0].rawValue).toBe(0xA3);
      expect(eccEntries[1].rawValue).toBe(0xB4);
    });
  });

  describe('edge cases', () => {
    it('handles empty input', () => {
      const result = decodeCodewords([], CW_SIZE, 0);
      expect(result).toHaveLength(0);
    });

    it('handles all ECC (zero data codewords)', () => {
      const result = decodeCodewords([0xFF, 0xAA], CW_SIZE, 0);
      expect(result.every(r => r.kind === 'ecc')).toBe(true);
    });

    it('handles single ECC codeword', () => {
      const result = decodeCodewords([0xA3], CW_SIZE, 0);
      expect(result).toHaveLength(1);
      expect(result[0].kind).toBe('ecc');
    });
  });

  describe('binary shift', () => {
    it('handles binary shift with short length', () => {
      // UPPER: 31 = B/S
      // Then 5-bit length (say 2), then two 8-bit bytes
      // For 5-bit codewords, the binary shift consumes from the bit stream
      // B/S(31), then stream reads 5-bit length, then 8-bit bytes
      const result = decodeCodewords([31], CW_SIZE, 1);
      const bsEntry = result.find(r => r.kind === 'binary-shift');
      // The binary shift was initiated but stream ran out
      expect(bsEntry).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// extractCodewordValues
// ---------------------------------------------------------------------------

describe('extractCodewordValues', () => {
  it('extracts values from a simple grid', () => {
    // 3x3 grid, 1 codeword with 4 modules
    const grid: boolean[][] = [
      [true, false, true],
      [true, true, false],
      [false, true, false],
    ];

    // Codeword 0 has modules at: (0,0)=true, (1,0)=false, (2,0)=true, (0,1)=true
    const codewordModules = new Map<number, [number, number][]>();
    codewordModules.set(0, [[0, 0], [1, 0], [2, 0], [0, 1]]);

    const values = extractCodewordValues(grid, codewordModules, 4, 1);
    // bits: 1, 0, 1, 1 → 0b1011 = 11
    expect(values).toEqual([11]);
  });

  it('extracts multiple codeword values', () => {
    const grid: boolean[][] = [
      [true, true, false, false],
      [false, false, true, true],
    ];

    const codewordModules = new Map<number, [number, number][]>();
    codewordModules.set(0, [[0, 0], [1, 0]]); // bits: 1, 1 → 0b11 = 3
    codewordModules.set(1, [[2, 0], [3, 0]]); // bits: 0, 0 → 0b00 = 0

    const values = extractCodewordValues(grid, codewordModules, 2, 2);
    expect(values).toEqual([3, 0]);
  });

  it('handles missing codeword modules', () => {
    const grid: boolean[][] = [[true]];
    const codewordModules = new Map<number, [number, number][]>();
    // Codeword 0 has no modules mapped

    const values = extractCodewordValues(grid, codewordModules, 4, 1);
    expect(values).toEqual([0]);
  });

  it('handles out-of-bounds grid access', () => {
    const grid: boolean[][] = [[true]];
    const codewordModules = new Map<number, [number, number][]>();
    codewordModules.set(0, [[5, 5]]); // Out of bounds

    const values = extractCodewordValues(grid, codewordModules, 1, 1);
    expect(values).toEqual([0]); // undefined access → falsy → 0
  });
});

// ---------------------------------------------------------------------------
// formatHex / formatBinary
// ---------------------------------------------------------------------------

describe('formatHex', () => {
  it('pads correctly for 4-bit codewords', () => {
    expect(formatHex(0xA, 4)).toBe('0xA');
  });

  it('pads correctly for 8-bit codewords', () => {
    expect(formatHex(0x04, 8)).toBe('0x04');
    expect(formatHex(0xFF, 8)).toBe('0xFF');
  });

  it('pads correctly for 12-bit codewords', () => {
    expect(formatHex(0x0A3, 12)).toBe('0x0A3');
  });

  it('handles zero', () => {
    expect(formatHex(0, 8)).toBe('0x00');
  });
});

describe('formatBinary', () => {
  it('pads correctly for various bit sizes', () => {
    expect(formatBinary(0b1010, 4)).toBe('1010');
    expect(formatBinary(0b100, 8)).toBe('00000100');
    expect(formatBinary(0, 5)).toBe('00000');
  });
});

// ---------------------------------------------------------------------------
// describeCodeword
// ---------------------------------------------------------------------------

describe('describeCodeword', () => {
  it('describes character codeword', () => {
    const info: CodewordInfo = {
      kind: 'character',
      index: 0,
      rawValue: 2,
      bitSize: 5,
      decodedChars: 'A',
      charPosition: 0,
      mode: 'UPPER',
    };
    expect(describeCodeword(info)).toBe('"A" (UPPER)');
  });

  it('describes shift codeword', () => {
    const info: CodewordInfo = {
      kind: 'shift',
      index: 0,
      rawValue: 0,
      bitSize: 5,
      fromMode: 'UPPER',
      toMode: 'PUNCT',
    };
    expect(describeCodeword(info)).toBe('Shift UPPER → PUNCT');
  });

  it('describes latch codeword', () => {
    const info: CodewordInfo = {
      kind: 'latch',
      index: 0,
      rawValue: 28,
      bitSize: 5,
      fromMode: 'UPPER',
      toMode: 'LOWER',
    };
    expect(describeCodeword(info)).toBe('Latch UPPER → LOWER');
  });

  it('describes ECC codeword', () => {
    const info: CodewordInfo = {
      kind: 'ecc',
      index: 58,
      rawValue: 0xA3,
      bitSize: 8,
    };
    expect(describeCodeword(info)).toBe('Reed-Solomon parity');
  });

  it('describes control characters visually', () => {
    const info: CodewordInfo = {
      kind: 'character',
      index: 0,
      rawValue: 2,
      bitSize: 5,
      decodedChars: '\r\n',
      charPosition: 0,
      mode: 'PUNCT',
    };
    expect(describeCodeword(info)).toBe('"\\r\\n" (PUNCT)');
  });
});
