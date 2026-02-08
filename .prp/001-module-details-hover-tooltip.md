# PRP-001: Move Module Details to Cursor-Following Hover Tooltip

## Summary
Extract the "Module Details" section from the right InfoPanel and render it as a floating tooltip that follows the mouse cursor over the canvas. Increase content section limits.

## Files to Modify
1. `src/components/InfoPanel.tsx` — Remove Module Details section (lines 61-347), increase content limits
2. `src/components/AztecCanvas.tsx` — Track mouse position, render tooltip
3. `src/App.tsx` — Pass additional props (structure, hoveredSymbol, decodedText) to AztecCanvas for tooltip rendering

## Implementation Steps

### Step 1: Create ModuleTooltip component
Create `src/components/ModuleTooltip.tsx` — a new component that renders the Module Details content as a fixed-position tooltip. It receives:
- `hoveredModule: ModuleInfo | null`
- `hoveredSymbol: CodewordInfo | null`
- `structure: AztecStructure`
- `decodedText: string`
- `mouseX: number, mouseY: number` — viewport coordinates

The tooltip:
- Renders at `position: fixed`, offset 16px right and 16px below cursor
- Repositions to stay within viewport bounds (flip left/up if near edges)
- Has no max-height constraint (grows freely)
- Appears/disappears immediately (no transition delay)
- Uses same styling as current Module Details section
- Only renders when `hoveredModule` is not null

### Step 2: Modify AztecCanvas
- Add props: `structure`, `hoveredSymbol`, `decodedText` (structure already exists)
- Track mouse viewport position via `useState<{x: number, y: number} | null>`
- Update mouse position in `handleMouseMove` using `e.clientX`, `e.clientY`
- Clear mouse position in `handleMouseLeave`
- Render `<ModuleTooltip>` inside the canvas container div

### Step 3: Modify App.tsx
- Pass `hoveredSymbol` and `decodedText` to `<AztecCanvas>`

### Step 4: Modify InfoPanel.tsx
- Remove the entire "Hover Info" section (lines 61-347, the `{hoveredModule && ...}` block)
- Remove `hoveredModule` and `hoveredSymbol` props from InfoPanelProps
- Change content max-h from `max-h-32` to `max-h-64`
- Change content truncation from 300 to 600
- Remove unused imports (`MODULE_COLORS`, `MODULE_NAMES`) if no longer needed

### Step 5: Update App.tsx InfoPanel usage
- Remove `hoveredModule` and `hoveredSymbol` props from `<InfoPanel>`
