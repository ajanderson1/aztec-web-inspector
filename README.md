# Aztec Web Inspector

Interactive web-based tool for visualizing and debugging Aztec barcodes. Upload an image, and the inspector decodes it, color-codes every module by function, and lets you hover over individual cells to see exactly what they encode.

## Quickstart

```bash
npm install
npm run dev
```

Open `http://localhost:5173`, drop a barcode image onto the canvas, and start exploring.

## Usage

**Load a barcode** by dragging an image onto the canvas or clicking "Load New Image".

**Explore the structure** — each module is color-coded:

| Color | Layer | What it is |
|-------|-------|------------|
| Orange | Finder | Bullseye rings (center pattern) |
| Red | Orientation | Corner markers for rotation detection |
| Green | Mode | Encodes layer count and data codeword count |
| Yellow | Data | Encoded payload codewords |
| Purple | ECC | Reed-Solomon error correction parity |
| Cyan | Alignment | Reference grid lines (full-range only) |
| Gray | Padding | Unused bits to fill the last codeword |

**Hover over any module** to see details in the right panel:

- **Data/ECC modules** show dual highlights — cyan for the RS codeword (fixed-width ECC unit) and amber for the decoded symbol (variable-width character)
- **Finder modules** show which bullseye ring and whether the value matches the expected alternating pattern
- **Orientation markers** show which corner (Top-Left, Top-Right, Bottom-Right, Bottom-Left)
- **Mode message modules** show the decoded layer count, data codeword count, and RS field info

**Controls** (left panel):

- Toggle visibility of each layer
- Enable region outlines to see boundaries between module types
- Enable codeword outlines to see individual RS error correction units

**Navigation**: scroll to zoom (up to 20x), click and drag to pan. Grid lines appear at high zoom.

## Debug Mode

Append `?debug=1` to the URL to auto-load a test barcode and enable verbose console logging. Exposes `window._structure`, `window._grid`, and `window._codewordInfos` for inspection.

## Scripts

```bash
npm run dev        # Dev server with hot reload
npm run build      # Type-check + production build
npm run preview    # Preview production build
npm run test       # Run tests in watch mode
npm run test:run   # Run tests once (CI)
npm run lint       # ESLint
```

## Project Structure

```
src/
  App.tsx                        # Main app: image loading, pipeline, state
  components/
    AztecCanvas.tsx              # Canvas rendering, zoom/pan, dual hover overlay
    ControlPanel.tsx             # Layer toggles and display options
    InfoPanel.tsx                # Barcode metadata and module hover details
    ThemeToggle.tsx              # Light/dark/system theme
  hooks/
    useTheme.ts                  # Theme persistence with localStorage
  lib/
    aztec-decoder.ts             # ZXing WASM integration, perspective correction, grid extraction
    aztec-structure.ts           # Module classification, mode message reading, codeword mapping
    aztec-text-decoder.ts        # Encoding mode state machine (UPPER/LOWER/MIXED/PUNCT/DIGIT)
    aztec-text-decoder.test.ts   # 30+ decoder unit tests
    aztec-decoder.test.ts        # Grid extraction tests
docs/
  aztec-barcode-encoding-guide.md  # Comprehensive technical reference (ISO/IEC 24778)
```

## How It Works

```
Image file
  -> ZXing WASM decode (detect barcode, get corner positions)
  -> Perspective correction + grid extraction (boolean[][])
  -> analyzeAztecGrid: classify every module, read mode message, map codewords
  -> decodeCodewords: run encoding mode state machine, track bit ranges per symbol
  -> Render: color-coded canvas + interactive hover
```

Key insight: **codewords and symbols are different things**. Codewords are fixed-width (6/8/10/12-bit) Reed-Solomon units. Symbols are variable-width (4/5/8-bit) character encoding units. A single symbol can span two codewords. The inspector highlights both independently — cyan for the codeword, amber for the symbol.

## Tech Stack

React 19, TypeScript, Vite, Tailwind CSS, [zxing-wasm](https://github.com/nicyuvi/zxing-wasm) for barcode decoding, Vitest for testing.
