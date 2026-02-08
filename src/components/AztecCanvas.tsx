import { useRef, useEffect, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import type { AztecStructure, ModuleInfo } from '../lib/aztec-structure';
import { MODULE_COLORS, computeCodewordOutline } from '../lib/aztec-structure';
import { ModuleTooltip } from './ModuleTooltip';
import type { CodewordInfo } from '../lib/aztec-text-decoder';

interface LayerVisibility {
  finder: boolean;
  orientation: boolean;
  mode: boolean;
  data: boolean;
  ecc: boolean;
  alignment: boolean;
  padding: boolean;
}

interface AztecCanvasProps {
  structure: AztecStructure | null;
  layers: LayerVisibility;
  showOutlines: boolean;
  showCodewordOutlines: boolean;
  resolvedTheme: 'light' | 'dark';
  onHover: (module: ModuleInfo | null) => void;
  hoveredCodewordIndex: number | null;
  hoveredSymbolModules: [number, number][] | null;
  hoveredModule: ModuleInfo | null;
  hoveredSymbol: CodewordInfo | null;
  decodedText: string;
}

export function AztecCanvas({
  structure,
  layers,
  showOutlines,
  showCodewordOutlines,
  resolvedTheme,
  onHover,
  hoveredCodewordIndex,
  hoveredSymbolModules,
  hoveredModule,
  hoveredSymbol,
  decodedText,
}: AztecCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const getModuleSize = useCallback(() => {
    if (!structure || !containerRef.current) return 10;
    const rect = containerRef.current.getBoundingClientRect();
    const quietZoneModules = 4;
    const totalModules = structure.size + quietZoneModules;
    const maxSize = Math.min(rect.width, rect.height) * 0.9;
    return (maxSize / totalModules) * zoom;
  }, [structure, zoom]);

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d')!;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    // Background - subtle texture
    ctx.fillStyle = resolvedTheme === 'dark' ? '#030712' : '#f3f4f6';
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (!structure) {
      ctx.fillStyle = resolvedTheme === 'dark' ? '#6b7280' : '#9ca3af';
      ctx.font = '15px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Upload an image to begin', rect.width / 2, rect.height / 2);
      return;
    }

    const { size, modules, codewordModules } = structure;
    const moduleSize = getModuleSize();
    const quietZone = moduleSize * 2;
    const gridWidth = size * moduleSize;
    const startX = pan.x + (rect.width - gridWidth) / 2 - quietZone;
    const startY = pan.y + (rect.height - gridWidth) / 2 - quietZone;

    // Quiet zone with subtle shadow
    ctx.shadowColor = resolvedTheme === 'dark' ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.1)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(startX, startY, gridWidth + quietZone * 2, gridWidth + quietZone * 2);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Black/white modules
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const module = modules[row][col];
        const x = startX + quietZone + col * moduleSize;
        const y = startY + quietZone + row * moduleSize;

        ctx.fillStyle = module.isBlack ? '#000000' : '#ffffff';
        ctx.fillRect(x, y, moduleSize, moduleSize);
      }
    }

    // Colored overlays
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const module = modules[row][col];
        if (!layers[module.type]) continue;

        const x = startX + quietZone + col * moduleSize;
        const y = startY + quietZone + row * moduleSize;
        const color = MODULE_COLORS[module.type];

        ctx.fillStyle = hexToRgba(color, 0.4);
        ctx.fillRect(x, y, moduleSize, moduleSize);
      }
    }

    // Region outlines
    if (showOutlines && moduleSize > 3) {
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          const module = modules[row][col];
          if (!layers[module.type]) continue;

          const x = startX + quietZone + col * moduleSize;
          const y = startY + quietZone + row * moduleSize;
          const color = MODULE_COLORS[module.type];

          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(1, moduleSize / 10);

          const needsTop = row === 0 || modules[row - 1][col].type !== module.type;
          const needsBottom = row === size - 1 || modules[row + 1][col].type !== module.type;
          const needsLeft = col === 0 || modules[row][col - 1].type !== module.type;
          const needsRight = col === size - 1 || modules[row][col + 1].type !== module.type;

          ctx.beginPath();
          if (needsTop) { ctx.moveTo(x, y); ctx.lineTo(x + moduleSize, y); }
          if (needsBottom) { ctx.moveTo(x, y + moduleSize); ctx.lineTo(x + moduleSize, y + moduleSize); }
          if (needsLeft) { ctx.moveTo(x, y); ctx.lineTo(x, y + moduleSize); }
          if (needsRight) { ctx.moveTo(x + moduleSize, y); ctx.lineTo(x + moduleSize, y + moduleSize); }
          ctx.stroke();
        }
      }
    }

    // Individual codeword outlines
    if (showCodewordOutlines && moduleSize > 4) {
      const dataColor = MODULE_COLORS.data;
      const eccColor = MODULE_COLORS.ecc;

      for (const [codewordIndex, cwModules] of codewordModules) {
        if (cwModules.length === 0) continue;

        const isData = codewordIndex < structure.dataCodewords;
        if ((isData && !layers.data) || (!isData && !layers.ecc)) continue;

        const color = isData ? dataColor : eccColor;
        const outline = computeCodewordOutline(cwModules);
        if (!outline) continue;

        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.5, moduleSize / 6);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const pathParts = outline.path.split(/(?=[MLZ])/);
        ctx.beginPath();

        for (const part of pathParts) {
          const cmd = part[0];
          const coords = part.slice(1).trim().split(/\s+/).map(Number);

          if (cmd === 'M' && coords.length >= 2) {
            const px = startX + quietZone + coords[0] * moduleSize;
            const py = startY + quietZone + coords[1] * moduleSize;
            ctx.moveTo(px, py);
          } else if (cmd === 'L' && coords.length >= 2) {
            const px = startX + quietZone + coords[0] * moduleSize;
            const py = startY + quietZone + coords[1] * moduleSize;
            ctx.lineTo(px, py);
          } else if (cmd === 'Z') {
            ctx.closePath();
          }
        }

        ctx.stroke();
      }
    }

    // Grid lines when zoomed
    if (moduleSize > 15) {
      ctx.strokeStyle = resolvedTheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 0.5;

      for (let i = 0; i <= size; i++) {
        ctx.beginPath();
        ctx.moveTo(startX + quietZone + i * moduleSize, startY + quietZone);
        ctx.lineTo(startX + quietZone + i * moduleSize, startY + quietZone + size * moduleSize);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(startX + quietZone, startY + quietZone + i * moduleSize);
        ctx.lineTo(startX + quietZone + size * moduleSize, startY + quietZone + i * moduleSize);
        ctx.stroke();
      }
    }
  }, [structure, layers, showOutlines, showCodewordOutlines, zoom, pan, resolvedTheme, getModuleSize]);

  // Hover overlay (separate canvas for performance)
  useEffect(() => {
    const hoverCanvas = hoverCanvasRef.current;
    const container = containerRef.current;
    if (!hoverCanvas || !container || !structure) return;

    const ctx = hoverCanvas.getContext('2d')!;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    hoverCanvas.width = rect.width * dpr;
    hoverCanvas.height = rect.height * dpr;
    hoverCanvas.style.width = `${rect.width}px`;
    hoverCanvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    // Clear previous highlight
    ctx.clearRect(0, 0, rect.width, rect.height);

    const moduleSize = getModuleSize();
    const quietZone = moduleSize * 2;
    const gridWidth = structure.size * moduleSize;
    const startX = pan.x + (rect.width - gridWidth) / 2 - quietZone;
    const startY = pan.y + (rect.height - gridWidth) / 2 - quietZone;

    const hasAnything = hoveredCodewordIndex !== null || (hoveredSymbolModules && hoveredSymbolModules.length > 0);
    if (!hasAnything) return;

    // Helper to draw an SVG-style outline path
    const drawOutline = (outline: { path: string }, color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const pathParts = outline.path.split(/(?=[MLZ])/);
      ctx.beginPath();
      for (const part of pathParts) {
        const cmd = part[0];
        const coords = part.slice(1).trim().split(/\s+/).map(Number);
        if (cmd === 'M' && coords.length >= 2) {
          ctx.moveTo(startX + quietZone + coords[0] * moduleSize, startY + quietZone + coords[1] * moduleSize);
        } else if (cmd === 'L' && coords.length >= 2) {
          ctx.lineTo(startX + quietZone + coords[0] * moduleSize, startY + quietZone + coords[1] * moduleSize);
        } else if (cmd === 'Z') {
          ctx.closePath();
        }
      }
      ctx.stroke();
    };

    // 1. Codeword highlight (cyan) — the RS error correction unit
    if (hoveredCodewordIndex !== null) {
      const cwModules = structure.codewordModules.get(hoveredCodewordIndex);
      if (cwModules && cwModules.length > 0) {
        ctx.fillStyle = 'rgba(0, 210, 210, 0.25)';
        for (const [x, y] of cwModules) {
          const px = startX + quietZone + x * moduleSize;
          const py = startY + quietZone + y * moduleSize;
          ctx.fillRect(px, py, moduleSize, moduleSize);
        }

        const outline = computeCodewordOutline(cwModules);
        if (outline) {
          drawOutline(outline, 'rgba(0, 220, 220, 0.7)', Math.max(1.5, moduleSize / 7));
        }
      }
    }

    // 2. Symbol highlight (amber) — the decoded character/shift/latch
    if (hoveredSymbolModules && hoveredSymbolModules.length > 0) {
      ctx.fillStyle = 'rgba(255, 160, 0, 0.35)';
      for (const [x, y] of hoveredSymbolModules) {
        const px = startX + quietZone + x * moduleSize;
        const py = startY + quietZone + y * moduleSize;
        ctx.fillRect(px, py, moduleSize, moduleSize);
      }

      const outline = computeCodewordOutline(hoveredSymbolModules);
      if (outline) {
        drawOutline(outline, 'rgba(255, 180, 0, 0.9)', Math.max(2, moduleSize / 5));
      }
    }
  }, [structure, hoveredCodewordIndex, hoveredSymbolModules, zoom, pan, getModuleSize]);

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    } else if (structure && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const moduleSize = getModuleSize();
      const quietZone = moduleSize * 2;
      const gridWidth = structure.size * moduleSize;
      const startX = pan.x + (rect.width - gridWidth) / 2 - quietZone;
      const startY = pan.y + (rect.height - gridWidth) / 2 - quietZone;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const col = Math.floor((mouseX - startX - quietZone) / moduleSize);
      const row = Math.floor((mouseY - startY - quietZone) / moduleSize);

      if (row >= 0 && row < structure.size && col >= 0 && col < structure.size) {
        onHover(structure.modules[row][col]);
      } else {
        onHover(null);
      }
    }
  };

  const handleMouseUp = () => setIsDragging(false);
  const handleMouseLeave = () => {
    setIsDragging(false);
    setMousePos(null);
    onHover(null);
  };

  // Zoom to mouse position
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();

    if (!containerRef.current || !structure) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.5, Math.min(20, zoom * factor));

    if (newZoom === zoom) return;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const worldX = (mouseX - centerX - pan.x) / zoom;
    const worldY = (mouseY - centerY - pan.y) / zoom;

    const newPanX = mouseX - centerX - worldX * newZoom;
    const newPanY = mouseY - centerY - worldY * newZoom;

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  }, [zoom, pan, structure]);

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const zoomIn = useCallback(() => {
    setZoom(z => Math.min(20, z * 1.25));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom(z => Math.max(0.5, z / 1.25));
  }, []);

  return (
    <div className="relative flex-1 bg-gray-100 dark:bg-gray-950 rounded-xl overflow-hidden transition-colors" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ cursor: isDragging ? 'grabbing' : 'crosshair' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      />
      <canvas
        ref={hoverCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Zoom controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5">
        <button
          onClick={zoomIn}
          className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-700"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        </button>
        <button
          onClick={zoomOut}
          className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-700"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        </button>
        <button
          onClick={resetView}
          className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-700"
          title="Reset view"
        >
          <RotateCcw className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        </button>
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-3 right-3 px-2 py-1 bg-white/90 dark:bg-gray-800/90 rounded-md text-xs font-mono text-gray-600 dark:text-gray-400 backdrop-blur-sm border border-gray-200 dark:border-gray-700">
        {Math.round(zoom * 100)}%
      </div>

      {/* Module details tooltip */}
      {structure && mousePos && (
        <ModuleTooltip
          hoveredModule={hoveredModule}
          hoveredSymbol={hoveredSymbol}
          structure={structure}
          decodedText={decodedText}
          mouseX={mousePos.x}
          mouseY={mousePos.y}
        />
      )}
    </div>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
