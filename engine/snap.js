'use strict';
// Snapping for widget windows being dragged: screen work-area edges, the edges of
// other widgets, and an optional grid. Pure math so it can be unit tested.

function snapAxis(pos, size, targets, threshold) {
  // Candidate alignments: our start to a target, or our end to a target.
  let best = null;
  for (const t of targets) {
    for (const [candidate, delta] of [[t, t - pos], [t - size, t - size - pos]]) {
      const d = Math.abs(delta);
      if (d <= threshold && (!best || d < best.d)) best = { d, value: candidate };
    }
  }
  return best ? best.value : pos;
}

/**
 * @param {{x,y,width,height}} bounds   proposed window bounds
 * @param {{x,y,width,height}} area     work area of the display
 * @param {Array<{x,y,width,height}>} others  bounds of other widgets
 * @param {{threshold?:number, grid?:number, gap?:number}} options
 */
function snapBounds(bounds, area, others, options = {}) {
  const threshold = options.threshold === undefined ? 12 : options.threshold;
  const gap = options.gap === undefined ? 8 : options.gap;
  const grid = options.grid || 0;

  const xTargets = [area.x, area.x + area.width];
  const yTargets = [area.y, area.y + area.height];
  for (const o of others) {
    xTargets.push(o.x, o.x + o.width, o.x - gap, o.x + o.width + gap);
    yTargets.push(o.y, o.y + o.height, o.y - gap, o.y + o.height + gap);
  }

  let x = snapAxis(bounds.x, bounds.width, xTargets, threshold);
  let y = snapAxis(bounds.y, bounds.height, yTargets, threshold);

  if (grid > 1) {
    if (x === bounds.x) x = area.x + Math.round((bounds.x - area.x) / grid) * grid;
    if (y === bounds.y) y = area.y + Math.round((bounds.y - area.y) / grid) * grid;
  }

  // Never snap a window off the work area.
  x = Math.min(Math.max(x, area.x), area.x + Math.max(0, area.width - bounds.width));
  y = Math.min(Math.max(y, area.y), area.y + Math.max(0, area.height - bounds.height));
  return { x: Math.round(x), y: Math.round(y), width: bounds.width, height: bounds.height };
}

module.exports = { snapBounds };
