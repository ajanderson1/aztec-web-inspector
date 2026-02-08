/**
 * Aztec barcode structure analysis
 * Ported from aztec_extract.py with ZXing algorithm accuracy
 */

import { extractCodewordValues } from './aztec-text-decoder';

export interface ModeMessageInfo {
  /** Number of data layers (decoded from mode message) */
  layers: number;
  /** Number of data codewords (decoded from mode message) */
  dataCodewords: number;
  /** Raw mode message bits in reading order */
  rawBits: boolean[];
  /** Whether mode message was successfully decoded */
  valid: boolean;
}

export interface AztecStructure {
  size: number;
  isCompact: boolean;
  layers: number;
  codewordSize: number;
  baseMatrixSize: number;
  totalBits: number;
  totalCodewords: number;
  dataCodewords: number;
  eccCodewords: number;
  paddingBits: number;
  moduleGrid: boolean[][];
  modules: ModuleInfo[][];
  codewordModules: Map<number, [number, number][]>;
  codewordValues: number[];
  modeMessage: ModeMessageInfo;
  /** Data bit positions: maps each bit index in the data stream to (x,y) on the grid */
  dataBitPositions: [number, number][];
}

export interface ModuleInfo {
  x: number;
  y: number;
  isBlack: boolean;
  type: ModuleType;
  layer?: number;
  codewordIndex?: number;
  bitIndex?: number;
}

export type ModuleType =
  | 'finder'
  | 'orientation'
  | 'mode'
  | 'data'
  | 'ecc'
  | 'alignment'
  | 'padding';

export const MODULE_COLORS: Record<ModuleType, string> = {
  finder: '#ff6b00',
  orientation: '#ff0000',
  mode: '#00ff00',
  data: '#ffcc00',
  ecc: '#b400ff',
  alignment: '#00c8ff',
  padding: '#666666',
};

export const MODULE_NAMES: Record<ModuleType, string> = {
  finder: 'Finder Pattern',
  orientation: 'Orientation',
  mode: 'Mode Message',
  data: 'Data Codewords',
  ecc: 'ECC Codewords',
  alignment: 'Reference Grid',
  padding: 'Padding Bits',
};

export const MODULE_DESCRIPTIONS: Record<ModuleType, string> = {
  finder: "Bull's-eye for location & orientation",
  orientation: 'Rotation detection (L-shapes)',
  mode: 'Size & ECC info',
  data: 'Encoded payload',
  ecc: 'Error correction',
  alignment: 'Reference grid lines',
  padding: 'Unused bit positions',
};

// ZXing WORD_SIZE array
function getCodewordSize(layers: number): number {
  const wordSizes = [
    4, 6, 6, 8, 8, 8, 8, 8, 8,
    10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10,
    12, 12, 12, 12, 12, 12, 12, 12, 12, 12,
  ];
  return layers < wordSizes.length ? wordSizes[layers] : 12;
}

function getTotalBits(layers: number, compact: boolean): number {
  return ((compact ? 88 : 112) + 16 * layers) * layers;
}

function calculateLayers(size: number, compact: boolean): number {
  if (compact) {
    return (size - 11) / 4;
  }
  for (let layers = 1; layers <= 32; layers++) {
    const baseSize = 14 + 4 * layers;
    const alignmentLines = 1 + 2 * Math.floor((baseSize / 2 - 1) / 15);
    if (baseSize + alignmentLines === size) {
      return layers;
    }
  }
  return Math.round((size - 15) / 4);
}

/**
 * Determine if an Aztec code is compact or full-range.
 * Compact sizes: 15, 19, 23, 27 (1-4 layers)
 * Full-range starts at 19 with reference grid lines.
 *
 * For ambiguous sizes (19, 23, 27), we check the grid for reference lines.
 * Reference grid lines appear at every 16 modules from center in full-range codes.
 */
function isCompactAztec(size: number, grid?: boolean[][]): boolean {
  // Size 15 is always compact (1 layer compact)
  if (size === 15) return true;

  // Sizes > 27 are always full-range
  if (size > 27) return false;

  // For ambiguous sizes (19, 23, 27), check for reference grid lines
  // Full-range codes have alternating reference lines at center row/col
  // Compact codes don't have reference grid
  if (grid && (size === 19 || size === 23 || size === 27)) {
    const center = Math.floor(size / 2);
    // In full-range, the center row should have reference grid pattern
    // Check if there's a clear alternating pattern extending beyond the bullseye
    // Full-range bullseye is 13x13 (dist 6), compact is 9x9 (dist 4)
    // At distance 7+ from center, full-range has reference grid
    const checkDist = 8; // Beyond compact bullseye
    if (center + checkDist < size) {
      // Reference grid at center row should alternate starting with a specific pattern
      // If the pattern matches typical reference grid, it's full-range
      const hasRefGrid = checkReferenceGridPattern(grid, size, center);
      return !hasRefGrid;
    }
  }

  // Default: assume compact for small sizes without grid to check
  return size <= 27;
}

/**
 * Check if the grid has reference grid lines (indicates full-range)
 */
function checkReferenceGridPattern(grid: boolean[][], size: number, center: number): boolean {
  // Reference grid lines are at the center row/column
  // They extend across the entire code and alternate black/white
  // Check if modules beyond the compact bullseye (dist > 5) show alternating pattern

  // For full-range, distance 7 is mode message, distance 8+ is data with ref grid
  // Check a few modules along the center row beyond distance 7
  const startDist = 8;
  const endDist = Math.min(12, Math.floor(size / 2) - 1);

  if (endDist <= startDist) return false;

  // Count alternations - reference grid should alternate every module
  let alternations = 0;
  let total = 0;

  for (let d = startDist; d < endDist; d++) {
    const x1 = center + d;
    const x2 = center + d + 1;
    if (x2 < size) {
      const v1 = grid[center]?.[x1] ?? false;
      const v2 = grid[center]?.[x2] ?? false;
      if (v1 !== v2) alternations++;
      total++;
    }
  }

  // If most transitions alternate, it's likely a reference grid (full-range)
  return total > 0 && alternations / total > 0.7;
}

function buildAlignmentMap(layers: number, compact: boolean): number[] {
  const baseMatrixSize = (compact ? 11 : 14) + layers * 4;
  if (compact) {
    return Array.from({ length: baseMatrixSize }, (_, i) => i);
  }
  const matrixSize = baseMatrixSize + 1 + 2 * Math.floor((baseMatrixSize / 2 - 1) / 15);
  const origCenter = Math.floor(baseMatrixSize / 2);
  const center = Math.floor(matrixSize / 2);
  const alignmentMap = new Array(baseMatrixSize).fill(0);
  for (let i = 0; i < origCenter; i++) {
    const newOffset = i + Math.floor(i / 15);
    alignmentMap[origCenter - i - 1] = center - newOffset - 1;
    alignmentMap[origCenter + i] = center + newOffset + 1;
  }
  return alignmentMap;
}

function getAlignmentPositions(size: number): Set<number> {
  const positions = new Set<number>();
  const center = Math.floor(size / 2);
  positions.add(center);
  for (let offset = 16; center - offset >= 0; offset += 16) {
    positions.add(center - offset);
    positions.add(center + offset);
  }
  return positions;
}

function extractBitPositions(layers: number, compact: boolean): [number, number][] {
  const baseMatrixSize = (compact ? 11 : 14) + layers * 4;
  const alignmentMap = buildAlignmentMap(layers, compact);
  const bitPositions: [number, number][] = [];

  for (let layer = 0; layer < layers; layer++) {
    const rowSize = (layers - layer) * 4 + (compact ? 9 : 12);
    const low = layer * 2;
    const high = baseMatrixSize - 1 - low;

    for (let j = 0; j < rowSize; j++) {
      for (let k = 0; k < 2; k++) {
        bitPositions.push([alignmentMap[low + k], alignmentMap[low + j]]);
      }
    }
    for (let j = 0; j < rowSize; j++) {
      for (let k = 0; k < 2; k++) {
        bitPositions.push([alignmentMap[low + j], alignmentMap[high - k]]);
      }
    }
    for (let j = 0; j < rowSize; j++) {
      for (let k = 0; k < 2; k++) {
        bitPositions.push([alignmentMap[high - k], alignmentMap[high - j]]);
      }
    }
    for (let j = 0; j < rowSize; j++) {
      for (let k = 0; k < 2; k++) {
        bitPositions.push([alignmentMap[high - j], alignmentMap[low + k]]);
      }
    }
  }

  return bitPositions;
}

function mapModulesToCodewords(layers: number, compact: boolean, numDataCodewords?: number) {
  const codewordSize = getCodewordSize(layers);
  const totalBits = getTotalBits(layers, compact);
  const totalCodewords = Math.floor(totalBits / codewordSize);
  const paddingBits = totalBits % codewordSize;

  if (numDataCodewords === undefined) {
    numDataCodewords = Math.floor(totalCodewords * 0.75);
  }

  const bitPositions = extractBitPositions(layers, compact);
  const moduleToCodeword = new Map<string, { codewordIndex: number; bitInCodeword: number; isData: boolean }>();
  const codewordModules = new Map<number, [number, number][]>();
  const paddingModules: [number, number][] = [];

  for (let i = 0; i < totalCodewords; i++) {
    codewordModules.set(i, []);
  }

  for (let bitIndex = 0; bitIndex < bitPositions.length; bitIndex++) {
    const [x, y] = bitPositions[bitIndex];
    if (bitIndex < paddingBits) {
      paddingModules.push([x, y]);
      continue;
    }
    const dataBitIndex = bitIndex - paddingBits;
    const codewordIndex = Math.floor(dataBitIndex / codewordSize);
    const bitInCodeword = dataBitIndex % codewordSize;
    if (codewordIndex < totalCodewords) {
      const isData = codewordIndex < numDataCodewords;
      moduleToCodeword.set(`${x},${y}`, { codewordIndex, bitInCodeword, isData });
      codewordModules.get(codewordIndex)!.push([x, y]);
    }
  }

  return { moduleToCodeword, codewordModules, codewordSize, totalCodewords, numDataCodewords, paddingBits, paddingModules };
}

/**
 * Read the mode message bits in ZXing reading order.
 *
 * Reading proceeds around the 4 sides of the mode message ring
 * (top→right→bottom→left), skipping the 3 orientation modules at
 * each corner and any alignment line modules.
 *
 * Returns positions in absolute grid coordinates.
 */
function getModeMessagePositions(
  center: number,
  radius: number,
  compact: boolean,
  alignmentPositions: Set<number>,
): [number, number][] {
  const positions: [number, number][] = [];

  // ZXing reads from 4 corners, 2 modules in from each corner edge
  // Directions: top-left→ top, top-right → right, bottom-right → bottom, bottom-left → left
  const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

  for (const [dx, dy] of corners) {
    // Corner is at (radius*dx, radius*dy) from center
    // next direction: when dx==dy, go (-dx, 0); otherwise go (0, -dy)
    const nextX = dx === dy ? -dx : 0;
    const nextY = dx === dy ? 0 : -dy;

    for (let i = 2; i <= 2 * radius - 2; i++) {
      const x = center + radius * dx + i * nextX;
      const y = center + radius * dy + i * nextY;

      // Skip modules on alignment lines (full-range only)
      if (!compact && (alignmentPositions.has(x) || alignmentPositions.has(y))) {
        continue;
      }

      positions.push([x, y]);
    }
  }

  return positions;
}

/**
 * Read and decode the mode message from the grid.
 *
 * The mode message is encoded in 4-bit RS codewords around the bullseye.
 * Data codewords come first, then check codewords:
 *   Compact: 2 data + 5 check = 7 codewords (28 bits)
 *   Full:    4 data + 6 check = 10 codewords (40 bits)
 *
 * Since ZXing has already validated the barcode, we read the data
 * portion directly without RS decoding.
 */
function readModeMessage(
  grid: boolean[][],
  size: number,
  compact: boolean,
  alignmentPositions: Set<number>,
): ModeMessageInfo {
  const center = Math.floor(size / 2);
  const radius = compact ? 5 : 7;

  const positions = getModeMessagePositions(center, radius, compact, alignmentPositions);
  const rawBits = positions.map(([x, y]) => grid[y]?.[x] ?? false);

  const expectedBits = compact ? 28 : 40;
  if (rawBits.length !== expectedBits) {
    return { layers: 0, dataCodewords: 0, rawBits, valid: false };
  }

  // Data portion: first 8 bits (compact) or 16 bits (full)
  const dataBitCount = compact ? 8 : 16;
  let dataValue = 0;
  for (let i = 0; i < dataBitCount; i++) {
    dataValue = (dataValue << 1) | (rawBits[i] ? 1 : 0);
  }

  let layers: number;
  let dataCodewords: number;

  if (compact) {
    // Compact: bits[7:6] = layers-1, bits[5:0] = dataCodewords-1
    layers = ((dataValue >> 6) & 0x3) + 1;
    dataCodewords = (dataValue & 0x3F) + 1;
  } else {
    // Full: bits[15:11] = layers-1, bits[10:0] = dataCodewords-1
    layers = ((dataValue >> 11) & 0x1F) + 1;
    dataCodewords = (dataValue & 0x7FF) + 1;
  }

  return { layers, dataCodewords, rawBits, valid: true };
}

export function analyzeAztecGrid(grid: boolean[][], size: number): AztecStructure {
  const compact = isCompactAztec(size, grid);
  const layers = calculateLayers(size, compact);
  const baseMatrixSize = (compact ? 11 : 14) + layers * 4;
  const codewordSize = getCodewordSize(layers);
  const totalBits = getTotalBits(layers, compact);
  const totalCodewords = Math.floor(totalBits / codewordSize);
  const paddingBits = totalBits % codewordSize;

  const center = Math.floor(size / 2);
  const bullseyeHalf = compact ? 4 : 6;
  const modeRing = compact ? 5 : 7;
  const alignmentPositions = compact ? new Set<number>() : getAlignmentPositions(size);

  // Read mode message for actual data codeword count
  const modeMessage = readModeMessage(grid, size, compact, alignmentPositions);
  const dataCodewords = modeMessage.valid
    ? Math.min(modeMessage.dataCodewords, totalCodewords)
    : Math.floor(totalCodewords * 0.75);  // fallback
  const eccCodewords = totalCodewords - dataCodewords;

  const codewordMapping = mapModulesToCodewords(layers, compact, dataCodewords);
  const { moduleToCodeword, codewordModules, paddingModules } = codewordMapping;
  const paddingSet = new Set(paddingModules.map(([x, y]) => `${x},${y}`));

  // Orientation marks
  const orientationSet = new Set<string>();
  const cornerOffsets = [
    [[-modeRing, -modeRing], [-modeRing + 1, -modeRing], [-modeRing, -modeRing + 1]],
    [[modeRing, -modeRing], [modeRing - 1, -modeRing], [modeRing, -modeRing + 1]],
    [[modeRing, modeRing], [modeRing - 1, modeRing], [modeRing, modeRing - 1]],
    [[-modeRing, modeRing], [-modeRing + 1, modeRing], [-modeRing, modeRing - 1]],
  ];
  for (const corner of cornerOffsets) {
    for (const [dx, dy] of corner) {
      orientationSet.add(`${center + dx},${center + dy}`);
    }
  }

  // Mode message
  const modeSet = new Set<string>();
  const modeSpan = compact ? 3 : 5;
  for (let x = center - modeSpan; x <= center + modeSpan; x++) {
    modeSet.add(`${x},${center - modeRing}`);
    modeSet.add(`${x},${center + modeRing}`);
  }
  for (let y = center - modeSpan; y <= center + modeSpan; y++) {
    modeSet.add(`${center - modeRing},${y}`);
    modeSet.add(`${center + modeRing},${y}`);
  }

  const modules: ModuleInfo[][] = [];
  for (let y = 0; y < size; y++) {
    modules[y] = [];
    for (let x = 0; x < size; x++) {
      const isBlack = grid[y]?.[x] ?? false;
      const dx = x - center;
      const dy = y - center;
      const chebyshev = Math.max(Math.abs(dx), Math.abs(dy));
      const key = `${x},${y}`;

      let type: ModuleType;
      let layer: number | undefined;
      let codewordIndex: number | undefined;
      let bitIndex: number | undefined;

      if (alignmentPositions.has(x) || alignmentPositions.has(y)) {
        type = 'alignment';
      } else if (chebyshev <= bullseyeHalf) {
        type = 'finder';
      } else if (orientationSet.has(key)) {
        type = 'orientation';
      } else if (modeSet.has(key)) {
        type = 'mode';
      } else if (paddingSet.has(key)) {
        type = 'padding';
      } else if (moduleToCodeword.has(key)) {
        const info = moduleToCodeword.get(key)!;
        type = info.isData ? 'data' : 'ecc';
        codewordIndex = info.codewordIndex;
        bitIndex = info.bitInCodeword;
        layer = Math.floor(info.codewordIndex / (totalCodewords / layers));
      } else {
        type = 'data';
      }

      modules[y][x] = { x, y, isBlack, type, layer, codewordIndex, bitIndex };
    }
  }

  const codewordValues = extractCodewordValues(grid, codewordModules, codewordSize, totalCodewords);

  // Build data bit positions: strip padding bits from the front of the bit stream.
  // Each entry maps a data bit index to its (x,y) position on the grid.
  const allBitPositions = extractBitPositions(layers, compact);
  const dataBitPositions = allBitPositions.slice(paddingBits);

  return {
    size,
    isCompact: compact,
    layers,
    codewordSize,
    baseMatrixSize,
    totalBits,
    totalCodewords,
    dataCodewords,
    eccCodewords,
    paddingBits,
    moduleGrid: grid,
    modules,
    codewordModules,
    codewordValues,
    modeMessage,
    dataBitPositions,
  };
}

/**
 * Compute the outline path for a codeword (group of modules)
 */
export function computeCodewordOutline(modules: [number, number][]): { path: string; bounds: { minX: number; minY: number; maxX: number; maxY: number } } | null {
  if (modules.length === 0) return null;

  // Create a set for quick lookup
  const moduleSet = new Set(modules.map(([x, y]) => `${x},${y}`));

  // Find bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of modules) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  // Build edge segments (only edges that border empty space)
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];

  for (const [x, y] of modules) {
    // Check each edge of this module
    // Top edge
    if (!moduleSet.has(`${x},${y - 1}`)) {
      edges.push({ x1: x, y1: y, x2: x + 1, y2: y });
    }
    // Bottom edge
    if (!moduleSet.has(`${x},${y + 1}`)) {
      edges.push({ x1: x, y1: y + 1, x2: x + 1, y2: y + 1 });
    }
    // Left edge
    if (!moduleSet.has(`${x - 1},${y}`)) {
      edges.push({ x1: x, y1: y, x2: x, y2: y + 1 });
    }
    // Right edge
    if (!moduleSet.has(`${x + 1},${y}`)) {
      edges.push({ x1: x + 1, y1: y, x2: x + 1, y2: y + 1 });
    }
  }

  if (edges.length === 0) return null;

  // Build path by connecting edges
  const edgeMap = new Map<string, { x: number; y: number }[]>();
  for (const edge of edges) {
    const key1 = `${edge.x1},${edge.y1}`;
    const key2 = `${edge.x2},${edge.y2}`;
    if (!edgeMap.has(key1)) edgeMap.set(key1, []);
    if (!edgeMap.has(key2)) edgeMap.set(key2, []);
    edgeMap.get(key1)!.push({ x: edge.x2, y: edge.y2 });
    edgeMap.get(key2)!.push({ x: edge.x1, y: edge.y1 });
  }

  // Trace the outline
  const visited = new Set<string>();
  const paths: string[] = [];

  for (const [startKey] of edgeMap) {
    if (visited.has(startKey)) continue;

    const [sx, sy] = startKey.split(',').map(Number);
    let pathStr = `M ${sx} ${sy}`;
    let current = { x: sx, y: sy };
    visited.add(startKey);

    while (true) {
      const currentKey = `${current.x},${current.y}`;
      const nextPoints = edgeMap.get(currentKey) || [];
      const unvisitedNext = nextPoints.find(p => {
        const edgeKey = `${Math.min(current.x, p.x)},${Math.min(current.y, p.y)}-${Math.max(current.x, p.x)},${Math.max(current.y, p.y)}`;
        return !visited.has(edgeKey);
      });

      if (!unvisitedNext) break;

      const edgeKey = `${Math.min(current.x, unvisitedNext.x)},${Math.min(current.y, unvisitedNext.y)}-${Math.max(current.x, unvisitedNext.x)},${Math.max(current.y, unvisitedNext.y)}`;
      visited.add(edgeKey);
      visited.add(`${unvisitedNext.x},${unvisitedNext.y}`);

      pathStr += ` L ${unvisitedNext.x} ${unvisitedNext.y}`;
      current = unvisitedNext;
    }

    pathStr += ' Z';
    paths.push(pathStr);
  }

  return { path: paths.join(' '), bounds: { minX, minY, maxX, maxY } };
}
