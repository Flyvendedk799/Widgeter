'use strict';
// Layout templates: pure functions turning a list of widget ids into positions
// expressed as percentages of a display's work area.
const { splitEven } = require('./resize-math');

function columnLayout(ids, x, width) {
  const parts = splitEven(ids.length, 100);
  let y = 0;
  return ids.map((id, i) => {
    const item = { widgetId: id, x, y, width, height: parts[i] };
    y += parts[i];
    return item;
  });
}

function rowLayout(ids, y, height) {
  const parts = splitEven(ids.length, 100);
  let x = 0;
  return ids.map((id, i) => {
    const item = { widgetId: id, x, y, width: parts[i], height };
    x += parts[i];
    return item;
  });
}

const TEMPLATES = [
  { name: 'Sidebar Right', icon: '▐', description: 'Stack widgets down the right edge, filling the height.', generate: (ids) => columnLayout(ids, 75, 25) },
  { name: 'Sidebar Left', icon: '▌', description: 'Stack widgets down the left edge, filling the height.', generate: (ids) => columnLayout(ids, 0, 25) },
  { name: 'Top Bar', icon: '▀', description: 'Spread widgets across the top of the screen.', generate: (ids) => rowLayout(ids, 0, 30) },
  { name: 'Bottom Bar', icon: '▄', description: 'Spread widgets across the bottom of the screen.', generate: (ids) => rowLayout(ids, 70, 30) },
  {
    name: 'Grid', icon: '⊞', description: 'Tile widgets evenly across the whole screen.',
    generate: (ids) => {
      const cols = Math.ceil(Math.sqrt(ids.length));
      const rows = Math.ceil(ids.length / cols);
      const colW = splitEven(cols, 100);
      const rowH = splitEven(rows, 100);
      let y = 0;
      const yPos = rowH.map((h) => { const p = y; y += h; return p; });
      let x = 0;
      const xPos = colW.map((w) => { const p = x; x += w; return p; });
      return ids.map((id, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        return { widgetId: id, x: xPos[c], y: yPos[r], width: colW[c], height: rowH[r] };
      });
    }
  },
  {
    name: 'Corners', icon: '⊡', description: 'Place the first four widgets in the corners. Extras stack on the right.',
    generate: (ids) => {
      const corners = [{ x: 0, y: 0 }, { x: 75, y: 0 }, { x: 0, y: 70 }, { x: 75, y: 70 }];
      return ids.map((id, i) => {
        const c = corners[i] || { x: 75, y: Math.min(i * 15, 85) };
        return { widgetId: id, x: c.x, y: c.y, width: 25, height: 30 };
      });
    }
  },
  {
    name: 'Center Stack', icon: '◫', description: 'Stack widgets in a column in the middle of the screen.',
    generate: (ids) => {
      const heightPer = Math.min(Math.floor(80 / ids.length), 25);
      const parts = splitEven(ids.length, heightPer * ids.length || 25);
      const used = parts.reduce((a, b) => a + b, 0);
      let y = Math.max(0, Math.round((100 - used) / 2));
      return ids.map((id, i) => {
        const item = { widgetId: id, x: 30, y, width: 40, height: parts[i] };
        y += parts[i];
        return item;
      });
    }
  }
];

module.exports = { TEMPLATES, columnLayout, rowLayout };
