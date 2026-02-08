# Brainstorm: Codeword Hover with Decoded Values

**Date:** 2026-02-05
**Status:** Ready for planning

## What We're Building

Enhanced hover interaction for Aztec barcode modules that shows full codeword context including decoded character values and encoding information.

### User Story

When I hover over any module that belongs to a codeword, I want to:
1. See all modules in that codeword highlighted together
2. See the decoded character(s) this codeword represents
3. See the raw encoding (hex + binary)
4. Understand the encoding mode used (Upper/Lower/Mixed/Punct/Digit)

### Current Behavior

- Hover shows: Position, Type, Value (black/white), Codeword #, Bit Index, Layer
- No codeword highlighting (unless global "Codeword Outlines" toggle is on)
- No decoded value or encoding information

### Proposed Behavior

**Visual:**
- When hovering any module in a codeword, highlight ALL modules in that codeword
- Distinct highlight color (different from static codeword outlines)

**InfoPanel (for data codewords):**
```
Codeword #5 (8-bit)
├─ Decoded: "D" (char 5 of 67)
├─ Encoding: UPPER mode
├─ Raw: 0x04 = 00000100
├─ Modules: 8
└─ Layer: 2
```

**InfoPanel (for ECC codewords):**
```
ECC Codeword #58 (8-bit)
├─ Raw: 0xA3 = 10100011
├─ Reed-Solomon parity
├─ Modules: 8
└─ Layer: 4
```

## Why This Approach

### Full Aztec Decoder Implementation

We chose to implement a full Aztec decoder rather than approximate character mapping because:

1. **Educational value** - The inspector's purpose is understanding Aztec structure
2. **Accuracy** - Aztec encoding is stateful; mode switches and latch codes mean codewords don't map 1:1 to characters
3. **Completeness** - Shows the actual encoding process, not just the result

### Trade-offs Accepted

- **Complexity**: Must implement all 5 encoding modes (Upper, Lower, Mixed, Punct, Digit)
- **Statefulness**: Need to track mode across codeword sequence
- **Edge cases**: Binary mode, FLG(n), ECI sequences

## Key Decisions

1. **Highlight entire codeword on hover** - Visual connection between scattered modules
2. **Show both raw + decoded** - Educational: see the bits AND what they mean
3. **Implement full Aztec decoder** - Accurate mode tracking for correct character mapping
4. **InfoPanel as primary display** - Rich context without cluttering the canvas

## Technical Approach

### Data Structures Needed

```typescript
interface CodewordInfo {
  index: number;           // Codeword position (0-based)
  rawValue: number;        // Numeric value of the codeword
  bitSize: number;         // 4, 6, 8, 10, or 12 bits
  type: 'data' | 'ecc';
  // For data codewords:
  decodedChars?: string;   // Character(s) this codeword produces
  charPositions?: number[]; // Position(s) in final message
  encodingMode?: AztecMode; // Mode at time of encoding
  isModeSwitchOrLatch?: boolean;
}

type AztecMode = 'UPPER' | 'LOWER' | 'MIXED' | 'PUNCT' | 'DIGIT' | 'BINARY';
```

### Aztec Encoding Modes (Reference)

| Mode | Codeword Values | Notes |
|------|-----------------|-------|
| UPPER | A-Z, space | Default starting mode |
| LOWER | a-z, space | |
| MIXED | @\^_`~, 0-9, ctrl | |
| PUNCT | Punctuation | |
| DIGIT | 0-9, ., , | Compact numeric |
| BINARY | Raw bytes | Length-prefixed |

Mode switches:
- **Shift** (PS, BS, etc.) - Temporary, 1 codeword only
- **Latch** (LL, ML, etc.) - Permanent until next latch

### Implementation Steps

1. Build Aztec mode/character tables
2. Implement stateful decoder that processes codewords in sequence
3. Store decoded info per codeword in AztecStructure
4. Add hover highlight logic to AztecCanvas
5. Enhance InfoPanel to show codeword details

## Open Questions

1. **Mode ambiguity**: If we only have the barcode image (not the encoding choices), can we always determine which mode was used? Or do we need to track state from codeword 0?

2. **Performance**: Decoding on every hover, or pre-compute all codeword info on load?

3. **Binary mode**: How to display raw binary data that isn't printable characters?

4. **Mode switch codewords**: How to display codewords that ARE mode switches (no character output)?

## References

- Aztec Code specification: ISO/IEC 24778
- Current codebase: `src/lib/aztec-structure.ts` (module classification)
- Current hover: `src/components/InfoPanel.tsx`

## Next Steps

Run `/workflows:plan` to create implementation plan.
