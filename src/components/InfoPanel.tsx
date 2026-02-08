import type { AztecStructure } from '../lib/aztec-structure';

interface InfoPanelProps {
  structure: AztecStructure | null;
  decodedText: string;
}

export function InfoPanel({ structure, decodedText }: InfoPanelProps) {
  if (!structure) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-gray-500 dark:text-gray-400">No barcode loaded</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Barcode Info */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 px-1">
          Barcode Info
        </h2>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <InfoItem label="Size" value={`${structure.size}×${structure.size}`} />
          <InfoItem label="Type" value={structure.isCompact ? 'Compact' : 'Full-range'} />
          <InfoItem label="Layers" value={structure.layers.toString()} />
          <InfoItem label="Codeword" value={`${structure.codewordSize}-bit`} />
          <InfoItem label="Data CW" value={structure.dataCodewords.toString()} />
          <InfoItem label="ECC CW" value={structure.eccCodewords.toString()} />
          <InfoItem label="Total Bits" value={structure.totalBits.toLocaleString()} />
          <InfoItem label="Padding" value={`${structure.paddingBits} bits`} />
        </div>
      </div>

      {/* Decoded Content */}
      {decodedText && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 px-1">
            Content
            <span className="ml-2 font-normal normal-case text-gray-400 dark:text-gray-500">
              {decodedText.length} chars
            </span>
          </h2>
          <div className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all max-h-64 overflow-y-auto p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            {decodedText.length > 600 ? decodedText.slice(0, 600) + '...' : decodedText}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</div>
      <div className="text-base font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
        {value}
      </div>
    </div>
  );
}
