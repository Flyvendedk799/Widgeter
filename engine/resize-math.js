function clampInt(value, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function clampSize(width, height, limits = {}) {
  const minWidth = clampInt(limits.minWidth ?? 160, 80, 4000);
  const maxWidth = clampInt(limits.maxWidth ?? 800, minWidth, 4000);
  const minHeight = clampInt(limits.minHeight ?? 80, 50, 4000);
  const maxHeight = clampInt(limits.maxHeight ?? 900, minHeight, 4000);
  return {
    width: clampInt(width, minWidth, maxWidth),
    height: clampInt(height, minHeight, maxHeight)
  };
}

/**
 * Smart resize tracks height to the widget's content.
 * Width stays where the user (or the widget author) put it, unless the content
 * is actually wider than the window. Block layouts report a width equal to the
 * viewport, and treating that as intrinsic width collapses the widget.
 */
function decideSmartSize(current, measured) {
  const currentWidth = Math.round(Number(current.width) || 0);
  const measuredWidth = Math.round(Number(measured.width) || 0);
  const measuredHeight = Math.round(Number(measured.height) || 0);
  let width = currentWidth;
  if (measuredWidth > currentWidth + 8) width = measuredWidth;
  return { width, height: measuredHeight };
}

/** Split `total` into `count` integer parts that add back up to `total`. */
function splitEven(count, total) {
  const n = Math.max(0, count | 0);
  const t = Math.round(Number(total) || 0);
  if (n === 0) return [];
  const base = Math.floor(t / n);
  const rem = t - base * n;
  const parts = new Array(n);
  for (let i = 0; i < n; i++) parts[i] = base + (i < rem ? 1 : 0);
  return parts;
}

/**
 * Copy the old display-settings keys (`config._autoResize`, limits) onto widget
 * state once. Later reads must not let a stale config flag turn Smart back on
 * after the user has switched to Fixed.
 */
function migrateDisplay(wState) {
  const cfg = wState.config || (wState.config = {});
  if (!wState._displayMigrated) {
    if (cfg._autoResize === true) wState.autoResize = true;
    if (typeof wState.opacity !== 'number' && typeof cfg._opacity === 'number') {
      wState.opacity = cfg._opacity;
    }
    if (wState.minWidth == null && cfg.minWidth != null) wState.minWidth = cfg.minWidth;
    if (wState.maxWidth == null && cfg.maxWidth != null) wState.maxWidth = cfg.maxWidth;
    if (wState.minHeight == null && cfg.minHeight != null) wState.minHeight = cfg.minHeight;
    if (wState.maxHeight == null && cfg.maxHeight != null) wState.maxHeight = cfg.maxHeight;
    delete cfg._autoResize;
    delete cfg._opacity;
    wState._displayMigrated = true;
  }
  if (typeof wState.autoResize !== 'boolean') wState.autoResize = false;
  if (typeof wState.opacity !== 'number' || !Number.isFinite(wState.opacity)) wState.opacity = 1;
  wState.opacity = Math.min(1, Math.max(0.1, wState.opacity));
  if (typeof wState.clickThrough !== 'boolean') wState.clickThrough = false;
  wState.minWidth = clampInt(wState.minWidth ?? 160, 80, 4000);
  wState.maxWidth = clampInt(wState.maxWidth ?? 800, wState.minWidth, 4000);
  wState.minHeight = clampInt(wState.minHeight ?? 80, 50, 4000);
  wState.maxHeight = clampInt(wState.maxHeight ?? 900, wState.minHeight, 4000);
  return wState;
}

module.exports = { clampInt, clampSize, decideSmartSize, splitEven, migrateDisplay };
