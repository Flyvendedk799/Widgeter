const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let busy = false;

function git(args, cwd) {
  return new Promise((resolve) => {
    execFile('git', args, {
      cwd, windowsHide: true, timeout: 15000, maxBuffer: 16 * 1024 * 1024,
      env: Object.assign({}, process.env, { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' })
    }, (err, stdout, stderr) => resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  });
}

function parseRepoList(raw) {
  return String(raw || '').split(/\r?\n/).map((l) => l.trim().replace(/^["']|["']$/g, '')).filter((l) => l && l[0] !== '#')
    .map((l) => (l === '~' || /^~[\\/]/.test(l) ? path.join(os.homedir(), l.slice(1)) : l));
}

// git status --porcelain=v2 --branch -z
function parseStatus(out) {
  const r = { head: '', oid: '', upstream: '', ahead: 0, behind: 0, hasAb: false, files: [], staged: 0, modified: 0, untracked: 0, conflicts: 0 };
  const tokens = out.split('\0');
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t) continue;
    let m;
    if (t[0] === '#') {
      if ((m = /^# branch\.head (.*)$/.exec(t))) r.head = m[1];
      else if ((m = /^# branch\.oid (.*)$/.exec(t))) r.oid = m[1];
      else if ((m = /^# branch\.upstream (.*)$/.exec(t))) r.upstream = m[1];
      else if ((m = /^# branch\.ab \+(\d+) -(\d+)$/.exec(t))) { r.ahead = +m[1]; r.behind = +m[2]; r.hasAb = true; }
    } else if ((m = /^1 (\S\S) (?:\S+ ){6}(.*)$/.exec(t))) {
      addEntry(r, m[1], m[2]);
    } else if ((m = /^2 (\S\S) (?:\S+ ){7}(.*)$/.exec(t))) {
      addEntry(r, m[1], m[2]);
      i++; // the original path of a rename follows as its own token
    } else if ((m = /^u (\S\S) (?:\S+ ){8}(.*)$/.exec(t))) {
      r.conflicts++; r.files.push({ flag: 'U', file: m[2], staged: false });
    } else if (t[0] === '?') {
      r.untracked++; r.files.push({ flag: '?', file: t.slice(2), staged: false });
    }
  }
  return r;
}

function addEntry(r, xy, file) {
  const x = xy[0], y = xy[1];
  if (x !== '.') r.staged++;
  if (y !== '.') r.modified++;
  const flag = y !== '.' ? y : x;
  r.files.push({ flag: flag === 'C' ? 'A' : flag, file, staged: x !== '.' });
}

function explain(r, dir) {
  const text = (r.stderr || (r.err && r.err.message) || '').trim();
  if (r.err && r.err.code === 'ENOENT') return { global: true, msg: 'git is not installed or not on PATH.' };
  if (r.err && r.err.killed) return { msg: 'git timed out after 15 s.' };
  if (/not a git repository/i.test(text)) return { msg: 'Not a git repository.' };
  if (/dubious ownership/i.test(text)) return { msg: 'git blocked this folder (dubious ownership). Run: git config --global --add safe.directory "' + dir.replace(/\\/g, '/') + '"' };
  return { msg: text.split('\n')[0].slice(0, 200) || 'git failed.' };
}

async function loadRepo(dir, commitCount) {
  const repo = { dir, name: path.basename(dir.replace(/[\\/]+$/, '')) || dir };
  try {
    if (!fs.statSync(dir).isDirectory()) throw new Error('not a folder');
  } catch (e) {
    repo.error = 'Folder not found.';
    return repo;
  }
  const st = await git(['-c', 'core.quotepath=off', 'status', '--porcelain=v2', '--branch', '-z'], dir);
  if (st.err) {
    const e = explain(st, dir);
    repo.error = e.msg; repo.global = e.global;
    return repo;
  }
  repo.s = parseStatus(st.stdout);
  const lg = await git(['log', '-n', String(commitCount), '--pretty=format:%h%x1f%s%x1f%cr'], dir);
  repo.commits = lg.err ? [] : lg.stdout.split('\n').filter(Boolean).map((l) => { const p = l.split('\x1f'); return { hash: p[0], subject: p[1] || '', when: p[2] || '' }; });
  return repo;
}

function branchLabel(s) {
  if (s.head === '(detached)') return 'detached @ ' + (s.oid || '').slice(0, 7);
  return s.head || '(unknown)';
}

function abBadges(s) {
  let h = '';
  if (s.upstream && s.hasAb) {
    if (s.ahead) h += '<span class="wg-badge good" title="Commits to push">↑' + s.ahead + '</span>';
    if (s.behind) h += '<span class="wg-badge warn" title="Commits to pull">↓' + s.behind + '</span>';
  }
  return h;
}

function stat(label, n, tone) {
  return '<div class="gs-stat' + (n && tone ? ' on-' + tone : '') + '"><div class="wg-big-sm">' + n + '</div><div class="wg-caption">' + label + '</div></div>';
}

function renderDetailed(r, maxFiles) {
  if (r.error) return '<div class="wg-card"><b>' + esc(r.name) + '</b><div class="gs-err">' + esc(r.error) + '</div></div>';
  const s = r.s;
  const total = s.files.length;
  const sync = !s.upstream ? 'no upstream branch' : (!s.ahead && !s.behind ? 'in sync with ' + s.upstream : s.upstream);
  let h = '<div class="wg-card"><div class="wg-spread"><div class="gs-branch wg-truncate" title="' + esc(branchLabel(s)) + '">⎇ ' + esc(branchLabel(s)) + '</div>' +
    '<div class="gs-badges">' + abBadges(s) + (s.conflicts ? '<span class="wg-badge bad">conflicts</span>' : (total ? '' : '<span class="wg-badge good">clean</span>')) + '</div></div>' +
    '<div class="gs-upstream wg-truncate">' + esc(sync) + '</div>' +
    '<div class="gs-stats">' +
    stat('Staged', s.staged, 'good') + stat('Modified', s.modified, s.conflicts ? 'bad' : 'warn') + stat('Untracked', s.untracked, '') +
    '</div></div>';

  if (total && maxFiles > 0) {
    h += '<div><div class="wg-caption gs-section">Changes</div>';
    const shown = s.files.slice().sort((a, b) => (b.flag === 'U') - (a.flag === 'U') || (b.staged - a.staged)).slice(0, maxFiles);
    h += shown.map((f) => {
      const base = f.file.split('/').pop();
      const dirPart = f.file.slice(0, f.file.length - base.length);
      return '<div class="gs-file' + (f.staged ? ' staged' : '') + '" title="' + esc(f.file) + '"><span class="gs-flag ' + esc(f.flag) + '">' + esc(f.flag) + '</span>' +
        '<span class="wg-truncate"><span class="gs-fname">' + esc(base) + '</span> <span class="gs-dir">' + esc(dirPart) + '</span></span></div>';
    }).join('');
    if (total > shown.length) h += '<div class="gs-more">+' + (total - shown.length) + ' more</div>';
    h += '</div>';
  }

  h += '<div><div class="wg-caption gs-section">Recent commits</div>';
  h += r.commits.length ? r.commits.map((c) =>
    '<div class="gs-commit" title="' + esc(c.subject) + '"><span class="gs-hash">' + esc(c.hash) + '</span><span class="wg-truncate wg-grow">' + esc(c.subject) + '</span><span class="gs-when">' + esc(c.when) + '</span></div>'
  ).join('') : '<div class="gs-note">No commits yet.</div>';
  return h + '</div>';
}

function renderCompact(r) {
  if (r.error) return '<div class="wg-card"><div class="gs-repo-name wg-truncate" title="' + esc(r.dir) + '">' + esc(r.name) + '</div><div class="gs-err">' + esc(r.error) + '</div></div>';
  const s = r.s;
  const total = s.files.length;
  const state = s.conflicts ? '<span class="wg-badge bad">' + s.conflicts + ' conflict' + (s.conflicts > 1 ? 's' : '') + '</span>'
    : total ? '<span class="wg-badge warn">' + total + ' changed</span>' : '<span class="wg-badge good">clean</span>';
  const c = r.commits[0];
  return '<div class="wg-card"><div class="wg-spread"><div class="gs-repo-name wg-truncate" title="' + esc(r.dir) + '">' + esc(r.name) + '</div>' +
    '<div class="gs-badges">' + abBadges(s) + state + '</div></div>' +
    '<div class="gs-line"><span class="wg-badge accent gs-badge-branch" title="' + esc(branchLabel(s)) + '">' + esc(branchLabel(s)) + '</span>' +
    (c ? '<span class="gs-hash">' + esc(c.hash) + '</span><span class="wg-truncate wg-grow" title="' + esc(c.subject) + '">' + esc(c.subject) + '</span>' : '<span>No commits yet</span>') + '</div></div>';
}

async function update() {
  if (busy) return;
  busy = true;
  try {
    const dirs = parseRepoList(await widgeter.getConfig('repo_path'));
    if (!dirs.length) {
      $('sub').textContent = 'Not configured';
      $('content').innerHTML = '<div class="wg-empty">🌿<br>Choose a repository in this widget’s settings<br>(“Repository folder(s)”).</div>';
      return;
    }
    const maxFiles = Math.max(0, Number(await widgeter.getConfig('git_max_files')) || 0);
    const repos = [];
    for (const d of dirs.slice(0, 12)) repos.push(await loadRepo(d, dirs.length === 1 ? 4 : 1));
    if (repos[0] && repos[0].global) {
      $('sub').textContent = 'git unavailable';
      $('content').innerHTML = '<div class="wg-empty"><b>git not found</b><br>Install Git for Windows and make sure “git” is on your PATH.</div>';
      return;
    }
    const single = repos.length === 1;
    $('sub').textContent = single ? repos[0].name : repos.length + ' repositories';
    $('content').innerHTML = repos.map((r) => (single ? renderDetailed(r, maxFiles) : renderCompact(r))).join('');
  } catch (e) {
    $('content').innerHTML = '<div class="wg-err">' + esc(e.message || e) + '</div>';
  } finally {
    busy = false;
  }
}

$('refresh').addEventListener('click', update);
update();
setInterval(update, 30000);
