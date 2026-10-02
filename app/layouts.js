'use strict';
// Saved layouts and profiles. A layout is a set of widget positions stored per
// display (as percentages of that display's work area); a profile is a layout
// plus the list of widgets that should be open.
const { screen } = require('electron');
const fs = require('fs');

const P = require('./paths');
const S = require('./state');
const W = require('./widgets');

function getData() {
  let data = { saved: [] };
  try {
    if (fs.existsSync(P.LAYOUTS_FILE)) data = JSON.parse(fs.readFileSync(P.LAYOUTS_FILE, 'utf-8'));
  } catch (e) { /* start fresh */ }
  data.saved = (data.saved || []).map((entry) => {
    if (entry.groups) return entry;
    // Older layouts stored one flat list of positions.
    return {
      name: entry.name, kind: 'layout', createdAt: entry.createdAt,
      widgetIds: (entry.positions || []).map((p) => p.widgetId),
      groups: [{ displayId: null, label: 'Any display', positions: entry.positions || [] }]
    };
  });
  return data;
}

function saveData(data) {
  fs.writeFileSync(P.LAYOUTS_FILE, JSON.stringify(data, null, 2));
}

function displayInfo(display) {
  const primary = screen.getPrimaryDisplay().id === display.id;
  return {
    id: display.id,
    label: (display.label || 'Display') + ' ' + display.size.width + '×' + display.size.height + (primary ? ' (primary)' : ''),
    width: display.size.width,
    height: display.size.height,
    primary
  };
}

function listDisplays() {
  return screen.getAllDisplays().map(displayInfo);
}

function pickDisplay(group) {
  const all = screen.getAllDisplays();
  return all.find((d) => d.id === group.displayId)
    || all.find((d) => group.width && d.size.width === group.width && d.size.height === group.height)
    || screen.getPrimaryDisplay();
}

function applyPositions(positions, display) {
  const area = (display || screen.getPrimaryDisplay()).workArea;
  let applied = 0;
  const skipped = [];
  for (const pos of positions || []) {
    const win = W.getWindow(pos.widgetId);
    const nums = [pos.x, pos.y, pos.width, pos.height].map(Number);
    if (!win || !nums.every(Number.isFinite)) { skipped.push(pos.widgetId); continue; }
    const bounds = {
      x: Math.round(area.x + (nums[0] / 100) * area.width),
      y: Math.round(area.y + (nums[1] / 100) * area.height),
      width: Math.max(1, Math.round((nums[2] / 100) * area.width)),
      height: Math.max(1, Math.round((nums[3] / 100) * area.height))
    };
    W.resizeWidgetWindow(pos.widgetId, win, bounds);
    S.updateWidgetState(pos.widgetId, Object.assign({}, bounds, { autoResize: false }));
    W.pushResizeMode(pos.widgetId);
    applied += 1;
  }
  return { applied, skipped };
}

function applyGroups(groups) {
  let applied = 0;
  const skipped = [];
  for (const group of groups || []) {
    const result = applyPositions(group.positions, pickDisplay(group));
    applied += result.applied;
    skipped.push(...result.skipped);
  }
  return { applied, skipped };
}

// Current arrangement of all open widgets, grouped by the display they are on.
function snapshotGroups() {
  const byDisplay = new Map();
  for (const [id, win] of W.activeWindows()) {
    const bounds = win.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const area = display.workArea;
    if (!byDisplay.has(display.id)) {
      byDisplay.set(display.id, {
        displayId: display.id, width: display.size.width, height: display.size.height,
        label: displayInfo(display).label, positions: []
      });
    }
    byDisplay.get(display.id).positions.push({
      widgetId: id,
      x: Math.round(((bounds.x - area.x) / area.width) * 1000) / 10,
      y: Math.round(((bounds.y - area.y) / area.height) * 1000) / 10,
      width: Math.round((bounds.width / area.width) * 1000) / 10,
      height: Math.round((bounds.height / area.height) * 1000) / 10
    });
  }
  return [...byDisplay.values()];
}

function save(name, kind) {
  const groups = snapshotGroups();
  if (!groups.length) throw new Error('Open at least one widget before saving a layout.');
  const data = getData();
  const entry = {
    name, kind: kind === 'profile' ? 'profile' : 'layout',
    createdAt: new Date().toISOString(),
    widgetIds: groups.flatMap((g) => g.positions.map((p) => p.widgetId)),
    groups
  };
  const existing = data.saved.findIndex((e) => e.name === name && e.kind === entry.kind);
  if (existing >= 0) data.saved[existing] = entry;
  else data.saved.push(entry);
  saveData(data);
  return entry;
}

function remove(index) {
  const data = getData();
  if (index >= 0 && index < data.saved.length) {
    data.saved.splice(index, 1);
    saveData(data);
  }
}

// Opens exactly the profile's widgets, closes the rest, then arranges them.
function activate(index) {
  const entry = getData().saved[index];
  if (!entry) throw new Error('That layout no longer exists.');
  if (entry.kind === 'profile') {
    const wanted = new Set(entry.widgetIds);
    for (const item of W.catalog()) {
      const should = wanted.has(item.id);
      const isOn = S.getWidgetState(item.id).enabled !== false;
      if (should && !isOn) W.setEnabled(item.id, true);
      else if (should && !W.getWindow(item.id)) W.load(item.id);
      else if (!should && isOn) W.setEnabled(item.id, false);
    }
  }
  return applyGroups(entry.groups);
}

module.exports = { getData, listDisplays, applyPositions, applyGroups, save, remove, activate, pickDisplay };
