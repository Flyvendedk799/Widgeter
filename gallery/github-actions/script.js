// GitHub Actions: latest workflow runs for one repo.
const wd = window.widgeter;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
let repo = '';
let token = '';
let busy = false;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const $ = (id) => document.getElementById(id);

function ago(iso) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24);
  return d < 31 ? d + 'd ago' : Math.floor(d / 30) + 'mo ago';
}

function duration(ms) {
  if (!(ms >= 0)) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ' + String(s % 60).padStart(2, '0') + 's';
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
}

// GitHub request with rate-limit and auth handling. Errors carry a user-facing message.
async function gh(path, ttl) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = 'Bearer ' + token;
  let res;
  try {
    res = await wd.fetch('https://api.github.com' + path, { ttl, headers });
  } catch (e) {
    throw new Error("Can't reach GitHub. Check your connection.");
  }
  if (res.ok) return res.json();
  let msg = '';
  try { msg = String(res.json().message || ''); } catch (e) { /* not json */ }
  const limited = (res.status === 403 || res.status === 429) &&
    (res.headers['x-ratelimit-remaining'] === '0' || /rate limit/i.test(msg));
  if (limited) {
    const reset = Number(res.headers['x-ratelimit-reset']) * 1000;
    const mins = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 60000)) : 0;
    throw new Error('GitHub rate limit reached' + (mins ? ' (resets in ' + mins + ' min)' : '') + '.' +
      (token ? '' : ' Add a personal access token in the widget settings to raise the limit.'));
  }
  if (res.status === 401) throw new Error('GitHub rejected the token. Check it in the widget settings.');
  if (res.status === 404) throw new Error(token ? 'Repository not found, or the token cannot access it.' : 'Repository not found. If it is private, add a token in the widget settings.');
  throw new Error('GitHub error ' + res.status + (msg ? ': ' + msg : ''));
}

const STATES = {
  success: { cls: 'good', label: 'passed' },
  failure: { cls: 'bad', label: 'failed' },
  timed_out: { cls: 'bad', label: 'timed out' },
  startup_failure: { cls: 'bad', label: 'failed' },
  cancelled: { cls: 'warn', label: 'cancelled' },
  action_required: { cls: 'warn', label: 'action needed' },
  skipped: { cls: '', label: 'skipped' },
  neutral: { cls: '', label: 'neutral' },
  stale: { cls: '', label: 'stale' },
  in_progress: { cls: 'accent', label: 'running', live: true },
  queued: { cls: 'accent', label: 'queued', live: true },
  waiting: { cls: 'accent', label: 'waiting', live: true },
  pending: { cls: 'accent', label: 'pending', live: true },
  requested: { cls: 'accent', label: 'queued', live: true }
};

function stateOf(run) {
  const key = run.status === 'completed' ? run.conclusion : run.status;
  return STATES[key] || { cls: '', label: String(key || 'unknown').replace(/_/g, ' ') };
}

function showMessage(text) { $('msg').innerHTML = text ? '<div class="wg-err">' + esc(text) + '</div>' : ''; }

function renderRuns(runs) {
  if (!runs.length) {
    $('list').innerHTML = '<div class="wg-empty">No workflow runs yet.<br>This repository has not run any GitHub Actions.</div>';
    $('sum').innerHTML = '';
    return;
  }
  let pass = 0, fail = 0, live = 0;
  $('list').innerHTML = runs.map((run) => {
    const st = stateOf(run);
    if (st.cls === 'good') pass++;
    else if (st.cls === 'bad') fail++;
    else if (st.live) live++;
    const start = new Date(run.run_started_at || run.created_at).getTime();
    const dur = run.status === 'completed' ? duration(new Date(run.updated_at).getTime() - start) : '';
    const title = run.display_title || run.name || 'Workflow run';
    const meta = [run.head_branch, run.name && run.name !== title ? run.name : '', dur].filter(Boolean).map(esc).join(' · ');
    const dotCls = st.cls === 'accent' ? 'live' : st.cls;
    return '<a class="wg-item run" href="' + esc(run.html_url) + '" title="' + esc(title) + '">' +
      '<span class="wg-dot ' + dotCls + (st.live ? ' pulse' : '') + '"></span>' +
      '<div class="run-main"><div class="run-title wg-truncate">' + esc(title) + '</div>' +
      '<div class="run-meta wg-truncate">' + meta + '</div></div>' +
      '<div class="run-side"><span class="wg-badge ' + st.cls + '">' + esc(st.label) + '</span>' +
      '<span class="run-dur">' + esc(ago(run.created_at)) + '</span></div></a>';
  }).join('');
  const badges = [];
  if (pass) badges.push('<span class="wg-badge good">' + pass + ' passed</span>');
  if (fail) badges.push('<span class="wg-badge bad">' + fail + ' failed</span>');
  if (live) badges.push('<span class="wg-badge accent">' + live + ' running</span>');
  $('sum').innerHTML = badges.join('') + '<span class="wg-caption">last ' + runs.length + ' runs</span>';
}

async function load(manual) {
  if (busy || !repo) return;
  busy = true;
  $('refresh').classList.add('spin');
  try {
    const data = await gh('/repos/' + repo + '/actions/runs?per_page=6', manual ? 0 : 60);
    showMessage('');
    renderRuns(data.workflow_runs || []);
  } catch (e) {
    showMessage(e.message);
  } finally {
    busy = false;
    $('refresh').classList.remove('spin');
  }
}

$('list').addEventListener('click', (e) => {
  const a = e.target.closest('a.run');
  if (!a) return;
  e.preventDefault();
  wd.openExternal(a.getAttribute('href'));
});
$('refresh').addEventListener('click', () => load(true));

async function init() {
  repo = String((await wd.getConfig('ga_repo')) || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/+$/, '');
  token = String((await wd.getConfig('gh_token')) || '').trim();
  if (!repo) {
    $('list').innerHTML = '<div class="wg-empty">Set a repository in the widget settings<br>(owner/repo) to see its workflow runs.</div>';
    return;
  }
  $('repo').textContent = repo;
  if (!REPO_RE.test(repo)) {
    $('list').innerHTML = '<div class="wg-empty">"' + esc(repo) + '" is not a valid repository.<br>Use the owner/repo format.</div>';
    return;
  }
  load(false);
  // Unauthenticated access is limited to 60 requests/hour, so poll less often.
  setInterval(() => load(false), token ? 60000 : 180000);
}

init();
