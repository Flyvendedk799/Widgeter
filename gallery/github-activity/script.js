// GitHub Activity: recent public events for one user.
const wd = window.widgeter;
const USER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const SHOWN = 7;
let username = '';
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
  if (res.status === 404) throw new Error('GitHub user "' + username + '" not found.');
  throw new Error('GitHub error ' + res.status + (msg ? ': ' + msg : ''));
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const refName = (ref) => String(ref || '').replace(/^refs\/(heads|tags)\//, '');

// Turns an event into { icon, verb, detail, url }. The events API no longer includes commit
// lists or PR titles, so only what is present in the payload is shown.
function describe(ev) {
  const p = ev.payload || {};
  const base = 'https://github.com/' + ev.repo.name;
  const issue = p.issue;
  const num = (n) => (n ? '#' + n : '');
  switch (ev.type) {
    case 'PushEvent': {
      const branch = refName(p.ref);
      const fresh = !p.before || /^0+$/.test(p.before);
      return { icon: '⬆️', verb: 'Pushed', detail: branch ? 'to ' + branch : '',
        url: !fresh && p.head ? base + '/compare/' + p.before.slice(0, 12) + '...' + p.head.slice(0, 12) : base + '/commits/' + branch };
    }
    case 'PullRequestEvent': {
      const n = p.number || (p.pull_request && p.pull_request.number);
      return { icon: '🔀', verb: cap(p.action || 'updated'), detail: 'PR ' + num(n), url: base + '/pull/' + n };
    }
    case 'PullRequestReviewEvent': {
      const n = p.pull_request && p.pull_request.number;
      return { icon: '👀', verb: 'Reviewed', detail: 'PR ' + num(n), url: (p.review && p.review.html_url) || base + '/pull/' + n };
    }
    case 'PullRequestReviewCommentEvent': {
      const n = p.pull_request && p.pull_request.number;
      return { icon: '💬', verb: 'Commented on', detail: 'PR ' + num(n), url: (p.comment && p.comment.html_url) || base + '/pull/' + n };
    }
    case 'IssuesEvent':
      return { icon: '📌', verb: cap(p.action || 'updated'), detail: issue ? num(issue.number) + ' ' + (issue.title || '') : 'issue', url: (issue && issue.html_url) || base + '/issues' };
    case 'IssueCommentEvent':
      return { icon: '💬', verb: 'Commented on', detail: issue ? num(issue.number) + ' ' + (issue.title || '') : 'an issue',
        url: (p.comment && p.comment.html_url) || (issue && issue.html_url) || base };
    case 'CommitCommentEvent':
      return { icon: '💬', verb: 'Commented on', detail: 'a commit', url: (p.comment && p.comment.html_url) || base };
    case 'WatchEvent':
      return { icon: '⭐', verb: 'Starred', detail: '', url: base };
    case 'ForkEvent':
      return { icon: '🍴', verb: 'Forked', detail: p.forkee ? 'to ' + p.forkee.full_name : '', url: (p.forkee && p.forkee.html_url) || base };
    case 'CreateEvent': {
      const t = p.ref_type || 'repository';
      return { icon: '➕', verb: 'Created', detail: t + (p.ref ? ' ' + p.ref : ''),
        url: t === 'branch' ? base + '/tree/' + p.ref : t === 'tag' ? base + '/releases/tag/' + p.ref : base };
    }
    case 'DeleteEvent':
      return { icon: '➖', verb: 'Deleted', detail: (p.ref_type || '') + (p.ref ? ' ' + p.ref : ''), url: base };
    case 'ReleaseEvent': {
      const r = p.release || {};
      return { icon: '🚀', verb: cap(p.action || 'published'), detail: 'release ' + (r.name || r.tag_name || ''), url: r.html_url || base + '/releases' };
    }
    case 'PublicEvent':
      return { icon: '🌍', verb: 'Made public', detail: '', url: base };
    case 'MemberEvent':
      return { icon: '👥', verb: 'Added a collaborator', detail: '', url: base };
    case 'GollumEvent':
      return { icon: '📖', verb: 'Edited the wiki', detail: '', url: base + '/wiki' };
    default:
      return { icon: '•', verb: ev.type.replace(/Event$/, '').replace(/([a-z])([A-Z])/g, '$1 $2'), detail: '', url: base };
  }
}

// Merge consecutive identical events (e.g. several pushes to one branch) into "x3".
function group(events) {
  const out = [];
  for (const ev of events) {
    const d = describe(ev);
    const key = ev.type + '|' + ev.repo.name + '|' + d.verb + '|' + d.detail;
    const last = out[out.length - 1];
    if (last && last.key === key && ev.type === 'PushEvent') last.count++;
    else out.push({ key, d, repo: ev.repo.name, at: ev.created_at, count: 1 });
  }
  return out;
}

function showMessage(text) { $('msg').innerHTML = text ? '<div class="wg-err">' + esc(text) + '</div>' : ''; }

function render(events) {
  if (!events.length) {
    $('list').innerHTML = '<div class="wg-empty">No recent public activity for @' + esc(username) + '.</div>';
    return;
  }
  $('list').innerHTML = group(events).slice(0, SHOWN).map((g) => {
    const detail = g.d.detail ? ' <span class="ev-detail">' + esc(g.d.detail) + '</span>' : '';
    const count = g.count > 1 ? '<span class="wg-badge ev-count">×' + g.count + '</span>' : '';
    return '<a class="wg-item ev" href="' + esc(g.d.url) + '" title="' + esc(g.d.verb + ' ' + g.d.detail + ' · ' + g.repo) + '">' +
      '<span class="ev-ico">' + g.d.icon + '</span>' +
      '<div class="ev-main"><div class="ev-line wg-truncate"><b>' + esc(g.d.verb) + '</b>' + detail + count + '</div>' +
      '<div class="ev-meta wg-truncate">' + esc(g.repo) + ' · ' + esc(ago(g.at)) + '</div></div></a>';
  }).join('');
}

async function load(manual) {
  if (busy || !username) return;
  busy = true;
  $('refresh').classList.add('spin');
  try {
    const events = await gh('/users/' + encodeURIComponent(username) + '/events/public?per_page=30', manual ? 0 : 90);
    showMessage('');
    render(Array.isArray(events) ? events : []);
  } catch (e) {
    showMessage(e.message);
  } finally {
    busy = false;
    $('refresh').classList.remove('spin');
  }
}

$('list').addEventListener('click', (e) => {
  const a = e.target.closest('a.ev');
  if (!a) return;
  e.preventDefault();
  wd.openExternal(a.getAttribute('href'));
});
$('refresh').addEventListener('click', () => load(true));

async function init() {
  username = String((await wd.getConfig('ga2_username')) || '').trim().replace(/^@/, '').replace(/^https?:\/\/github\.com\//i, '').replace(/\/+$/, '');
  token = String((await wd.getConfig('gh_token')) || '').trim();
  if (!username) {
    $('list').innerHTML = '<div class="wg-empty">Enter a GitHub username in the widget settings<br>to see their recent public activity.</div>';
    return;
  }
  $('user').textContent = '@' + username;
  if (!USER_RE.test(username)) {
    $('list').innerHTML = '<div class="wg-empty">"' + esc(username) + '" is not a valid GitHub username.</div>';
    return;
  }
  load(false);
  setInterval(() => load(false), token ? 120000 : 240000);
}

init();
