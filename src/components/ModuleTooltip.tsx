import type { AztecStructure, ModuleInfo } from '../lib/aztec-structure';
import { MODULE_COLORS, MODULE_NAMES } from '../lib/aztec-structure';
import {
  formatHex,
  formatBinary,
  describeCodeword,
  type CodewordInfo,
} from '../lib/aztec-text-decoder';

interface ModuleTooltipProps {
  hoveredModule: ModuleInfo | null;
  hoveredSymbol: CodewordInfo | null;
  structure: AztecStructure;
  decodedText: string;
  mouseX: number;
  mouseY: number;
}

export function ModuleTooltip({ hoveredModule, hoveredSymbol, structure, decodedText, mouseX, mouseY }: ModuleTooltipProps) {
  if (!hoveredModule) return null;

  // Position tooltip 16px right and below cursor, flip if near viewport edges
  const offsetX = 16;
  const offsetY = 16;
  const tooltipWidth = 280;

  const flipX = mouseX + offsetX + tooltipWidth > window.innerWidth;
  const flipY = mouseY + offsetY + 200 > window.innerHeight;

  const style: React.CSSProperties = {
    position: 'fixed',
    left: flipX ? mouseX - offsetX - tooltipWidth : mouseX + offsetX,
    top: flipY ? undefined : mouseY + offsetY,
    bottom: flipY ? window.innerHeight - mouseY + offsetY : undefined,
    width: tooltipWidth,
    zIndex: 50,
    pointerEvents: 'none' as const,
  };

  return (
    <div
      style={style}
      className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3"
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
        Module Details
      </div>

      <div
        className="text-sm font-semibold mb-3 flex items-center gap-2"
        style={{ color: MODULE_COLORS[hoveredModule.type] }}
      >
        <div
          className="w-3 h-3 rounded-sm"
          style={{ backgroundColor: MODULE_COLORS[hoveredModule.type] }}
        />
        {MODULE_NAMES[hoveredModule.type]}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        <span className="text-gray-500 dark:text-gray-400">Position</span>
        <span className="text-gray-800 dark:text-gray-200 font-mono text-xs">
          ({hoveredModule.x}, {hoveredModule.y})
        </span>

        <span className="text-gray-500 dark:text-gray-400">Value</span>
        <span className="text-gray-800 dark:text-gray-200 font-mono text-xs">
          {hoveredModule.isBlack ? '1 (black)' : '0 (white)'}
        </span>

        {hoveredModule.codewordIndex !== undefined && (
          <>
            <span className="text-gray-500 dark:text-gray-400">Codeword</span>
            <span className="text-gray-800 dark:text-gray-200 font-mono text-xs">
              #{hoveredModule.codewordIndex}
            </span>
          </>
        )}

        {hoveredModule.bitIndex !== undefined && (
          <>
            <span className="text-gray-500 dark:text-gray-400">Bit Index</span>
            <span className="text-gray-800 dark:text-gray-200 font-mono text-xs">
              {hoveredModule.bitIndex}
            </span>
          </>
        )}

        {hoveredModule.layer !== undefined && (
          <>
            <span className="text-gray-500 dark:text-gray-400">Layer</span>
            <span className="text-gray-800 dark:text-gray-200 font-mono text-xs">
              {hoveredModule.layer + 1}
            </span>
          </>
        )}
      </div>

      {/* Finder (bullseye) details */}
      {hoveredModule.type === 'finder' && (() => {
        const center = Math.floor(structure.size / 2);
        const ring = Math.max(Math.abs(hoveredModule.x - center), Math.abs(hoveredModule.y - center));
        const bullseyeRadius = structure.isCompact ? 4 : 6;
        const expectedBlack = ring % 2 === 0;
        return (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
              Bullseye Pattern
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-gray-500 dark:text-gray-400">Type</span>
                <span className="text-gray-800 dark:text-gray-200">
                  {structure.isCompact ? 'Compact' : 'Full-range'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500 dark:text-gray-400">Ring</span>
                <span className="text-gray-800 dark:text-gray-200 font-mono">
                  {ring} of {bullseyeRadius}{ring === 0 ? ' (center)' : ''}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500 dark:text-gray-400">Expected</span>
                <span className="text-gray-800 dark:text-gray-200 font-mono">
                  {expectedBlack ? 'black' : 'white'}
                  {hoveredModule.isBlack === expectedBlack ? '' : ' (MISMATCH)'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500 dark:text-gray-400">Radius</span>
                <span className="text-gray-800 dark:text-gray-200 font-mono">
                  {bullseyeRadius} rings ({structure.isCompact ? '9×9' : '13×13'})
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Orientation marker details */}
      {hoveredModule.type === 'orientation' && (() => {
        const center = Math.floor(structure.size / 2);
        const dx = hoveredModule.x - center;
        const dy = hoveredModule.y - center;
        let corner: string;
        if (dx <= 0 && dy <= 0) corner = 'Top-Left';
        else if (dx >= 0 && dy <= 0) corner = 'Top-Right';
        else if (dx >= 0 && dy >= 0) corner = 'Bottom-Right';
        else corner = 'Bottom-Left';
        return (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
              Orientation Marker
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-gray-500 dark:text-gray-400">Corner</span>
                <span className="text-gray-800 dark:text-gray-200 font-medium">
                  {corner}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500 dark:text-gray-400">Purpose</span>
                <span className="text-gray-800 dark:text-gray-200 text-[11px]">
                  Rotation detection
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Mode message details */}
      {hoveredModule.type === 'mode' && structure.modeMessage.valid && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
            Mode Message
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 dark:text-gray-400">Layers</span>
              <span className="text-gray-800 dark:text-gray-200 font-mono">
                {structure.modeMessage.layers}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 dark:text-gray-400">Data CW</span>
              <span className="text-gray-800 dark:text-gray-200 font-mono">
                {structure.modeMessage.dataCodewords}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 dark:text-gray-400">ECC CW</span>
              <span className="text-gray-800 dark:text-gray-200 font-mono">
                {structure.totalCodewords - structure.modeMessage.dataCodewords}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 dark:text-gray-400">Type</span>
              <span className="text-gray-800 dark:text-gray-200">
                {structure.isCompact ? 'Compact' : 'Full-range'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 dark:text-gray-400">RS Field</span>
              <span className="text-gray-800 dark:text-gray-200 font-mono">
                GF(16), 4-bit CW
              </span>
            </div>
          </div>
        </div>
      )}

      {/* RS Codeword details */}
      {hoveredModule.codewordIndex !== undefined && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: 'rgb(0, 210, 210)' }} />
            <span className="text-cyan-600 dark:text-cyan-400">
              {hoveredModule.codewordIndex < structure.dataCodewords ? 'Data' : 'ECC'} Codeword #{hoveredModule.codewordIndex}
            </span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 dark:text-gray-400">Raw</span>
              <span className="text-gray-800 dark:text-gray-200 font-mono">
                {formatHex(structure.codewordValues[hoveredModule.codewordIndex], structure.codewordSize)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 dark:text-gray-400">Binary</span>
              <span className="text-gray-800 dark:text-gray-200 font-mono">
                {formatBinary(structure.codewordValues[hoveredModule.codewordIndex], structure.codewordSize)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 dark:text-gray-400">Bits</span>
              <span className="text-gray-800 dark:text-gray-200 font-mono">
                {structure.codewordSize}-bit (RS unit)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Decoded Symbol details */}
      {hoveredSymbol && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: 'rgb(255, 160, 0)' }} />
            <span className="text-amber-600 dark:text-amber-400">
              {hoveredSymbol.kind === 'ecc' ? 'ECC' : 'Symbol'} #{hoveredSymbol.index}
            </span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 dark:text-gray-400">Decoded</span>
              <span className="text-gray-800 dark:text-gray-200 font-mono">
                {describeCodeword(hoveredSymbol)}
              </span>
            </div>

            {hoveredSymbol.kind === 'character' && (
              <div className="flex justify-between items-center">
                <span className="text-gray-500 dark:text-gray-400">Mode</span>
                <span className="text-gray-800 dark:text-gray-200">
                  {hoveredSymbol.mode}
                </span>
              </div>
            )}

            {hoveredSymbol.kind === 'character' && hoveredSymbol.charPosition >= 0 && (
              <div className="flex justify-between items-center">
                <span className="text-gray-500 dark:text-gray-400">Char</span>
                <span className="text-gray-800 dark:text-gray-200 font-mono">
                  {hoveredSymbol.charPosition + 1} of {decodedText.length}
                </span>
              </div>
            )}

            {hoveredSymbol.kind === 'binary-byte' && (
              <div className="flex justify-between items-center">
                <span className="text-gray-500 dark:text-gray-400">Char</span>
                <span className="text-gray-800 dark:text-gray-200 font-mono">
                  {hoveredSymbol.charPosition + 1} of {decodedText.length}
                </span>
              </div>
            )}

            {(hoveredSymbol.kind === 'shift' || hoveredSymbol.kind === 'latch') && (
              <div className="flex justify-between items-center">
                <span className="text-gray-500 dark:text-gray-400">
                  {hoveredSymbol.kind === 'shift' ? 'Shift' : 'Latch'}
                </span>
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  {hoveredSymbol.fromMode} → {hoveredSymbol.toMode}
                </span>
              </div>
            )}

            <div className="flex justify-between items-center">
              <span className="text-gray-500 dark:text-gray-400">Bits</span>
              <span className="text-gray-800 dark:text-gray-200 font-mono">
                {hoveredSymbol.bitSize}-bit [{hoveredSymbol.startBit}..{hoveredSymbol.endBit - 1}]
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-500 dark:text-gray-400">Raw</span>
              <span className="text-gray-800 dark:text-gray-200 font-mono">
                {formatHex(hoveredSymbol.rawValue, hoveredSymbol.bitSize)}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-500 dark:text-gray-400">Binary</span>
              <span className="text-gray-800 dark:text-gray-200 font-mono">
                {formatBinary(hoveredSymbol.rawValue, hoveredSymbol.bitSize)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
