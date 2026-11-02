const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const tokensCss = fs.readFileSync(path.join(__dirname, '../engine/tokens.css'), 'utf8');
const baseCss = fs.readFileSync(path.join(__dirname, '../engine/base.css'), 'utf8');

test('tokens: :root defines all required dark tokens', () => {
  const rootMatch = /:root\s*\{([^}]+)\}/s.exec(tokensCss);
  assert.ok(rootMatch, ':root block must exist');
  const rootContent = rootMatch[1];

  const requiredTokens = [
    '--wg-bg',
    '--wg-fg',
    '--wg-muted',
    '--wg-faint',
    '--wg-border',
    '--wg-surface',
    '--wg-surface-hover',
    '--wg-accent',
    '--wg-accent-soft',
    '--wg-accent-2',
    '--wg-good',
    '--wg-bad',
    '--wg-warn',
    '--wg-info',
    '--wg-radius',
    '--wg-radius-sm',
    '--wg-radius-lg',
    '--wg-radius-pill',
    '--wg-shadow',
    '--wg-glow',
    '--wg-gap',
    '--wg-pad',
    '--wg-font',
    '--wg-mono'
  ];

  for (const token of requiredTokens) {
    assert.ok(rootContent.includes(token + ':'), `Token ${token} should be declared in :root`);
  }

  assert.ok(rootContent.includes('--wg-radius-lg: 18px;'), '--wg-radius-lg should be 18px');
  assert.ok(rootContent.includes('--wg-radius-pill: 9999px;'), '--wg-radius-pill should be 9999px');
  assert.ok(rootContent.includes('--wg-glow: 0 0 12px var(--wg-accent-soft);'), '--wg-glow should use var(--wg-accent-soft)');
  assert.ok(rootContent.includes('color-scheme: dark;'), 'color-scheme should be dark');
});

test('tokens: :root[data-theme="light"] defines complete light theme adaptation', () => {
  const lightMatch = /:root\[data-theme=['"]light['"]\]\s*\{([^}]+)\}/s.exec(tokensCss);
  assert.ok(lightMatch, ':root[data-theme="light"] block must exist');
  const lightContent = lightMatch[1];

  const requiredLightTokens = [
    '--wg-bg',
    '--wg-fg',
    '--wg-muted',
    '--wg-faint',
    '--wg-border',
    '--wg-surface',
    '--wg-surface-hover',
    '--wg-accent',
    '--wg-accent-soft',
    '--wg-accent-2',
    '--wg-good',
    '--wg-bad',
    '--wg-warn',
    '--wg-info',
    '--wg-shadow',
    '--wg-glow'
  ];

  for (const token of requiredLightTokens) {
    assert.ok(lightContent.includes(token + ':'), `Token ${token} should be declared in light theme`);
  }

  assert.ok(lightContent.includes('color-scheme: light;'), 'color-scheme should be light');
});

test('base styles: surfaces and glassmorphism', () => {
  assert.ok(baseCss.includes('.wg-card'), '.wg-card must exist');
  assert.ok(baseCss.includes('.wg-well'), '.wg-well must exist');
  assert.ok(baseCss.includes('backdrop-filter: blur(12px)'), 'backdrop-filter blur must be present');
  assert.ok(baseCss.includes('.wg-glass'), '.wg-glass utility class must exist');
  assert.ok(baseCss.includes('.wg-glow'), '.wg-glow utility class must exist');
});

test('base styles: metrics and trends', () => {
  assert.ok(baseCss.includes('.wg-stat-trend'), '.wg-stat-trend must exist');
  assert.ok(baseCss.includes('.wg-stat-trend.up') || baseCss.includes('.wg-stat-trend .up'), '.up indicator must exist');
  assert.ok(baseCss.includes('.wg-stat-trend.down') || baseCss.includes('.wg-stat-trend .down'), '.down indicator must exist');
});

test('base styles: flexible layouts with wrapping support', () => {
  assert.ok(baseCss.includes('.wg-stack'), '.wg-stack must exist');
  assert.ok(baseCss.includes('.wg-inline'), '.wg-inline must exist');
  assert.ok(baseCss.includes('.wg-spread'), '.wg-spread must exist');
  assert.ok(baseCss.includes('.wg-grid-2'), '.wg-grid-2 must exist');
  assert.ok(baseCss.includes('.wg-grid-3'), '.wg-grid-3 must exist');
  assert.ok(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(baseCss), '.wg-grid-2 should use minmax');
  assert.ok(/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/.test(baseCss), '.wg-grid-3 should use minmax');
});

test('base styles: micro-interactions, buttons and animation timing', () => {
  assert.ok(baseCss.includes('.wg-btn.pill'), '.wg-btn.pill must exist');
  assert.ok(baseCss.includes('.wg-fade-in'), '.wg-fade-in must exist');
  assert.ok(baseCss.includes('transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1)'), '.wg-fill width transition must match contract');
  assert.ok(baseCss.includes('prefers-reduced-motion'), 'prefers-reduced-motion media query must be present');
});
