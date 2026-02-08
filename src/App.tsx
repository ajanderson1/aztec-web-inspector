import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Upload, Grid3X3 } from 'lucide-react';
import { useTheme } from './hooks/useTheme';
import { ThemeToggle } from './components/ThemeToggle';
import { AztecCanvas } from './components/AztecCanvas';
import { ControlPanel } from './components/ControlPanel';
import { InfoPanel } from './components/InfoPanel';
import { loadImage, decodeAztec, extractNormalizedGrid, setDebugMode, type PipelineDebugInfo } from './lib/aztec-decoder';
import { analyzeAztecGrid } from './lib/aztec-structure';
import type { AztecStructure, ModuleInfo } from './lib/aztec-structure';
import { decodeCodewords, findSymbolAtBit, getModulesForBitRange, type CodewordInfo } from './lib/aztec-text-decoder';

// Check for debug mode via URL parameter
const isDebugMode = new URLSearchParams(window.location.search).get('debug') === '1';
if (isDebugMode) {
  setDebugMode(true);
  console.log('[AZTEC DEBUG] Debug mode enabled');
}

/**
 * Load an image from URL and return ImageData
 */
async function loadImageFromUrl(url: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      resolve(imageData);
    };

    img.onerror = () => {
      reject(new Error('Failed to load image from URL'));
    };

    img.src = url;
  });
}

interface LayerVisibility {
  finder: boolean;
  orientation: boolean;
  mode: boolean;
  data: boolean;
  ecc: boolean;
  alignment: boolean;
  padding: boolean;
}

function App() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const [structure, setStructure] = useState<AztecStructure | null>(null);
  const [codewordInfos, setCodewordInfos] = useState<CodewordInfo[]>([]);
  const [decodedText, setDecodedText] = useState('');
  const [hoveredModule, setHoveredModule] = useState<ModuleInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [layers, setLayers] = useState<LayerVisibility>({
    finder: true,
    orientation: true,
    mode: true,
    data: true,
    ecc: true,
    alignment: true,
    padding: true,
  });

  const [showOutlines, setShowOutlines] = useState(false);
  const [showCodewordOutlines, setShowCodewordOutlines] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Debug info state - only used in debug mode
  const [_debugInfo, setDebugInfo] = useState<PipelineDebugInfo | null>(null);
  void _debugInfo; // Suppress unused variable warning - accessed via console in debug mode

  const processImageData = useCallback(async (imageData: ImageData) => {
    setIsLoading(true);
    setError(null);
    // Don't clear structure/text immediately - keep previous barcode visible under loading overlay
    setDebugInfo(null);

    try {
      if (isDebugMode) {
        console.log('[AZTEC DEBUG] Processing image', {
          width: imageData.width,
          height: imageData.height,
        });
      }

      const result = await decodeAztec(imageData);

      if (!result.success) {
        setError(result.error);
        setStructure(null);
        setCodewordInfos([]);
        setDecodedText('');
        setIsLoading(false);
        return;
      }

      // Get ZXing symbol data for accurate grid extraction
      const zxingSymbol = result.aztec.rawResult.symbol;

      if (isDebugMode) {
        const rr = result.aztec.rawResult;
        console.log('[AZTEC DEBUG] zxing decode result', {
          text: result.aztec.text,
          position: result.aztec.position,
          symbolSize: zxingSymbol ? `${zxingSymbol.width}x${zxingSymbol.height}` : 'N/A',
          version: rr.version,
          ecLevel: rr.ecLevel,
          extra: rr.extra,
        });
      }

      const { grid, normalizedImage, debugInfo: pipelineDebugInfo } = extractNormalizedGrid(imageData, result.aztec.position, 512, zxingSymbol);

      if (isDebugMode && pipelineDebugInfo) {
        console.log('[AZTEC DEBUG] Full pipeline debug info', pipelineDebugInfo);
        setDebugInfo(pipelineDebugInfo);

        // Expose normalized image for visual inspection
        const normalizedCanvas = document.createElement('canvas');
        normalizedCanvas.width = normalizedImage.width;
        normalizedCanvas.height = normalizedImage.height;
        const ctx = normalizedCanvas.getContext('2d')!;
        ctx.putImageData(normalizedImage, 0, 0);
        (window as unknown as Record<string, unknown>)._normalizedImageUrl = normalizedCanvas.toDataURL();
        (window as unknown as Record<string, unknown>)._debugInfo = pipelineDebugInfo;
        console.log('[AZTEC DEBUG] Normalized image available at window._normalizedImageUrl');
        console.log('[AZTEC DEBUG] Grid size:', grid.length, 'x', grid[0]?.length);
        console.log('[AZTEC DEBUG] Grid offset:', pipelineDebugInfo.gridOffset);
      }

      const analyzedStructure = analyzeAztecGrid(grid, grid.length);

      if (isDebugMode) {
        console.log('[AZTEC DEBUG] Analyzed structure', {
          size: analyzedStructure.size,
          isCompact: analyzedStructure.isCompact,
          layers: analyzedStructure.layers,
          modeMessage: analyzedStructure.modeMessage,
          dataCodewords: analyzedStructure.dataCodewords,
          eccCodewords: analyzedStructure.eccCodewords,
          totalCodewords: analyzedStructure.totalCodewords,
        });
        // Expose for debugging
        (window as unknown as Record<string, unknown>)._structure = analyzedStructure;
        (window as unknown as Record<string, unknown>)._grid = grid;
      }

      const decodedInfos = decodeCodewords(
        analyzedStructure.codewordValues,
        analyzedStructure.codewordSize,
        analyzedStructure.dataCodewords,
      );

      if (isDebugMode) {
        console.log('[AZTEC DEBUG] Decoded codeword infos', {
          total: decodedInfos.length,
          data: decodedInfos.filter(i => i.kind === 'character').length,
          shifts: decodedInfos.filter(i => i.kind === 'shift').length,
          latches: decodedInfos.filter(i => i.kind === 'latch').length,
          ecc: decodedInfos.filter(i => i.kind === 'ecc').length,
        });
        (window as unknown as Record<string, unknown>)._codewordInfos = decodedInfos;
      }

      setStructure(analyzedStructure);
      setCodewordInfos(decodedInfos);
      setDecodedText(result.aztec.text);
    } catch (err) {
      console.error('[AZTEC DEBUG] Processing error', err);
      setError(err instanceof Error ? err.message : 'Failed to process image');
      setStructure(null);
      setCodewordInfos([]);
      setDecodedText('');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const processFile = useCallback(async (file: File) => {
    const imageData = await loadImage(file);
    await processImageData(imageData);
  }, [processImageData]);

  // Debug mode: auto-load test image on mount
  useEffect(() => {
    if (isDebugMode) {
      console.log('[AZTEC DEBUG] Auto-loading test image...');
      loadImageFromUrl('/test/test-aztec-sncf.jpg')
        .then(imageData => {
          console.log('[AZTEC DEBUG] Test image loaded', {
            width: imageData.width,
            height: imageData.height,
          });
          processImageData(imageData);
        })
        .catch(err => {
          console.error('[AZTEC DEBUG] Failed to load test image', err);
          setError('Debug mode: Failed to load test image. Make sure /test/test-aztec.jpg exists.');
        });
    }
  }, [processImageData]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      processFile(file);
    } else {
      setError('Please drop an image file');
    }
  }, [processFile]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Derive hovered symbol from hovered module's bit position
  const hoveredSymbol = useMemo((): CodewordInfo | null => {
    if (!hoveredModule || !structure || hoveredModule.codewordIndex === undefined || hoveredModule.bitIndex === undefined) {
      return null;
    }
    const dataBitIndex = hoveredModule.codewordIndex * structure.codewordSize + hoveredModule.bitIndex;
    return findSymbolAtBit(dataBitIndex, codewordInfos) ?? null;
  }, [hoveredModule, structure, codewordInfos]);

  const hoveredSymbolModules = useMemo((): [number, number][] | null => {
    if (!hoveredSymbol || !structure) return null;
    return getModulesForBitRange(hoveredSymbol.startBit, hoveredSymbol.endBit, structure.dataBitPositions);
  }, [hoveredSymbol, structure]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors duration-200">
      {/* Header */}
      <header className="h-14 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 transition-colors duration-200">
        <div className="h-full flex items-center justify-between max-w-[1920px] mx-auto px-4">
          <div className="flex items-center gap-2.5">
            <Grid3X3 className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            <span className="font-medium text-gray-900 dark:text-white">
              Aztec Inspector
            </span>
          </div>
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex h-[calc(100vh-56px)]">
        {/* Left Panel - Controls */}
        <aside className="w-72 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-y-auto transition-colors duration-200">
          <div className="p-4">
            <ControlPanel
              layers={layers}
              setLayers={setLayers}
              showOutlines={showOutlines}
              setShowOutlines={setShowOutlines}
              showCodewordOutlines={showCodewordOutlines}
              setShowCodewordOutlines={setShowCodewordOutlines}
            />
          </div>
        </aside>

        {/* Center - Canvas */}
        <div
          className="flex-1 flex flex-col p-4 relative bg-gray-100 dark:bg-gray-950 transition-colors duration-200"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Upload Area (when no barcode loaded) */}
          {!structure && !isLoading && (
            <div
              className={`absolute inset-4 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer ${
                isDragging
                  ? 'border-gray-400 dark:border-gray-500 bg-gray-50 dark:bg-gray-800/50 scale-[1.01]'
                  : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 bg-white dark:bg-gray-900'
              }`}
              onClick={handleClick}
            >
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-colors ${
                isDragging
                  ? 'bg-gray-200 dark:bg-gray-700'
                  : 'bg-gray-100 dark:bg-gray-800'
              }`}>
                <Upload className={`w-8 h-8 transition-colors ${
                  isDragging
                    ? 'text-gray-600 dark:text-gray-300'
                    : 'text-gray-400 dark:text-gray-500'
                }`} />
              </div>
              <p className="text-base font-medium text-gray-700 dark:text-gray-200 mb-1">
                Drop an image here
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500">
                or click to browse
              </p>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="absolute inset-4 flex flex-col items-center justify-center rounded-2xl bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm z-10 transition-colors">
              <div className="w-12 h-12 border-4 border-gray-300 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-300 rounded-full animate-spin mb-4" />
              <p className="text-gray-600 dark:text-gray-300 font-medium">Analyzing barcode...</p>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="absolute inset-x-4 top-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl transition-colors">
              <p className="text-red-600 dark:text-red-400 text-center text-sm">{error}</p>
              <button
                onClick={() => setError(null)}
                className="mt-2 mx-auto block text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Canvas (when barcode is loaded) */}
          {structure && (
            <AztecCanvas
              structure={structure}
              layers={layers}
              showOutlines={showOutlines}
              showCodewordOutlines={showCodewordOutlines}
              resolvedTheme={resolvedTheme}
              onHover={setHoveredModule}
              hoveredCodewordIndex={hoveredModule?.codewordIndex ?? null}
              hoveredSymbolModules={hoveredSymbolModules}
            />
          )}

          {/* Drag overlay */}
          {isDragging && structure && (
            <div className="absolute inset-4 flex items-center justify-center rounded-2xl border-2 border-dashed border-gray-400 dark:border-gray-500 bg-gray-50/80 dark:bg-gray-800/80 backdrop-blur-sm pointer-events-none transition-colors">
              <p className="text-gray-600 dark:text-gray-300 font-medium">Drop to load new barcode</p>
            </div>
          )}
        </div>

        {/* Right Panel - Info */}
        <aside className="w-80 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-y-auto transition-colors duration-200">
          <div className="p-4 space-y-4">
            {/* Upload button when barcode is loaded */}
            {structure && (
              <button
                onClick={handleClick}
                className="w-full py-2.5 px-4 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-white rounded-lg text-white dark:text-gray-900 text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Load New Image
              </button>
            )}

            <InfoPanel
              structure={structure}
              decodedText={decodedText}
              hoveredModule={hoveredModule}
              hoveredSymbol={hoveredSymbol}
            />
          </div>
        </aside>
      </main>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}

export default App;
