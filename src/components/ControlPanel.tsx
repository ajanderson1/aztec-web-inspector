import type { ModuleType } from '../lib/aztec-structure';
import { MODULE_COLORS, MODULE_NAMES, MODULE_DESCRIPTIONS } from '../lib/aztec-structure';

interface LayerVisibility {
  finder: boolean;
  orientation: boolean;
  mode: boolean;
  data: boolean;
  ecc: boolean;
  alignment: boolean;
  padding: boolean;
}

interface ControlPanelProps {
  layers: LayerVisibility;
  setLayers: (layers: LayerVisibility) => void;
  showOutlines: boolean;
  setShowOutlines: (show: boolean) => void;
  showCodewordOutlines: boolean;
  setShowCodewordOutlines: (show: boolean) => void;
}

const LAYER_ORDER: ModuleType[] = [
  'finder',
  'mode',
  'orientation',
  'alignment',
  'data',
  'ecc',
  'padding',
];

export function ControlPanel({
  layers,
  setLayers,
  showOutlines,
  setShowOutlines,
  showCodewordOutlines,
  setShowCodewordOutlines,
}: ControlPanelProps) {
  const toggleLayer = (type: ModuleType) => {
    setLayers({ ...layers, [type]: !layers[type] });
  };

  const selectAll = () => {
    const newLayers = { ...layers };
    for (const type of LAYER_ORDER) {
      newLayers[type] = true;
    }
    setLayers(newLayers);
  };

  const selectNone = () => {
    const newLayers = { ...layers };
    for (const type of LAYER_ORDER) {
      newLayers[type] = false;
    }
    setLayers(newLayers);
  };

  return (
    <div className="space-y-6">
      {/* Layers Section */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 px-1">
          Layers
        </h2>

        <div className="flex gap-2 mb-3">
          <button
            onClick={selectAll}
            className="flex-1 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-600 dark:text-gray-300"
          >
            All
          </button>
          <button
            onClick={selectNone}
            className="flex-1 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-600 dark:text-gray-300"
          >
            None
          </button>
        </div>

        <div className="space-y-0.5">
          {LAYER_ORDER.map(type => (
            <label
              key={type}
              className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors group"
            >
              <input
                type="checkbox"
                checked={layers[type]}
                onChange={() => toggleLayer(type)}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
              <div
                className="w-3.5 h-3.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: MODULE_COLORS[type] }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {MODULE_NAMES[type]}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-500 truncate">
                  {MODULE_DESCRIPTIONS[type]}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Display Section */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 px-1">
          Display
        </h2>

        <div className="space-y-0.5">
          <label className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={showOutlines}
              onChange={(e) => setShowOutlines(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 checked:bg-amber-500 checked:border-amber-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Region Outlines
            </span>
          </label>

          <label className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={showCodewordOutlines}
              onChange={(e) => setShowCodewordOutlines(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 checked:bg-amber-500 checked:border-amber-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Codeword Outlines
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
