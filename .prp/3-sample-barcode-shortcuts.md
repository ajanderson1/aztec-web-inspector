# PRP: Add sample barcode shortcuts in upload area

## Issue
GitHub Issue #3 - Add sample barcode shortcuts in upload area

## Summary
Add 3-5 small Aztec barcode thumbnail previews in the initial upload area. Clicking a thumbnail loads that sample into the decode pipeline for quick testing/demos.

## Implementation Plan

### 1. Generate sample Aztec barcode images
- Create `public/samples/` directory
- Generate 4 sample Aztec barcodes of varying types/sizes using Python `aztec_code_generator` or similar
- Include mix of compact and full-range, different layer counts
- Target small file sizes (PNG, ~100-200px source images)

### 2. Add sample thumbnail handler in `App.tsx`
- Add a `handleSampleClick` callback that:
  - Calls `e.stopPropagation()` to prevent file picker from opening
  - Calls `loadImageFromUrl()` with the sample path
  - Pipes result to `processImageData()`
- Define sample metadata array: `{ src: string, label: string }[]`

### 3. Add thumbnail UI in upload area
- Below the "or click to browse" text (after line 338)
- Add a "Try a sample" label + row of ~40-48px thumbnail images
- Each thumbnail is a clickable `<img>` with `onClick={handleSampleClick}`
- Style: subtle, small, rounded, with hover effect
- Dark mode support via Tailwind classes

### Files Modified
- `src/App.tsx` - Add sample data, handler, and thumbnail JSX in upload area
- `public/samples/` - New directory with 4 sample barcode images

### Edge Cases
- `stopPropagation()` on thumbnail clicks prevents file picker trigger
- Existing drag-and-drop unaffected (thumbnails are inside the drop zone but don't interfere)
