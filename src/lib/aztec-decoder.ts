/**
 * Aztec barcode decoder using zxing-wasm with proper perspective correction
 */

import { readBarcodesFromImageData, type ReaderOptions, type ReadResult } from 'zxing-wasm/reader';

// Debug mode flag - can be enabled to log detailed pipeline info
let debugMode = false;

export function setDebugMode(enabled: boolean): void {
  debugMode = enabled;
}

function debugLog(stage: string, ...args: unknown[]): void {
  if (debugMode) {
    console.log(`[AZTEC DEBUG] ${stage}:`, ...args);
  }
}

export interface PipelineDebugInfo {
  originalCorners: Position;
  normalizedCorners: Position;
  centroid: { x: number; y: number };
  initialGridSize: number;
  candidateSizeScores: Array<{ size: number; score: number }>;
  finalGridSize: number;
  gridOffset: { x: number; y: number };
  bullseyePattern: Array<{ distance: number; expectedBlack: boolean; samples: Array<{ row: number; col: number; x: number; y: number; luminance: number; isBlack: boolean }> }>;
  gridSample: Array<{ row: number; col: number; value: boolean }>;
}

export interface Position {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
}

export interface DecodedAztec {
  text: string;
  bytes: Uint8Array;
  position: Position;
  rawResult: ReadResult;
}

export type DecodeResult =
  | { success: true; aztec: DecodedAztec; imageData: ImageData }
  | { success: false; error: string };

export async function loadImage(file: File): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      URL.revokeObjectURL(url);
      resolve(imageData);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

export async function decodeAztec(imageData: ImageData): Promise<DecodeResult> {
  const options: ReaderOptions = {
    formats: ['Aztec'],
    tryHarder: true,
    tryRotate: true,
    tryInvert: true,
    maxNumberOfSymbols: 1,
  };

  try {
    const results = await readBarcodesFromImageData(imageData, options);

    if (results.length === 0) {
      return { success: false, error: 'No Aztec barcode found in image' };
    }

    const result = results[0];
    const pos = result.position;

    return {
      success: true,
      aztec: {
        text: result.text,
        bytes: result.bytes,
        position: {
          topLeft: { x: pos.topLeft.x, y: pos.topLeft.y },
          topRight: { x: pos.topRight.x, y: pos.topRight.y },
          bottomRight: { x: pos.bottomRight.x, y: pos.bottomRight.y },
          bottomLeft: { x: pos.bottomLeft.x, y: pos.bottomLeft.y },
        },
        rawResult: result,
      },
      imageData,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown decoding error',
    };
  }
}

/**
 * Compute a 3x3 homography matrix that maps from source quadrilateral to destination quadrilateral.
 * Returns the inverse homography (dest -> src) as a flat array [h0, h1, h2, h3, h4, h5, h6, h7, h8].
 *
 * The homography satisfies: [x', y', w'] = H * [x, y, 1] where (x'/w', y'/w') is the transformed point.
 */
function computeHomography(
  src: Array<{ x: number; y: number }>,
  dst: Array<{ x: number; y: number }>
): number[] {
  // We need to find H such that dst = H * src (in homogeneous coordinates)
  // But we want the inverse mapping (dest -> src), so we solve for H: src = H * dst
  //
  // For each point correspondence (dx, dy) -> (sx, sy):
  // sx = (h0*dx + h1*dy + h2) / (h6*dx + h7*dy + h8)
  // sy = (h3*dx + h4*dy + h5) / (h6*dx + h7*dy + h8)
  //
  // Rearranging:
  // h0*dx + h1*dy + h2 - h6*dx*sx - h7*dy*sx - h8*sx = 0
  // h3*dx + h4*dy + h5 - h6*dx*sy - h7*dy*sy - h8*sy = 0

  // Build the 8x9 matrix for the system Ah = 0
  const A: number[][] = [];

  for (let i = 0; i < 4; i++) {
    const dx = dst[i].x, dy = dst[i].y;
    const sx = src[i].x, sy = src[i].y;

    A.push([dx, dy, 1, 0, 0, 0, -dx * sx, -dy * sx, -sx]);
    A.push([0, 0, 0, dx, dy, 1, -dx * sy, -dy * sy, -sy]);
  }

  // Solve using SVD (simplified: use direct solution for 4-point case)
  // For a 4-point correspondence, we can solve the 8x8 system directly
  // Set h8 = 1 and solve the 8x8 system for h0-h7

  // Extract 8x8 matrix (columns 0-7) and 8x1 vector (column 8, negated)
  const M: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 8; i++) {
    M.push(A[i].slice(0, 8));
    b.push(-A[i][8]); // h8 = 1, move to RHS
  }

  // Solve Mx = b using Gaussian elimination with partial pivoting
  const h = solveLinearSystem(M, b);

  if (!h) {
    // Fallback to identity-ish transform if solve fails
    debugLog('WARN', 'Homography solve failed, using fallback');
    return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }

  // h8 = 1
  return [...h, 1];
}

/**
 * Solve a linear system Ax = b using Gaussian elimination with partial pivoting.
 * Returns null if the system is singular.
 */
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length;

  // Create augmented matrix
  const aug: number[][] = A.map((row, i) => [...row, b[i]]);

  // Forward elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col]);
        maxRow = row;
      }
    }

    // Swap rows
    if (maxRow !== col) {
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    }

    // Check for singular matrix
    if (Math.abs(aug[col][col]) < 1e-10) {
      return null;
    }

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = aug[row][n];
    for (let col = row + 1; col < n; col++) {
      sum -= aug[row][col] * x[col];
    }
    x[row] = sum / aug[row][row];
  }

  return x;
}

// ZXing symbol type for grid extraction
export interface ZXingSymbol {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Extract a normalized grid from the barcode region using perspective transform.
 * If ZXing symbol data is provided, use it directly for accurate grid extraction.
 */
export function extractNormalizedGrid(
  imageData: ImageData,
  position: Position,
  outputSize: number,
  zxingSymbol?: ZXingSymbol
): { grid: boolean[][]; normalizedImage: ImageData; debugInfo?: PipelineDebugInfo } {
  let { topLeft, topRight, bottomRight, bottomLeft } = position;

  const originalCorners: Position = {
    topLeft: { ...topLeft },
    topRight: { ...topRight },
    bottomRight: { ...bottomRight },
    bottomLeft: { ...bottomLeft },
  };

  debugLog('STAGE 1 - Original zxing corners', originalCorners);

  // Normalize corner ordering - zxing may return them in different orientations
  // based on how the barcode is rotated in the image. We sort them by quadrant
  // relative to the centroid to ensure consistent ordering.
  const corners = [topLeft, topRight, bottomRight, bottomLeft];
  const cx = corners.reduce((s, c) => s + c.x, 0) / 4;
  const cy = corners.reduce((s, c) => s + c.y, 0) / 4;

  debugLog('STAGE 2 - Centroid', { cx, cy });

  const classified = corners.map(c => ({
    corner: c,
    isLeft: c.x < cx,
    isTop: c.y < cy,
  }));

  debugLog('STAGE 2 - Classified corners', classified);

  topLeft = classified.find(c => c.isLeft && c.isTop)?.corner || topLeft;
  topRight = classified.find(c => !c.isLeft && c.isTop)?.corner || topRight;
  bottomRight = classified.find(c => !c.isLeft && !c.isTop)?.corner || bottomRight;
  bottomLeft = classified.find(c => c.isLeft && !c.isTop)?.corner || bottomLeft;

  const normalizedCorners: Position = {
    topLeft: { ...topLeft },
    topRight: { ...topRight },
    bottomRight: { ...bottomRight },
    bottomLeft: { ...bottomLeft },
  };

  debugLog('STAGE 2 - Normalized corners', normalizedCorners);

  // Create output canvas
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d')!;

  // Create source canvas
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = imageData.width;
  srcCanvas.height = imageData.height;
  const srcCtx = srcCanvas.getContext('2d')!;
  srcCtx.putImageData(imageData, 0, 0);

  // Compute homography matrix for proper perspective transform
  // This correctly handles perspective distortion, unlike bilinear interpolation
  // Maps destination square (0,0)-(outputSize-1,outputSize-1) to source quadrilateral
  const H = computeHomography(
    // Source quadrilateral (from image)
    [topLeft, topRight, bottomRight, bottomLeft],
    // Destination square
    [
      { x: 0, y: 0 },
      { x: outputSize - 1, y: 0 },
      { x: outputSize - 1, y: outputSize - 1 },
      { x: 0, y: outputSize - 1 },
    ]
  );

  debugLog('STAGE 3 - Homography matrix', H);

  // Perspective transform using homography
  const destImageData = ctx.createImageData(outputSize, outputSize);
  const srcData = imageData.data;
  const destData = destImageData.data;

  for (let dy = 0; dy < outputSize; dy++) {
    for (let dx = 0; dx < outputSize; dx++) {
      // Apply inverse homography to find source coordinates
      // H maps src -> dest, so we need H^-1 to map dest -> src
      const w = H[6] * dx + H[7] * dy + H[8];
      const sx = (H[0] * dx + H[1] * dy + H[2]) / w;
      const sy = (H[3] * dx + H[4] * dy + H[5]) / w;

      // Sample source pixel (with bounds check)
      const sx0 = Math.floor(sx);
      const sy0 = Math.floor(sy);

      if (sx0 >= 0 && sx0 < imageData.width && sy0 >= 0 && sy0 < imageData.height) {
        const srcIdx = (sy0 * imageData.width + sx0) * 4;
        const destIdx = (dy * outputSize + dx) * 4;

        destData[destIdx] = srcData[srcIdx];
        destData[destIdx + 1] = srcData[srcIdx + 1];
        destData[destIdx + 2] = srcData[srcIdx + 2];
        destData[destIdx + 3] = 255;
      }
    }
  }

  ctx.putImageData(destImageData, 0, 0);

  debugLog('STAGE 3 - Perspective transform complete', {
    outputSize,
    imageDataSize: { width: destImageData.width, height: destImageData.height },
  });

  // Use ZXing symbol for accurate grid SIZE (but not module values - those are regenerated)
  let gridSize: number;
  let initialGridSize: number;
  const candidateSizeScores: Array<{ size: number; score: number }> = [];

  if (zxingSymbol && zxingSymbol.width > 0 && zxingSymbol.height > 0) {
    // ZXing gives us the exact grid size
    gridSize = zxingSymbol.width; // Aztec codes are square
    initialGridSize = gridSize;
    debugLog('STAGE 4 - Using ZXing symbol size', { gridSize });
  } else {
    // Fallback: Detect grid size by analyzing the bullseye pattern
    initialGridSize = detectGridSize(destImageData, outputSize);
    debugLog('STAGE 4 - Initial grid size detection (fallback)', { initialGridSize });

    // Valid Aztec sizes (compact: 15,19,23,27; full-range: calculated from layers)
    const validAztecSizes = new Set([
      15, 19, 23, 27, // Compact (1-4 layers)
      31, 37, 41, 45, 49, 53, 57, 61, 67, 71, 75, 79, 83, 87, 91, 95, // Full-range
      101, 105, 109, 113, 117, 121, 125, 131, 135, 139, 143, 147, 151 // Full-range continued
    ]);

    // Try multiple grid sizes and pick the one with best bullseye alignment
    const candidateSizes = [initialGridSize - 4, initialGridSize - 2, initialGridSize, initialGridSize + 2, initialGridSize + 4].filter(s => s > 10);
    let bestSize = initialGridSize;
    let bestSizeScore = -1;

    for (const testSize of candidateSizes) {
      const score = scoreBullseyeAlignment(destImageData, outputSize, testSize);
      candidateSizeScores.push({ size: testSize, score });
      const isBetterScore = score > bestSizeScore;
      const isTieWithBetterValidity = score === bestSizeScore && validAztecSizes.has(testSize) && !validAztecSizes.has(bestSize);
      if (isBetterScore || isTieWithBetterValidity) {
        bestSizeScore = score;
        bestSize = testSize;
      }
    }

    gridSize = bestSize;

    debugLog('STAGE 4 - Candidate size scores', candidateSizeScores);
    debugLog('STAGE 4 - Best grid size (fallback)', { gridSize, score: bestSizeScore });
  }

  // Detect grid alignment offset using bullseye pattern matching
  // DISABLED: The offset calculation was causing incorrect sampling at barcode edges.
  // For well-aligned barcodes, the perspective transform already positions modules correctly.
  const offset = { x: 0, y: 0 };
  // const offset = detectGridOffset(destImageData, outputSize, gridSize);

  debugLog('STAGE 5 - Grid offset detection', offset);

  // Calculate Otsu threshold for debug display
  const otsuThreshold = calculateOtsuThreshold(destImageData);
  debugLog('STAGE 5 - Otsu threshold', { threshold: otsuThreshold });

  // Collect bullseye pattern debug info
  const bullseyePattern = collectBullseyeDebugInfo(destImageData, outputSize, gridSize, offset, otsuThreshold);

  debugLog('STAGE 5 - Bullseye pattern', bullseyePattern);

  // Extract binary grid with alignment offset
  const grid = extractBinaryGrid(destImageData, gridSize, offset);

  // DEBUG: Visualize center of extracted grid
  if (debugMode) {
    const center = Math.floor(gridSize / 2);
    const visualRows: string[] = [];
    for (let y = center - 5; y <= center + 5; y++) {
      let row = '';
      for (let x = center - 5; x <= center + 5; x++) {
        row += grid[y]?.[x] ? '█' : '░';
      }
      visualRows.push(row);
    }
    console.log('[AZTEC DEBUG] Extracted grid center (bullseye):\n' + visualRows.join('\n'));
  }

  // Sample a few grid values for debug
  const center = Math.floor(gridSize / 2);
  const gridSample: Array<{ row: number; col: number; value: boolean }> = [];
  for (let d = 0; d <= 6; d++) {
    // Sample cardinal directions from center
    const positions = [
      { row: center, col: center + d },
      { row: center, col: center - d },
      { row: center + d, col: center },
      { row: center - d, col: center },
    ];
    for (const pos of positions) {
      if (pos.row >= 0 && pos.row < gridSize && pos.col >= 0 && pos.col < gridSize) {
        gridSample.push({ ...pos, value: grid[pos.row][pos.col] });
      }
    }
  }

  debugLog('STAGE 6 - Binary grid extracted', { gridSize, gridLength: grid.length });
  debugLog('STAGE 6 - Grid sample (center bullseye)', gridSample);

  const debugInfo: PipelineDebugInfo = {
    originalCorners,
    normalizedCorners,
    centroid: { x: cx, y: cy },
    initialGridSize,
    candidateSizeScores,
    finalGridSize: gridSize,
    gridOffset: offset,
    bullseyePattern,
    gridSample,
  };

  return { grid, normalizedImage: destImageData, debugInfo };
}

/**
 * Collect debug info about bullseye pattern for diagnosis
 */
function collectBullseyeDebugInfo(
  imageData: ImageData,
  outputSize: number,
  gridSize: number,
  offset: { x: number; y: number },
  threshold: number = 128
): Array<{ distance: number; expectedBlack: boolean; samples: Array<{ row: number; col: number; x: number; y: number; luminance: number; isBlack: boolean }> }> {
  const data = imageData.data;
  const moduleSize = outputSize / gridSize;
  const center = Math.floor(gridSize / 2);
  const bullseyeRadius = gridSize > 27 ? 6 : 4;
  const result: Array<{ distance: number; expectedBlack: boolean; samples: Array<{ row: number; col: number; x: number; y: number; luminance: number; isBlack: boolean }> }> = [];

  for (let dist = 0; dist <= bullseyeRadius; dist++) {
    const expectedBlack = dist % 2 === 0;
    const samples: Array<{ row: number; col: number; x: number; y: number; luminance: number; isBlack: boolean }> = [];

    // Check 4 points at this distance (up, down, left, right)
    const points = [
      { row: center, col: center + dist },
      { row: center, col: center - dist },
      { row: center + dist, col: center },
      { row: center - dist, col: center },
    ];

    for (const { row, col } of points) {
      if (row >= 0 && row < gridSize && col >= 0 && col < gridSize) {
        const x = Math.floor((col + 0.5) * moduleSize + offset.x);
        const y = Math.floor((row + 0.5) * moduleSize + offset.y);

        if (x >= 0 && x < outputSize && y >= 0 && y < outputSize) {
          const luminance = getPixelLuminance(data, outputSize, x, y);
          const isBlack = luminance < threshold;
          samples.push({ row, col, x, y, luminance: Math.round(luminance), isBlack });
        }
      }
    }

    result.push({ distance: dist, expectedBlack, samples });
  }

  return result;
}

/**
 * Score how well a given grid size aligns with the bullseye pattern.
 * Tests the center-most sample point (no offset) to see if the bullseye
 * alternating pattern is present.
 */
function scoreBullseyeAlignment(
  imageData: ImageData,
  outputSize: number,
  gridSize: number
): number {
  const data = imageData.data;
  const moduleSize = outputSize / gridSize;
  const center = Math.floor(gridSize / 2);
  const bullseyeRadius = gridSize > 27 ? 6 : 4;

  let score = 0;

  // Check bullseye pattern without any offset first
  for (let dist = 0; dist <= bullseyeRadius; dist++) {
    const expectedBlack = dist % 2 === 0;

    // Sample the 4 cardinal directions
    const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [dr, dc] of directions) {
      const row = center + dr * dist;
      const col = center + dc * dist;

      if (row >= 0 && row < gridSize && col >= 0 && col < gridSize) {
        const x = Math.floor((col + 0.5) * moduleSize);
        const y = Math.floor((row + 0.5) * moduleSize);

        if (x >= 0 && x < outputSize && y >= 0 && y < outputSize) {
          const lum = getPixelLuminance(data, outputSize, x, y);
          const isBlack = lum < 128;

          if (isBlack === expectedBlack) {
            score++;
          }
        }
      }
    }
  }

  return score;
}

/**
 * Detect grid alignment offset by finding the actual center of the bullseye
 * using edge detection. The bullseye has a black center module whose boundaries
 * we can detect by finding where black transitions to white.
 *
 * NOTE: Currently disabled - the offset calculation was causing incorrect sampling
 * at barcode edges. Kept for future use with rotated/skewed barcodes.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// @ts-expect-error Kept for future use with rotated/skewed barcodes
function _detectGridOffset(
  imageData: ImageData,
  outputSize: number,
  gridSize: number
): { x: number; y: number } {
  const data = imageData.data;
  const moduleSize = outputSize / gridSize;
  const nominalCenter = outputSize / 2;

  // First, find the actual darkest point near the center (the bullseye center)
  // Search in a small region around the nominal center
  const searchRadius = Math.floor(moduleSize * 1.5);
  let darkestX = Math.floor(nominalCenter);
  let darkestY = Math.floor(nominalCenter);
  let darkestLum = 255;

  for (let y = Math.floor(nominalCenter) - searchRadius; y <= Math.floor(nominalCenter) + searchRadius; y++) {
    for (let x = Math.floor(nominalCenter) - searchRadius; x <= Math.floor(nominalCenter) + searchRadius; x++) {
      if (x >= 0 && x < outputSize && y >= 0 && y < outputSize) {
        const lum = getPixelLuminance(data, outputSize, x, y);
        if (lum < darkestLum) {
          darkestLum = lum;
          darkestX = x;
          darkestY = y;
        }
      }
    }
  }

  debugLog('STAGE 5a - Darkest point search', {
    nominalCenter: nominalCenter.toFixed(1),
    searchRadius,
    darkestPoint: { x: darkestX, y: darkestY },
    darkestLum: Math.round(darkestLum),
  });

  // Find the edges of the central black module by scanning from the darkest point
  // in all 4 directions until we hit white (luminance > threshold)
  const threshold = 128;

  // Scan right from darkest point to find right edge of black center
  let rightEdge = darkestX;
  for (let x = darkestX; x < Math.min(darkestX + moduleSize * 2, outputSize); x++) {
    const lum = getPixelLuminance(data, outputSize, x, darkestY);
    if (lum > threshold) {
      rightEdge = x - 1; // The last black pixel
      break;
    }
    rightEdge = x;
  }

  // Scan left from darkest point to find left edge of black center
  let leftEdge = darkestX;
  for (let x = darkestX; x > Math.max(darkestX - moduleSize * 2, 0); x--) {
    const lum = getPixelLuminance(data, outputSize, x, darkestY);
    if (lum > threshold) {
      leftEdge = x + 1; // The last black pixel
      break;
    }
    leftEdge = x;
  }

  // Scan down from darkest point to find bottom edge of black center
  let bottomEdge = darkestY;
  for (let y = darkestY; y < Math.min(darkestY + moduleSize * 2, outputSize); y++) {
    const lum = getPixelLuminance(data, outputSize, darkestX, y);
    if (lum > threshold) {
      bottomEdge = y - 1; // The last black pixel
      break;
    }
    bottomEdge = y;
  }

  // Scan up from darkest point to find top edge of black center
  let topEdge = darkestY;
  for (let y = darkestY; y > Math.max(darkestY - moduleSize * 2, 0); y--) {
    const lum = getPixelLuminance(data, outputSize, darkestX, y);
    if (lum > threshold) {
      topEdge = y + 1; // The last black pixel
      break;
    }
    topEdge = y;
  }

  // The actual center is the centroid of the bounding box (inside edges of the black module)
  const actualCenterX = (leftEdge + rightEdge) / 2;
  const actualCenterY = (topEdge + bottomEdge) / 2;

  // The expected center (where the grid would sample) is at the center of the center module
  const gridCenter = Math.floor(gridSize / 2);
  const expectedCenterX = (gridCenter + 0.5) * moduleSize;
  const expectedCenterY = (gridCenter + 0.5) * moduleSize;

  // The offset is the difference between where we expect to sample and where the actual center is
  const offsetX = actualCenterX - expectedCenterX;
  const offsetY = actualCenterY - expectedCenterY;

  debugLog('STAGE 5b - Bullseye edge detection', {
    edges: { left: leftEdge, right: rightEdge, top: topEdge, bottom: bottomEdge },
    moduleWidth: rightEdge - leftEdge + 1,
    moduleHeight: bottomEdge - topEdge + 1,
    actualCenter: { x: actualCenterX.toFixed(2), y: actualCenterY.toFixed(2) },
    expectedCenter: { x: expectedCenterX.toFixed(2), y: expectedCenterY.toFixed(2) },
    offset: { x: offsetX.toFixed(2), y: offsetY.toFixed(2) },
    expectedModuleSize: moduleSize.toFixed(2),
  });

  return { x: offsetX, y: offsetY };
}

/**
 * Detect grid size by:
 * 1. Counting bullseye rings to determine compact vs full-range
 * 2. Measuring module size from bullseye transitions
 * 3. Finding outer barcode boundary
 * 4. Calculating grid size = boundary_size / module_size
 */
function detectGridSize(imageData: ImageData, outputSize: number): number {
  const center = Math.floor(outputSize / 2);
  const data = imageData.data;

  // Step 1: Count bullseye rings and measure module size
  const bullseyeInfo = analyzeBullseye(data, outputSize, center);

  debugLog('STAGE 4a - Bullseye analysis', {
    ringCount: bullseyeInfo.ringCount,
    isCompact: bullseyeInfo.isCompact,
    moduleSize: bullseyeInfo.moduleSize.toFixed(2),
  });

  // Step 2: Find outer boundary of barcode by scanning from edges inward
  const boundary = findBarcodeBoundary(data, outputSize);

  debugLog('STAGE 4b - Barcode boundary', boundary);

  // Step 3: Calculate grid size from boundary and module size
  // The boundary finds first/last black pixels, which are INSIDE the outer modules.
  // The actual barcode span includes the full outer modules, so add moduleSize.
  const moduleSize = bullseyeInfo.moduleSize;
  const barcodeWidth = boundary.right - boundary.left + moduleSize;
  const barcodeHeight = boundary.bottom - boundary.top + moduleSize;
  const avgDimension = (barcodeWidth + barcodeHeight) / 2;

  const estimatedSize = Math.round(avgDimension / moduleSize);

  debugLog('STAGE 4c - Grid size calculation', {
    rawWidth: (boundary.right - boundary.left).toFixed(1),
    rawHeight: (boundary.bottom - boundary.top).toFixed(1),
    barcodeWidth: barcodeWidth.toFixed(1),
    barcodeHeight: barcodeHeight.toFixed(1),
    avgDimension: avgDimension.toFixed(1),
    moduleSize: moduleSize.toFixed(2),
    estimatedSize,
  });

  // Valid Aztec sizes based on compact vs full-range
  const validSizes = bullseyeInfo.isCompact
    ? [15, 19, 23, 27] // Compact (1-4 layers)
    : [31, 37, 41, 45, 49, 53, 57, 61, 67, 71, 75, 79, 83, 87, 91, 95,
       101, 105, 109, 113, 117, 121, 125, 131, 135, 139, 143, 147, 151];

  // Find closest valid Aztec size
  let closest = validSizes[0];
  let minDiff = Math.abs(estimatedSize - closest);

  for (const size of validSizes) {
    const diff = Math.abs(estimatedSize - size);
    if (diff < minDiff) {
      minDiff = diff;
      closest = size;
    }
  }

  debugLog('STAGE 4d - Closest valid size', { estimated: estimatedSize, closest, isCompact: bullseyeInfo.isCompact });

  return closest;
}

/**
 * Analyze the bullseye pattern to determine:
 * - Number of rings (4 for compact, 7 for full-range)
 * - Module size (total bullseye span / number of modules)
 *
 * Simple approach: scan from center, count transitions until pattern breaks,
 * then moduleSize = distance / transitions
 */
function analyzeBullseye(
  data: Uint8ClampedArray,
  outputSize: number,
  center: number
): { ringCount: number; isCompact: boolean; moduleSize: number } {
  const directions = [
    { dx: 1, dy: 0 },  // right
    { dx: -1, dy: 0 }, // left
    { dx: 0, dy: 1 },  // down
    { dx: 0, dy: -1 }, // up
  ];

  const moduleSizeEstimates: number[] = [];
  const transitionCounts: number[] = [];

  for (const { dx, dy } of directions) {
    // Collect all transitions from center outward
    const transitions: number[] = [];
    let lastState = getPixelLuminance(data, outputSize, center, center) < 128;

    for (let pos = 1; pos < outputSize / 3; pos++) {
      const x = center + dx * pos;
      const y = center + dy * pos;

      if (x < 0 || x >= outputSize || y < 0 || y >= outputSize) break;

      const isBlack = getPixelLuminance(data, outputSize, x, y) < 128;
      if (isBlack !== lastState) {
        transitions.push(pos);
        lastState = isBlack;

        // Stop after finding 10 transitions (more than enough for full-range bullseye)
        if (transitions.length >= 10) break;
      }
    }

    if (transitions.length < 4) continue;

    // Calculate individual ring widths
    const ringWidths: number[] = [];
    ringWidths.push(transitions[0]); // First ring from center
    for (let i = 1; i < transitions.length; i++) {
      ringWidths.push(transitions[i] - transitions[i - 1]);
    }

    // Find where the bullseye ends by looking for a significant change in ring width
    // Bullseye rings are uniform; data area has variable widths
    const firstWidth = ringWidths[0];
    let bullseyeEnd = ringWidths.length;

    for (let i = 1; i < ringWidths.length && i < 8; i++) {
      const ratio = ringWidths[i] / firstWidth;
      // If ring width deviates by more than 50%, we've left the bullseye
      if (ratio < 0.5 || ratio > 2.0) {
        bullseyeEnd = i;
        break;
      }
    }

    // Module size = average of bullseye ring widths
    const bullseyeWidths = ringWidths.slice(0, bullseyeEnd);
    if (bullseyeWidths.length >= 4) {
      const avgWidth = bullseyeWidths.reduce((a, b) => a + b, 0) / bullseyeWidths.length;
      moduleSizeEstimates.push(avgWidth);
      transitionCounts.push(bullseyeEnd);
    }
  }

  if (moduleSizeEstimates.length === 0) {
    return { ringCount: 4, isCompact: true, moduleSize: outputSize / 50 };
  }

  // Use median module size
  moduleSizeEstimates.sort((a, b) => a - b);
  const moduleSize = moduleSizeEstimates[Math.floor(moduleSizeEstimates.length / 2)];

  // Determine compact vs full-range based on transition count
  const avgTransitions = transitionCounts.reduce((a, b) => a + b, 0) / transitionCounts.length;
  const isCompact = avgTransitions < 5.5;

  debugLog('STAGE 4a - Bullseye analysis', {
    moduleSizeEstimates: moduleSizeEstimates.map(m => m.toFixed(2)),
    transitionCounts,
    avgTransitions: avgTransitions.toFixed(1),
    moduleSize: moduleSize.toFixed(2),
    isCompact,
  });

  return {
    ringCount: isCompact ? 4 : 7,
    isCompact,
    moduleSize,
  };
}

/**
 * Find the outer boundary of the barcode by scanning multiple lines.
 * Uses the outermost black pixels found across all scan lines for accuracy.
 */
function findBarcodeBoundary(
  data: Uint8ClampedArray,
  outputSize: number
): { left: number; right: number; top: number; bottom: number } {
  const threshold = 128;

  // Scan multiple horizontal lines to find left/right boundaries
  let globalLeft = outputSize;
  let globalRight = 0;

  // Sample many y positions across the image
  for (let y = Math.floor(outputSize * 0.1); y < outputSize * 0.9; y += Math.floor(outputSize / 20)) {
    // Find leftmost black pixel on this line
    for (let x = 0; x < outputSize; x++) {
      if (getPixelLuminance(data, outputSize, x, y) < threshold) {
        if (x < globalLeft) globalLeft = x;
        break;
      }
    }
    // Find rightmost black pixel on this line
    for (let x = outputSize - 1; x >= 0; x--) {
      if (getPixelLuminance(data, outputSize, x, y) < threshold) {
        if (x > globalRight) globalRight = x;
        break;
      }
    }
  }

  // Scan multiple vertical lines to find top/bottom boundaries
  let globalTop = outputSize;
  let globalBottom = 0;

  for (let x = Math.floor(outputSize * 0.1); x < outputSize * 0.9; x += Math.floor(outputSize / 20)) {
    // Find topmost black pixel on this column
    for (let y = 0; y < outputSize; y++) {
      if (getPixelLuminance(data, outputSize, x, y) < threshold) {
        if (y < globalTop) globalTop = y;
        break;
      }
    }
    // Find bottommost black pixel on this column
    for (let y = outputSize - 1; y >= 0; y--) {
      if (getPixelLuminance(data, outputSize, x, y) < threshold) {
        if (y > globalBottom) globalBottom = y;
        break;
      }
    }
  }

  // The boundary is the first/last black pixel, but we need the outer edge of those modules
  // The black pixel is inside the module, so add a small margin based on expected module size
  // For now, just use the detected boundaries - the +1 in grid calculation handles this

  return {
    left: globalLeft,
    right: globalRight,
    top: globalTop,
    bottom: globalBottom
  };
}

function getPixelLuminance(data: Uint8ClampedArray, width: number, x: number, y: number): number {
  const idx = (y * width + x) * 4;
  return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
}

/**
 * Calculate Otsu's threshold for the image
 */
function calculateOtsuThreshold(imageData: ImageData): number {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;

  // Build histogram
  const histogram = new Array(256).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const lum = Math.round(getPixelLuminance(data, width, x, y));
      histogram[lum]++;
    }
  }

  const total = width * height;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * histogram[i];
  }

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let maxVariance = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;

    wF = total - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];

    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;

    const variance = wB * wF * (mB - mF) * (mB - mF);

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }

  return threshold;
}

/**
 * Extract binary grid from normalized image
 */
function extractBinaryGrid(
  imageData: ImageData,
  gridSize: number,
  offset: { x: number; y: number } = { x: 0, y: 0 }
): boolean[][] {
  const outputSize = imageData.width;
  const moduleSize = outputSize / gridSize;
  const data = imageData.data;
  const grid: boolean[][] = [];
  const center = Math.floor(gridSize / 2);

  // Calculate optimal threshold using Otsu's method
  const threshold = calculateOtsuThreshold(imageData);

  debugLog('STAGE 6 - Binary grid extraction params', {
    gridSize,
    outputSize,
    moduleSize: moduleSize.toFixed(3),
    offset,
    sampleRadius: Math.max(1, Math.floor(moduleSize / 4)),
    otsuThreshold: threshold,
  });

  // Debug: log a few specific module sampling details
  const debugModules: Array<{row: number; col: number; x: number; y: number; lum: number; isBlack: boolean}> = [];

  // For edge modules only, apply a small inward margin to avoid sampling
  // boundary artifacts from the perspective transform or quiet zone.
  const edgeMargin = 0.5;

  for (let row = 0; row < gridSize; row++) {
    grid[row] = [];
    for (let col = 0; col < gridSize; col++) {
      // Apply margin only to edge modules (first/last row/column)
      const xMargin = col === 0 ? edgeMargin : col === gridSize - 1 ? -edgeMargin : 0;
      const yMargin = row === 0 ? edgeMargin : row === gridSize - 1 ? -edgeMargin : 0;

      // Sample at center of module, adjusted by offset and edge-specific margin
      const x = Math.floor((col + 0.5) * moduleSize + offset.x + xMargin);
      const y = Math.floor((row + 0.5) * moduleSize + offset.y + yMargin);

      // Sample a small area around the module center
      let totalLuminance = 0;
      let sampleCount = 0;
      const sampleRadius = Math.max(1, Math.floor(moduleSize / 4));

      for (let dy = -sampleRadius; dy <= sampleRadius; dy++) {
        for (let dx = -sampleRadius; dx <= sampleRadius; dx++) {
          const sx = Math.max(0, Math.min(outputSize - 1, x + dx));
          const sy = Math.max(0, Math.min(outputSize - 1, y + dy));
          totalLuminance += getPixelLuminance(data, outputSize, sx, sy);
          sampleCount++;
        }
      }

      const avgLuminance = totalLuminance / sampleCount;
      const isBlack = avgLuminance <= threshold;
      grid[row][col] = isBlack;

      // Log bullseye modules and corners for debugging
      const dx = col - center;
      const dy = row - center;
      const chebyshev = Math.max(Math.abs(dx), Math.abs(dy));
      const isOnCardinal = dx === 0 || dy === 0;
      const isCorner = row === 0 || row === gridSize - 1 || col === 0 || col === gridSize - 1;

      if ((chebyshev <= 6 && isOnCardinal) || isCorner) {
        debugModules.push({ row, col, x, y, lum: Math.round(avgLuminance), isBlack });
      }
    }
  }

  debugLog('STAGE 6 - Debug module samples', debugModules);

  return grid;
}
