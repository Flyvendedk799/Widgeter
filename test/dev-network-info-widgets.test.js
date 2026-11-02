const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const format = require('../engine/widget-format');

const WIDGETS = [
  'git-status',
  'github-activity',
  'docker-containers',
  'ping-monitor',
  'uptime-checker',
  'hacker-news',
  'quote-of-the-day'
];

test('developer, network & info widgets: load and validate strictly', () => {
  for (const id of WIDGETS) {
    const dir = path.join(__dirname, '..', 'gallery', id);
    const r = format.loadWidget(dir, { strict: true });
    assert.equal(r.ok, true, id + ' validation failed: ' + (r.errors || []).join('; '));
    assert.equal(r.kind, 'folder');
    assert.ok(r.manifest.name, id + ' has name');
    assert.ok(r.manifest.version, id + ' has semver');
    assert.ok(r.manifest.description, id + ' has description');
  }
});

test('developer, network & info widgets: all gallery widgets pass strict format validation', () => {
  const galleryDir = path.join(__dirname, '..', 'gallery');
  const widgets = format.listWidgets(galleryDir);
  assert.ok(widgets.length >= 7, 'gallery must contain widgets');
  let failed = 0;
  for (const w of widgets) {
    const r = format.loadWidget(w.path, { strict: w.kind === 'folder' });
    if (!r.ok) {
      failed++;
    }
  }
  assert.equal(failed, 0, 'all gallery widgets must pass manifest validation');
});

test('developer, network & info widgets: verify DOM elements and IDs', () => {
  const expectedIds = {
    'git-status': ['sub', 'refresh', 'content'],
    'github-activity': ['user', 'refresh', 'list', 'msg'],
    'docker-containers': ['sub', 'refresh', 'list'],
    'ping-monitor': ['sum', 'refresh', 'hosts'],
    'uptime-checker': ['sub', 'refresh', 'list'],
    'hacker-news': ['title', 'sub', 'refresh', 'list'],
    'quote-of-the-day': ['sub', 'copy', 'new', 'q']
  };

  for (const [id, ids] of Object.entries(expectedIds)) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'gallery', id, 'index.html'), 'utf8');
    for (const expectedId of ids) {
      assert.ok(
        html.includes('id="' + expectedId + '"') || html.includes("id='" + expectedId + "'"),
        id + ' must contain DOM element with id="' + expectedId + '"'
      );
    }
  }
});

test('developer, network & info widgets: check modern styling tokens and selectors', () => {
  // Git status: branch/commit badges, refined stats, hover states
  const gitCss = fs.readFileSync(path.join(__dirname, '..', 'gallery', 'git-status', 'style.css'), 'utf8');
  assert.ok(gitCss.includes('.gs-branch'));
  assert.ok(gitCss.includes('.gs-stats'));
  assert.ok(gitCss.includes('.gs-hash'));
  assert.ok(gitCss.includes('.gs-flag'));
  assert.ok(gitCss.includes('.gs-when'));
  assert.ok(gitCss.includes(':hover'));

  // GitHub activity: clean list items, badges, relative timestamps
  const ghCss = fs.readFileSync(path.join(__dirname, '..', 'gallery', 'github-activity', 'style.css'), 'utf8');
  assert.ok(ghCss.includes('.ev'));
  assert.ok(ghCss.includes('.ev-ico'));
  assert.ok(ghCss.includes('.ev-line'));
  assert.ok(ghCss.includes('.ev-meta'));
  assert.ok(ghCss.includes('.ev-count'));
  assert.ok(ghCss.includes(':hover'));

  // Docker containers: glowing status beacons, ports
  const dockerCss = fs.readFileSync(path.join(__dirname, '..', 'gallery', 'docker-containers', 'style.css'), 'utf8');
  assert.ok(dockerCss.includes('.dk-item'));
  assert.ok(dockerCss.includes('.wg-dot.good'));
  assert.ok(dockerCss.includes('.dk-ports'));
  assert.ok(dockerCss.includes(':hover'));

  // Ping monitor: latency meter pills, status beacons, sparklines
  const pingCss = fs.readFileSync(path.join(__dirname, '..', 'gallery', 'ping-monitor', 'style.css'), 'utf8');
  assert.ok(pingCss.includes('.host'));
  assert.ok(pingCss.includes('.ms'));
  assert.ok(pingCss.includes('.wg-dot.good'));
  assert.ok(pingCss.includes('.ln'));
  assert.ok(pingCss.includes(':hover'));

  // Uptime checker: SLA strips, status beacons, latency
  const uptimeCss = fs.readFileSync(path.join(__dirname, '..', 'gallery', 'uptime-checker', 'style.css'), 'utf8');
  assert.ok(uptimeCss.includes('.uc-item'));
  assert.ok(uptimeCss.includes('.uc-hist'));
  assert.ok(uptimeCss.includes('.uc-pct'));
  assert.ok(uptimeCss.includes('.uc-code'));
  assert.ok(uptimeCss.includes(':hover'));

  // Hacker news: card list, voting score pill badges, typography
  const hnCss = fs.readFileSync(path.join(__dirname, '..', 'gallery', 'hacker-news', 'style.css'), 'utf8');
  assert.ok(hnCss.includes('.story'));
  assert.ok(hnCss.includes('.pts'));
  assert.ok(hnCss.includes('.cm'));
  assert.ok(hnCss.includes('.rank'));
  assert.ok(hnCss.includes(':hover'));

  // Quote of the day: stylized quote layout, author styling
  const quoteCss = fs.readFileSync(path.join(__dirname, '..', 'gallery', 'quote-of-the-day', 'style.css'), 'utf8');
  assert.ok(quoteCss.includes('.quote'));
  assert.ok(quoteCss.includes('.qt-text'));
  assert.ok(quoteCss.includes('.qt-author'));
  assert.ok(quoteCss.includes(':hover'));
});

test('developer, network & info widgets: underlying scripts maintain logic & handlers', () => {
  for (const id of WIDGETS) {
    const js = fs.readFileSync(path.join(__dirname, '..', 'gallery', id, 'script.js'), 'utf8');
    assert.ok(js.length > 50, id + ' script must not be empty');
    // Ensure all process/network mechanisms are preserved
    if (id === 'git-status') {
      assert.ok(js.includes('execFile'));
      assert.ok(js.includes('parseStatus'));
    }
    if (id === 'github-activity') {
      assert.ok(js.includes('api.github.com'));
      assert.ok(js.includes('describe'));
    }
    if (id === 'docker-containers') {
      assert.ok(js.includes('execFile'));
      assert.ok(js.includes('docker'));
    }
    if (id === 'ping-monitor') {
      assert.ok(js.includes('ping'));
      assert.ok(js.includes('parseLatency'));
    }
    if (id === 'uptime-checker') {
      assert.ok(js.includes('httpCheck'));
      assert.ok(js.includes('tcpCheck'));
    }
    if (id === 'hacker-news') {
      assert.ok(js.includes('hacker-news.firebaseio.com'));
      assert.ok(js.includes('topstories'));
    }
    if (id === 'quote-of-the-day') {
      assert.ok(js.includes('dummyjson.com/quotes'));
      assert.ok(js.includes('fetchQuote'));
    }
  }
});
