'use strict';
// "Describe a widget" generation using the Claude API. The user supplies their own
// Anthropic API key in Settings; nothing is sent anywhere until they press Generate.
const { net } = require('electron');

const S = require('./state');
const { validateManifest, CATEGORIES } = require('../engine/manifest');

const MODEL = 'claude-sonnet-5-5';

const SYSTEM = `You write desktop widgets for Widgeter, an Electron widget engine. A widget is ONE JSON object.

Return ONLY that JSON object, no prose, no code fences.

Shape:
{
  "id": "kebab-case-slug",
  "name": "Short Name",
  "version": "1.0.0",
  "author": "",
  "description": "One sentence (max 280 chars).",
  "category": one of ${CATEGORIES.join(', ')},
  "icon": "one emoji",
  "width": 280, "height": 220,
  "config": [ { "key": "city", "label": "City", "type": "text|password|number|select|boolean|textarea|color|url", "default": "...", "placeholder": "", "help": "", "required": false, "options": [{"value":"a","label":"A"}] } ],
  "html": "markup for the body",
  "css": "extra CSS (optional)",
  "js": "widget logic"
}

Runtime rules:
- The widget runs in a frameless transparent window with Node integration. Use plain browser JS (no imports). Top-level 'return' is a syntax error.
- The engine already styles <body> (glass card, rounded, border) and provides CSS tokens --wg-bg, --wg-fg, --wg-muted, --wg-faint, --wg-border, --wg-surface, --wg-accent, --wg-good, --wg-bad, --wg-warn, plus components: .wg-header .wg-header-main .wg-icon .wg-title .wg-sub, .wg-card, .wg-row .wg-lbl .wg-val, .wg-big, .wg-big-sm, .wg-caption, .wg-list .wg-item, .wg-badge (.good .bad .warn .accent), .wg-dot, .wg-bar > .wg-fill, .wg-btn (.primary .sm .icon), .wg-input, .wg-empty, .wg-err, .wg-skeleton, .wg-stack, .wg-inline, .wg-spread, .wg-grow, .wg-truncate. Prefer these over custom CSS; support light and dark by using the tokens.
- Do not use min-height:100vh. Buttons/inputs are clickable automatically; any other clickable element needs class "no-drag".
- API available as window.widgeter: await getConfig(key) / getAllConfig(); fetchJson(url,{ttl:seconds}) and fetch(url,opts) (shared cache, use ttl for polling APIs); notify(title, body); openExternal(url); dataDir (folder for files); log(level,msg); onVisible(cb). setInterval is paused automatically while hidden.
- Use real data sources only (public no-key APIs, os/child_process/fs for local info). Never simulate or fake data. Show a clear empty/error state when data is unavailable.
- Settings the user must provide (API keys, cities, usernames) go in "config", never hard-coded. Mark them required when the widget cannot work without them.
- Escape any untrusted text before putting it in innerHTML (use textContent where possible).`;

function extractJson(text) {
  const cleaned = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('The model did not return a widget.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

// current: optional existing widget object to modify instead of creating from scratch.
async function generate(prompt, current) {
  const key = S.getSettings().anthropicKey;
  if (!key) throw new Error('Add your Anthropic API key in Settings first.');
  const userContent = current
    ? 'Here is the current widget:\n' + JSON.stringify(current) + '\n\nChange it as follows and return the full updated widget:\n' + prompt
    : 'Create this widget:\n' + prompt;

  const res = await net.fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, system: SYSTEM, messages: [{ role: 'user', content: userContent }] })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error && data.error.message) || 'Claude API error ' + res.status);
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const widget = extractJson(text);
  const check = validateManifest(widget);
  return { widget, errors: check.errors, warnings: check.warnings };
}

module.exports = { generate, extractJson, MODEL };
