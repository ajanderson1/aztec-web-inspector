---
title: "Aztec barcode displays wrong modules due to incorrect grid size detection"
category: logic-errors
tags: [aztec, barcode, zxing, grid-detection, image-processing]
module: aztec-web-inspector
symptoms:
  - Displayed barcode completely different from input image
  - Grid size detected as 29 instead of 27
  - Bullseye pattern misaligned
  - Module positions all incorrect
date_solved: 2026-02-05
---

# Aztec Barcode Grid Size Detection Bug

## Problem

When loading an Aztec barcode image into the inspector, the displayed barcode was completely different from the original. A 27x27 compact Aztec code was being detected as 29x29, causing every module to be in the wrong position.

### Symptoms

- Visual output doesn't match input image
- Barcode INFO panel shows correct size (27x27) but rendering is wrong
- Bullseye pattern appears offset or misaligned
- Works for some barcode sizes (91x91) but not others (27x27)

## Root Cause

**Re-implementing detection logic that ZXing already provides accurately.**

The code was:
1. Using ZXing to decode the barcode (which worked correctly)
2. Then re-implementing grid size detection from scratch using bullseye pattern analysis
3. The custom detection was error-prone and returned wrong sizes (29 instead of 27)

Meanwhile, ZXing's `ReadResult.symbol` already contained the exact grid dimensions!

### The Key Insight

ZXing returns a `symbol` object with:
- `width` / `height` - **exact grid size** (what we need!)
- `data` - regenerated barcode image (NOT the original scanned modules)

The trap: Using `symbol.data` directly would give a regenerated barcode, not the original. We need ZXing for the **size** but must sample **module values** from the actual image.

## Solution

### 1. Pass ZXing symbol to grid extraction

```typescript
// App.tsx
const zxingSymbol = result.aztec.rawResult.symbol;
const { grid, normalizedImage } = extractNormalizedGrid(
  imageData,
  result.aztec.position,
  512,
  zxingSymbol  // Pass symbol for accurate size
);
```

### 2. Use ZXing size, sample from image

```typescript
// aztec-decoder.ts
export function extractNormalizedGrid(
  imageData: ImageData,
  position: Position,
  outputSize: number,
  zxingSymbol?: ZXingSymbol  // Optional symbol from ZXing
) {
  let gridSize: number;

  if (zxingSymbol && zxingSymbol.width > 0) {
    // ZXing gives us the exact grid size
    gridSize = zxingSymbol.width;
  } else {
    // Fallback: detect from bullseye (less reliable)
    gridSize = detectGridSize(destImageData, outputSize);
  }

  // Still extract module values from the actual image
  // using perspective transform + Otsu thresholding
  const grid = extractBinaryGrid(destImageData, gridSize, offset);

  return { grid, normalizedImage };
}
```

### 3. Edge margin for boundary modules

Added 0.5px inward margin for edge modules to avoid sampling the quiet zone:

```typescript
const edgeMargin = 0.5;
const xMargin = col === 0 ? edgeMargin : col === gridSize - 1 ? -edgeMargin : 0;
const yMargin = row === 0 ? edgeMargin : row === gridSize - 1 ? -edgeMargin : 0;
```

## Prevention

### Before implementing detection logic:

1. **Check library output first** - What metadata does the decoding library already provide?
2. **Read the type definitions** - ZXing's `ReadResult` interface documents available fields
3. **Understand regenerated vs original** - `symbol.data` is reconstructed, not scanned

### Best practices for ZXing-wasm:

```typescript
// Access ZXing metadata
const result = await readBarcodesFromImageData(imageData, options);
const barcode = result[0];

// Available information:
barcode.text          // Decoded content
barcode.bytes         // Raw bytes
barcode.position      // Corner coordinates
barcode.symbol.width  // Grid width (for 2D codes)
barcode.symbol.height // Grid height
barcode.version       // Version/size string (deprecated but available)
barcode.ecLevel       // Error correction level
```

### Test cases to catch this:

1. Test multiple valid Aztec sizes: 15, 19, 23, 27, 31, 91
2. Compare extracted grid size against expected
3. Verify corner modules match original image
4. Test with both compact (4-ring bullseye) and full-range (7-ring) codes

## Files Changed

- `src/lib/aztec-decoder.ts` - Grid extraction logic
- `src/App.tsx` - Pass ZXing symbol to extraction

## Related

- ZXing-wasm documentation: https://github.com/nicbarker/zxing-wasm
- Aztec code specification: ISO/IEC 24778
