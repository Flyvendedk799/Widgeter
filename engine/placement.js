'use strict';
// Finds an empty spot on a display for a new widget, so first-run widgets
// do not all open stacked in the middle of the screen.

function overlaps(a, b, margin) {
  return a.x < b.x + b.width + margin && a.x + a.width + margin > b.x &&
         a.y < b.y + b.height + margin && a.y + a.height + margin > b.y;
}

/**
 * Scans columns from the right edge, top to bottom, and returns the first free
 * position. Falls back to a cascade offset when the screen is full.
 * @param {{width,height}} size
 * @param {{x,y,width,height}} area  display work area
 * @param {Array<{x,y,width,height}>} occupied  windows already placed
 */
function findFreeSpot(size, area, occupied, options = {}) {
  const margin = options.margin === undefined ? 14 : options.margin;
  const step = options.step || 24;
  const width = Math.min(size.width, area.width);
  const height = Math.min(size.height, area.height);

  for (let x = area.x + area.width - width - margin; x >= area.x + margin; x -= step) {
    for (let y = area.y + margin; y + height <= area.y + area.height - margin + 1; y += step) {
      const candidate = { x, y, width, height };
      if (!occupied.some((o) => overlaps(candidate, o, margin / 2))) return { x, y };
    }
  }
  const n = occupied.length;
  return {
    x: Math.max(area.x, area.x + area.width - width - margin - (n % 8) * 28),
    y: Math.min(area.y + area.height - height, area.y + margin + (n % 8) * 28)
  };
}

module.exports = { findFreeSpot, overlaps };
