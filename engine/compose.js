'use strict';
// Builds the HTML page a widget runs in. Used by the app and by the test harness,
// so what the tests load is exactly what users get.
const fs = require('fs');
const path = require('path');

const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const TOKENS_CSS = read('tokens.css');
const BASE_CSS = read('base.css');
const SMART_RESIZE_CLIENT = read('smart-resize-client.js');
const RUNTIME_CLIENT = read('runtime-client.js');

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function hexToRgba(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return 'rgba(0,245,212,' + alpha + ')';
  const n = parseInt(m[1], 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
}

// accent: a #rrggbb colour, or anything else ("auto") to use the theme's own accent.
function themeAttrs(theme, accent) {
  const explicit = /^#[0-9a-f]{6}$/i.test(accent);
  return { theme: theme === 'light' ? 'light' : 'dark', accent: explicit ? accent : null, accentSoft: explicit ? hexToRgba(accent, 0.14) : null };
}

function displayModePayload(wState) {
  return { enabled: !!wState.autoResize, minWidth: wState.minWidth, maxWidth: wState.maxWidth, minHeight: wState.minHeight, maxHeight: wState.maxHeight };
}

/**
 * @param {string} id          widget id (used for the title and source name)
 * @param {object} manifest    normalised manifest with html/css/js inlined
 * @param {object} display     widget state: autoResize, minWidth, ...
 * @param {{theme,accent,accentSoft}} theme  result of themeAttrs()
 */
function composePage(id, manifest, display, theme) {
  const dragRule = manifest.draggable_body ? '-webkit-app-region: drag;' : '';
  const js = String(manifest.js || '').replace(/<\/script/gi, '<\\/script');
  return [
    '<!DOCTYPE html><html data-theme="', theme.theme, '"', theme.accent ? ' style="--wg-accent:' + theme.accent + ';--wg-accent-soft:' + theme.accentSoft + '"' : '', '><head><meta charset="utf-8"><title>',
    escapeHtml(manifest.name || id), '</title><style>',
    TOKENS_CSS,
    manifest.useBaseStyles ? BASE_CSS : '',
    'body{margin:0;overflow:auto;', dragRule, '}',
    'body::-webkit-scrollbar{width:6px;height:6px;}',
    'body::-webkit-scrollbar-thumb{background-color:rgba(166,173,200,0.3);border-radius:4px;}',
    'body::-webkit-scrollbar-track{background:transparent;}',
    'button,a,input,textarea,select,.no-drag{-webkit-app-region:no-drag;}',
    manifest.css || '',
    'html.widgeter-smart body{overflow-x:hidden !important;overflow-y:auto !important;}',
    '#widgeter-resize-grip{position:fixed;right:1px;bottom:1px;width:16px;height:16px;cursor:nwse-resize;z-index:2147483646;-webkit-app-region:no-drag;',
    'background:linear-gradient(135deg,transparent 0 50%,rgba(205,214,244,0.92) 50% 100%);}',
    '</style></head><body>',
    manifest.html || '',
    '<script>', RUNTIME_CLIENT, '</script>',
    '<script>', js, '\n//# sourceURL=widget://', encodeURIComponent(id), '/script.js\n</script>',
    '<script>window.__widgeterDisplay=', JSON.stringify(displayModePayload(display || {})), ';</script>',
    '<script>', SMART_RESIZE_CLIENT, '</script></body></html>'
  ].join('');
}

module.exports = { composePage, themeAttrs, displayModePayload, escapeHtml };
