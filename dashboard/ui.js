'use strict';
// Small DOM toolkit for the dashboard: element builder, icons, toast, modal, menu.

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'html') el.innerHTML = value; // only ever used with static icon markup
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const ICONS = {
  widgets: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM17.5 14v7M14 17.5h7"/>',
  discover: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  creator: '<path d="M4 20l4-1 11-11-3-3L5 16zM14 6l3 3"/>',
  layouts: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  logs: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  edit: '<path d="M4 20l4-1 11-11-3-3L5 16z"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  refresh: '<path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>'
};

function icon(name) {
  const svg = h('span', { html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>', style: { display: 'inline-flex' } });
  return svg.firstChild;
}

function toast(message, kind) {
  const wrap = document.getElementById('toast-wrap');
  const el = h('div', { class: 'toast' + (kind === 'bad' ? ' bad' : '') }, message);
  wrap.appendChild(el);
  setTimeout(() => el.remove(), kind === 'bad' ? 6000 : 3400);
}

function switchEl(checked, onChange) {
  const input = h('input', { type: 'checkbox' });
  input.checked = !!checked;
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'switch', onclick: (e) => e.stopPropagation() }, input, h('span'));
}

// ---- modal ------------------------------------------------------------------

function openModal(content, options = {}) {
  const root = document.getElementById('modal-root');
  const scrim = h('div', { class: 'scrim', onclick: () => close() });
  const box = h('div', { class: 'modal' + (options.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' }, content);
  root.append(scrim, box);
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  function close() {
    document.removeEventListener('keydown', onKey);
    scrim.remove();
    box.remove();
    if (options.onClose) options.onClose();
  }
  return { close, box };
}

function confirmDialog(title, message, confirmLabel, danger) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => { if (!done) { done = true; resolve(value); } };
    const modal = openModal([
      h('h2', {}, title),
      h('p', { class: 'muted', style: { marginTop: '6px' } }, message),
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', onclick: () => { finish(false); modal.close(); } }, 'Cancel'),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => { finish(true); modal.close(); } }, confirmLabel || 'OK'))
    ], { onClose: () => finish(false) });
  });
}

// ---- popup menu --------------------------------------------------------------

function openMenu(anchor, items) {
  document.querySelectorAll('.menu').forEach((m) => m.remove());
  const rect = anchor.getBoundingClientRect();
  const menu = h('div', { class: 'menu' });
  for (const item of items) {
    if (item === '-') { menu.appendChild(h('hr')); continue; }
    menu.appendChild(h('button', { class: item.danger ? 'danger' : '', onclick: () => { menu.remove(); item.run(); } }, item.label));
  }
  document.body.appendChild(menu);
  const w = menu.offsetWidth;
  const hgt = menu.offsetHeight;
  menu.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, rect.right - w)) + 'px';
  menu.style.top = (rect.bottom + hgt + 8 > window.innerHeight ? rect.top - hgt - 4 : rect.bottom + 4) + 'px';
  setTimeout(() => {
    const away = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', away, true); } };
    document.addEventListener('mousedown', away, true);
  }, 0);
}

// ---- formatting ---------------------------------------------------------------

function stars(avg) {
  if (!avg) return '';
  const full = Math.round(avg);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

function timeAgo(ts) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}

function compact(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

const CATEGORY_LABELS = { system: 'System', dev: 'Developer', info: 'Info', productivity: 'Productivity', finance: 'Finance', time: 'Time', media: 'Media', other: 'Other' };

module.exports = { h, append, icon, toast, switchEl, openModal, confirmDialog, openMenu, stars, timeAgo, compact, CATEGORY_LABELS };
