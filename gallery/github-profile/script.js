// GitHub Profile: profile card, totals, top languages and (with a token) the contribution graph.
const wd = window.widgeter;
const USER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const WEEKS = 26;
const CONTRIB_REFRESH_MS = 10 * 60 * 1000;
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
let username = '';
let token = '';
let busy = false;
let contribHtml = '';
let contribAt = 0;
let profileUrl = '';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const $ = (id) => document.getElementById(id);

function ghError(res, notFound) {
  let msg = '';
  try { msg = String(res.json().message || ''); } catch (e) { /* not json */ }
  const limited = (res.status === 403 || res.status === 429) &&
    (res.headers['x-ratelimit-remaining'] === '0' || /rate limit/i.test(msg));
  if (limited) {
    const reset = Number(res.headers['x-ratelimit-reset']) * 1000;
    const mins = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 60000)) : 0;
    return new Error('GitHub rate limit reached' + (mins ? ' (resets in ' + mins + ' min)' : '') + '.' +
      (token ? '' : ' Add a personal access token in the widget settings to raise the limit.'));
  }
  if (res.status === 401) return new Error('GitHub rejected the token. Check it in the widget settings.');
  if (res.status === 404) return new Error(notFound || 'Not found.');
  return new Error('GitHub error ' + res.status + (msg ? ': ' + msg : ''));
}

async function request(path, opts, notFound) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = 'Bearer ' + token;
  let res;
  try {
    res = await wd.fetch('https://api.github.com' + path, Object.assign({}, opts, { headers: Object.assign(headers, opts.headers) }));
  } catch (e) {
    throw new Error("Can't reach GitHub. Check your connection.");
  }
  if (!res.ok) throw ghError(res, notFound);
  return res.json();
}

const gh = (path, ttl, notFound) => request(path, { ttl }, notFound);

async function graphql(query, variables) {
  const data = await request('/graphql', { method: 'POST', body: JSON.stringify({ query, variables }), headers: { 'Content-Type': 'application/json' } });
  if (data.errors && data.errors.length) throw new Error(String(data.errors[0].message || 'GraphQL error'));
  return data.data;
}

function showMessage(text) { $('msg').innerHTML = text ? '<div class="wg-err">' + esc(text) + '</div>' : ''; }

function topLanguages(repos) {
  const counts = new Map();
  for (const r of repos) {
    if (r.fork || !r.language) continue;
    counts.set(r.language, (counts.get(r.language) || 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, n]) => ({ name, pct: Math.round((n / total) * 100), n }));
}

function renderProfile(user, repos) {
  profileUrl = user.html_url;
  $('user').textContent = 'github.com/' + user.login;
  const partial = repos && user.public_repos > repos.length;
  const stars = repos ? repos.reduce((a, r) => a + (r.stargazers_count || 0), 0) : null;
  const facts = [user.location, user.company, user.created_at ? 'Joined ' + new Date(user.created_at).getFullYear() : '']
    .filter(Boolean).map((f) => '<span>' + esc(f) + '</span>').join('');

  const tiles = [
    ['Repos', compact.format(user.public_repos || 0), ''],
    ['Followers', compact.format(user.followers || 0), ''],
    ['Following', compact.format(user.following || 0), ''],
    ['Stars', stars == null ? '-' : compact.format(stars) + (partial ? '+' : ''), partial ? 'Counted over the 100 most recently pushed repositories' : '']
  ].map(([label, val, tip]) => '<div class="wg-card stat" title="' + esc(tip) + '"><div class="wg-big-sm">' + esc(val) + '</div><div class="wg-caption">' + label + '</div></div>').join('');

  const langs = repos ? topLanguages(repos) : [];
  const langCard = langs.length
    ? '<div class="wg-card"><div class="wg-caption">Top languages</div>' +
      '<div class="langbar">' + langs.map((l, i) => '<span class="l' + i + '" style="flex:' + l.n + '" title="' + esc(l.name + ' ' + l.pct + '%') + '"></span>').join('') + '</div>' +
      '<div class="langs">' + langs.map((l, i) => '<span><i class="l' + i + '"></i>' + esc(l.name) + ' ' + l.pct + '%</span>').join('') + '</div></div>'
    : '';

  $('body').innerHTML =
    '<div class="who"><img class="avatar no-drag" alt="" src="' + esc(user.avatar_url) + '&s=104"><div class="wg-grow">' +
    '<div class="who-name wg-truncate">' + esc(user.name || user.login) + '</div>' +
    '<div class="who-login no-drag wg-truncate" id="open-profile">@' + esc(user.login) + '</div></div></div>' +
    (user.bio || facts ? '<div>' + (user.bio ? '<div class="bio">' + esc(user.bio) + '</div>' : '') + (facts ? '<div class="facts">' + facts + '</div>' : '') + '</div>' : '') +
    '<div class="stats">' + tiles + '</div>' + langCard +
    '<div class="wg-card" id="contrib">' + contribMarkup() + '</div>';
  const img = document.querySelector('.avatar');
  if (img) img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
}

function contribMarkup() {
  if (!token) return '<div class="hint">Add a personal access token (read:user) in the widget settings to see the contribution graph.</div>';
  return contribHtml || '<div class="wg-skeleton" style="height:70px"></div>';
}

const LEVELS = { NONE: '', FIRST_QUARTILE: 'c1', SECOND_QUARTILE: 'c2', THIRD_QUARTILE: 'c3', FOURTH_QUARTILE: 'c4' };

async function loadContributions() {
  const data = await graphql(
    'query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{weeks{contributionDays{contributionCount weekday contributionLevel date}}}}}}',
    { login: username });
  if (!data || !data.user) throw new Error('No contribution data for this account.');
  const weeks = data.user.contributionsCollection.contributionCalendar.weeks.slice(-WEEKS);
  let total = 0;
  const cells = [];
  for (const w of weeks) {
    const col = new Array(7).fill(null);
    for (const d of w.contributionDays) { col[d.weekday] = d; total += d.contributionCount; }
    for (const d of col) {
      if (!d) cells.push('<span class="none"></span>');
      else cells.push('<span class="' + (LEVELS[d.contributionLevel] || '') + '" title="' + esc(d.contributionCount + ' on ' + d.date) + '"></span>');
    }
  }
  contribHtml = '<div class="wg-spread"><div class="wg-caption">Contributions</div><div class="wg-val">' + total.toLocaleString() + ' <span class="wg-lbl">· last ' + WEEKS + ' weeks</span></div></div>' +
    '<div class="cal">' + cells.join('') + '</div>';
  contribAt = Date.now();
}

async function load(manual) {
  if (busy || !username) return;
  busy = true;
  $('refresh').classList.add('spin');
  try {
    const u = encodeURIComponent(username);
    const [user, repos] = await Promise.all([
      gh('/users/' + u, manual ? 0 : 300, 'GitHub user "' + username + '" not found.'),
      gh('/users/' + u + '/repos?per_page=100&type=owner&sort=pushed', manual ? 0 : 300).catch(() => null)
    ]);
    showMessage('');
    renderProfile(user, Array.isArray(repos) ? repos : null);
  } catch (e) {
    showMessage(e.message);
    busy = false;
    $('refresh').classList.remove('spin');
    return;
  }
  if (token && (manual || !contribHtml || Date.now() - contribAt > CONTRIB_REFRESH_MS)) {
    try {
      await loadContributions();
    } catch (e) {
      contribHtml = '<div class="hint">Contribution graph unavailable: ' + esc(e.message) + '</div>';
    }
    const el = $('contrib');
    if (el) el.innerHTML = contribMarkup();
  }
  busy = false;
  $('refresh').classList.remove('spin');
}

document.addEventListener('click', (e) => {
  if (profileUrl && e.target.closest('.who-login, .avatar')) wd.openExternal(profileUrl);
});
$('refresh').addEventListener('click', () => load(true));

async function init() {
  username = String((await wd.getConfig('gh_username')) || '').trim().replace(/^@/, '').replace(/^https?:\/\/github\.com\//i, '').replace(/\/+$/, '');
  token = String((await wd.getConfig('gh_token')) || '').trim();
  if (!username) {
    $('body').innerHTML = '<div class="wg-empty">Enter a GitHub username in the widget settings<br>to show their profile.</div>';
    return;
  }
  if (!USER_RE.test(username)) {
    $('body').innerHTML = '<div class="wg-empty">"' + esc(username) + '" is not a valid GitHub username.</div>';
    return;
  }
  $('user').textContent = 'github.com/' + username;
  load(false);
  setInterval(() => load(false), 10 * 60 * 1000);
}

init();
