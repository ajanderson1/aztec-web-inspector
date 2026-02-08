---
title: "feat: Codeword Hover with Decoded Values"
type: feat
date: 2026-02-05
brainstorm: docs/brainstorms/2026-02-05-codeword-hover-decode-brainstorm.md
---

# feat: Codeword Hover with Decoded Values

## Overview

Enhance the Aztec Inspector's hover interaction to show full codeword context including decoded character values and encoding information. When hovering any module belonging to a codeword, highlight all modules in that codeword and display decoded character, encoding mode, and raw bit values.

## Problem Statement / Motivation

The inspector currently shows basic module info on hover (position, type, codeword #, bit index) but doesn't reveal:
- What character the codeword encodes
- The raw binary/hex value
- Which encoding mode was active
- Visual connection between scattered modules in the same codeword

This limits the educational value of the inspector. Users can see the structure but can't understand the encoding process.

## Proposed Solution

### Visual Enhancement
- Highlight ALL modules in a codeword when hovering any module in that codeword
- Use distinct highlight color (cyan/teal) separate from static codeword outlines

### InfoPanel Enhancement
For data codewords:
```
Codeword #5 (8-bit)
├─ Decoded: "D" (char 5 of 67)
├─ Encoding: UPPER mode
├─ Raw: 0x04 = 00000100
├─ Modules: 8
└─ Layer: 2
```

For mode switch/latch codewords:
```
Codeword #12 (8-bit)
├─ Mode: LATCH to LOWER (L/L)
├─ Raw: 0x1C = 00011100
├─ Modules: 8
└─ Layer: 2
```

For ECC codewords:
```
ECC Codeword #58 (8-bit)
├─ Raw: 0xA3 = 10100011
├─ Reed-Solomon parity
├─ Modules: 8
└─ Layer: 4
```

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      App.tsx                                 │
│  processImageData() → structure + codewordInfos              │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌─────────────┐  ┌──────────────┐  ┌──────────────┐
│AztecCanvas  │  │  InfoPanel   │  │aztec-decoder │
│             │  │              │  │              │
│ +highlight  │  │ +codeword    │  │ NEW: aztec-  │
│  hovered    │  │  details     │  │ text-decoder │
│  codeword   │  │  display     │  │              │
└─────────────┘  └──────────────┘  └──────────────┘
```

### New File: `src/lib/aztec-text-decoder.ts`

Implements Aztec encoding mode tables and stateful decoder.

```typescript
// Mode constants (from ZXing HighLevelEncoder)
export const MODE_UPPER = 0;
export const MODE_LOWER = 1;
export const MODE_DIGIT = 2;
export const MODE_MIXED = 3;
export const MODE_PUNCT = 4;

export type AztecMode = 'UPPER' | 'LOWER' | 'DIGIT' | 'MIXED' | 'PUNCT' | 'BINARY';

export interface CodewordInfo {
  index: number;
  rawValue: number;
  bitSize: number;
  type: 'data' | 'ecc';
  // For data codewords:
  decodedChars?: string;
  charPosition?: number;        // Position in final message (if produces char)
  encodingMode?: AztecMode;     // Mode when this codeword was processed
  isShift?: boolean;            // Temporary mode switch
  isLatch?: boolean;            // Permanent mode switch
  shiftOrLatchTo?: AztecMode;   // Target mode if shift/latch
}

// Character tables per mode (5-bit codeword → character)
// Index 0 reserved for special codes
export const UPPER_TABLE: (string | null)[] = [
  null, ' ', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  // 28: P/S (Punct Shift), 29: M/L (Mixed Latch), 30: D/L (Digit Latch), 31: B/S (Binary Shift)
];

export const LOWER_TABLE: (string | null)[] = [
  null, ' ', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  // 28: P/S, 29: U/S (Upper Shift), 30: M/L, 31: D/L
];

export const MIXED_TABLE: (string | null)[] = [
  null, '\0', ' ', '\x01', '\x02', '\x03', '\x04', '\x05', '\x06', '\x07',
  '\x08', '\t', '\n', '\x0B', '\x0C', '\r', '\x1B', '\x1C', '\x1D', '\x1E',
  '\x1F', '@', '\\', '^', '_', '`', '|', '~', '\x7F',
  // 29: P/L, 30: U/L, 31: L/L
];

export const PUNCT_TABLE: (string | null)[] = [
  null, '\r', '\r\n', '. ', ', ', ': ', '!', '"', '#', '$', '%', '&', "'",
  '(', ')', '*', '+', ',', '-', '.', '/', ':', ';', '<', '=', '>', '?',
  '[', ']', '{', '}',
  // Note: PUNCT has U/L at 31
];

export const DIGIT_TABLE: (string | null)[] = [
  null, ' ', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '.',
  // 14: U/L, 15: U/S
];

export function decodeCodewords(
  codewordValues: number[],
  codewordSize: number,
  numDataCodewords: number
): CodewordInfo[];
```

### Modified: `src/lib/aztec-structure.ts`

Add `codewordValues` computation to `mapModulesToCodewords()`:

```typescript
// Line ~233: Extend function signature
function mapModulesToCodewords(
  grid: boolean[][],  // NEW: need grid to read bit values
  size: number,
  center: number,
  ...
): {
  moduleToCodeword: Map<string, ...>;
  codewordModules: Map<number, [number, number][]>;
  codewordValues: number[];  // NEW: raw values per codeword
}

// Inside the function, after collecting all modules for a codeword:
// Compute raw value by reading bits in order
let value = 0;
for (let bit = 0; bit < codewordSize; bit++) {
  const [x, y] = codewordModules.get(codewordIndex)![bit];
  if (grid[y][x]) {
    value |= (1 << (codewordSize - 1 - bit));
  }
}
codewordValues.push(value);
```

Update `AztecStructure` interface:

```typescript
export interface AztecStructure {
  // ... existing fields ...
  codewordValues: number[];           // NEW: raw values per codeword
  codewordInfos: CodewordInfo[];      // NEW: decoded info per codeword
}
```

### Modified: `src/components/AztecCanvas.tsx`

Add hover codeword highlighting:

```typescript
// New state for hovered codeword
const [hoveredCodewordIndex, setHoveredCodewordIndex] = useState<number | null>(null);

// In handleMouseMove, after finding module:
const module = structure.modules[row][col];
if (module.codewordIndex !== undefined) {
  setHoveredCodewordIndex(module.codewordIndex);
} else {
  setHoveredCodewordIndex(null);
}

// In render, after existing codeword outlines:
// Draw highlighted codeword (if hovering)
if (hoveredCodewordIndex !== null) {
  const modules = structure.codewordModules.get(hoveredCodewordIndex);
  if (modules) {
    // Use computeCodewordOutline() pattern but with highlight color
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';  // Cyan highlight
    ctx.lineWidth = 3;
    // Draw outline path
  }
}
```

### Modified: `src/components/InfoPanel.tsx`

Display CodewordInfo when hovering data/ecc modules:

```typescript
interface InfoPanelProps {
  structure: AztecStructure | null;
  decodedText: string;
  hoveredModule: ModuleInfo | null;
}

// In the hover info section, after existing codeword display:
{hoveredModule?.codewordIndex !== undefined && structure?.codewordInfos && (
  <CodewordDetails
    info={structure.codewordInfos[hoveredModule.codewordIndex]}
    decodedText={decodedText}
  />
)}

// New sub-component
function CodewordDetails({ info, decodedText }: { info: CodewordInfo; decodedText: string }) {
  const binaryStr = info.rawValue.toString(2).padStart(info.bitSize, '0');
  const hexStr = '0x' + info.rawValue.toString(16).toUpperCase().padStart(2, '0');

  return (
    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        {info.type === 'data' ? 'Data' : 'ECC'} Codeword #{info.index}
      </div>

      {info.decodedChars && (
        <div className="flex justify-between">
          <span>Decoded</span>
          <span className="font-mono">"{info.decodedChars}"</span>
        </div>
      )}

      {info.encodingMode && (
        <div className="flex justify-between">
          <span>Mode</span>
          <span>{info.encodingMode}</span>
        </div>
      )}

      {info.isLatch && (
        <div className="text-amber-600 dark:text-amber-400">
          Latch → {info.shiftOrLatchTo}
        </div>
      )}

      <div className="flex justify-between font-mono text-xs">
        <span>Raw</span>
        <span>{hexStr} = {binaryStr}</span>
      </div>
    </div>
  );
}
```

## Implementation Phases

### Phase 1: Raw Codeword Values (Foundation)
**Goal:** Extract and display raw codeword hex/binary values

1. Modify `mapModulesToCodewords()` to accept grid and compute raw values
2. Add `codewordValues: number[]` to `AztecStructure`
3. Update `InfoPanel` to show hex + binary for hovered codeword
4. Add unit tests for bit extraction

**Files:** `aztec-structure.ts`, `InfoPanel.tsx`
**Deliverable:** Hover shows raw value like `0x04 = 00000100`

### Phase 2: Codeword Hover Highlighting
**Goal:** Visual feedback showing all modules in hovered codeword

1. Add `hoveredCodewordIndex` state to `AztecCanvas`
2. Render highlight overlay for hovered codeword modules
3. Use distinct color (cyan) from static outlines (yellow/purple)

**Files:** `AztecCanvas.tsx`
**Deliverable:** Hovering any module highlights entire codeword

### Phase 3: Aztec Text Decoder
**Goal:** Full stateful decoder for character mapping

1. Create `aztec-text-decoder.ts` with mode tables
2. Implement `decodeCodewords()` state machine
3. Handle shifts vs latches correctly
4. Handle binary mode (length-prefixed)
5. Add comprehensive tests

**Files:** `aztec-text-decoder.ts` (new), `aztec-text-decoder.test.ts` (new)
**Deliverable:** Each codeword knows its decoded character(s) and mode

### Phase 4: Enhanced InfoPanel Display
**Goal:** Rich codeword details in hover panel

1. Create `CodewordDetails` component
2. Show: decoded char, mode, char position in message
3. Special display for shift/latch codewords
4. Different styling for data vs ECC

**Files:** `InfoPanel.tsx`
**Deliverable:** Full context display as shown in mockups

## Acceptance Criteria

### Functional Requirements
- [ ] Hovering a data/ecc module highlights all modules in that codeword
- [ ] InfoPanel shows raw value (hex + binary) for hovered codeword
- [ ] InfoPanel shows decoded character for data codewords
- [ ] InfoPanel shows encoding mode (UPPER/LOWER/MIXED/PUNCT/DIGIT)
- [ ] Mode switch/latch codewords display their target mode
- [ ] ECC codewords show "Reed-Solomon parity" instead of decoded char
- [ ] Character position in message shown (e.g., "char 5 of 67")

### Non-Functional Requirements
- [ ] Decoding computed once on load (not on every hover)
- [ ] Highlight renders without flicker during mouse movement
- [ ] Works for all Aztec sizes (15-151)
- [ ] Works for both compact and full-range codes

### Quality Gates
- [ ] Unit tests for `decodeCodewords()` covering all modes
- [ ] Unit tests for shift vs latch behavior
- [ ] Test with real barcodes containing mixed modes
- [ ] No TypeScript errors
- [ ] ESLint passes

## Dependencies & Risks

### Dependencies
- Existing `codewordModules` map (already implemented)
- Grid access in structure analysis (minor refactor)

### Risks

| Risk | Mitigation |
|------|------------|
| Aztec encoding complexity | Use ZXing tables as reference; test extensively |
| Binary mode edge cases | Defer binary mode display to Phase 5 if needed |
| Performance on large codes | Pre-compute all codeword info on load |

## Test Cases

### Unit Tests (`aztec-text-decoder.test.ts`)

```typescript
describe('decodeCodewords', () => {
  it('decodes UPPER mode characters', () => {
    // Codeword 2 = 'A', 3 = 'B', etc.
    const values = [2, 3, 4]; // A, B, C
    const result = decodeCodewords(values, 8, 3);
    expect(result[0].decodedChars).toBe('A');
    expect(result[0].encodingMode).toBe('UPPER');
  });

  it('handles LOWER latch', () => {
    // 28 = P/S, 29 = M/L, 30 = D/L, 31 = B/S in UPPER
    // But L/L is via MIXED: UPPER → M/L(29) → L/L(31)
    const values = [29, 31, 2]; // M/L, L/L, 'a'
    const result = decodeCodewords(values, 8, 3);
    expect(result[2].decodedChars).toBe('a');
    expect(result[2].encodingMode).toBe('LOWER');
  });

  it('handles PUNCT shift (temporary)', () => {
    // P/S = 0 in UPPER, shifts to PUNCT for one codeword
    const values = [0, 6, 2]; // P/S, '!', 'A'
    const result = decodeCodewords(values, 8, 3);
    expect(result[1].decodedChars).toBe('!');
    expect(result[1].encodingMode).toBe('PUNCT');
    expect(result[2].decodedChars).toBe('A');
    expect(result[2].encodingMode).toBe('UPPER'); // Back to UPPER
  });
});
```

## References & Research

### Internal References
- `aztec-structure.ts:233-269` - `mapModulesToCodewords()` function
- `aztec-structure.ts:379-465` - `computeCodewordOutline()` pattern
- `AztecCanvas.tsx:150-191` - Existing codeword outline rendering
- `InfoPanel.tsx:84-99` - Existing codeword display
- `docs/solutions/logic-errors/aztec-grid-size-detection.md` - ZXing integration lessons

### External References
- [Aztec Code - Wikipedia](https://en.wikipedia.org/wiki/Aztec_Code)
- [ZXing HighLevelEncoder.java](https://github.com/zxing/zxing/blob/master/core/src/main/java/com/google/zxing/aztec/encoder/HighLevelEncoder.java) - Encoding tables source
- [Barcode Bakery - Aztec Specification](https://www.barcodebakery.com/en/docs/php/barcode/aztec/specification)
- ISO/IEC 24778:2024 - Aztec Code bar code symbology specification

### Aztec Encoding Mode Tables (from ZXing)

**Mode Constants:**
- MODE_UPPER = 0 (5 bits)
- MODE_LOWER = 1 (5 bits)
- MODE_DIGIT = 2 (4 bits)
- MODE_MIXED = 3 (5 bits)
- MODE_PUNCT = 4 (5 bits)

**UPPER (5-bit):** Space=1, A-Z=2-27, P/S=0, M/L=29, D/L=30, B/S=31
**LOWER (5-bit):** Space=1, a-z=2-27, P/S=0, U/S=28, M/L=29, D/L=30
**DIGIT (4-bit):** Space=1, 0-9=2-11, comma=12, period=13, U/L=14, U/S=15
**MIXED (5-bit):** Control chars, @=20, \=21, ^=22, _=23, `=24, |=25, ~=26, P/L=29, U/L=30, L/L=31
**PUNCT (5-bit):** CR=1, CRLF=2, ". "=3, ", "=4, ": "=5, !=6, ...punctuation..., U/L=31
