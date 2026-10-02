// GitHub Pull Requests: open PRs involving you, with merge state and merge/close/ready actions.
const wd = window.widgeter;
const MAX_DETAILS = 10;
const FILTERS = { involves: 'involving you', author: 'opened by you', 'review-requested': 'awaiting your review', assignee: 'assigned to you' };
let token = '';
let filter = 'involves';
let mergeMethod = 'squash';
let prs = [];
let total = 0;
let details = {};   // PR id -> detail payload (mergeable_state, additions, ...)
let pending = null; // { id, act } waiting for a second click to confirm
let pendingTimer = null;
let working = null; // PR id with a request in flight
let busy = false;
let loaded = false;

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

async function gh(path, opts) {
  const o = opts || {};
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: 'Bearer ' + token };
  const init = { headers };
  if (o.ttl) init.ttl = o.ttl;
  if (o.method) init.method = o.method;
  if (o.body) { init.body = JSON.stringify(o.body); headers['Content-Type'] = 'application/json'; }
  let res;
  try {
    res = await wd.fetch('https://api.github.com' + path, init);
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
    throw new Error('GitHub rate limit reached' + (mins ? ' (resets in ' + mins + ' min)' : '') + '. Try again later.');
  }
  if (res.status === 401) throw new Error('GitHub rejected the token. Check it in the widget settings.');
  throw new Error(msg ? msg : 'GitHub error ' + res.status);
}

function repoOf(pr) { return String(pr.repository_url || '').split('/repos/')[1] || ''; }

function showMessage(text, ok) {
  $('msg').innerHTML = text ? '<div class="' + (ok ? 'wg-ok' : 'wg-err') + '">' + esc(text) + '</div>' : '';
}

// Merge state badge from the PR detail (mergeable_state).
function stateBadge(pr, d) {
  if (pr.draft || (d && d.draft)) return '<span class="wg-badge">Draft</span>';
  if (!d) return '<span class="wg-badge">Checking…</span>';
  if (d.mergeable === false || d.mergeable_state === 'dirty') return '<span class="wg-badge bad">Conflicts</span>';
  switch (d.mergeable_state) {
    case 'clean': case 'has_hooks': return '<span class="wg-badge good">Ready to merge</span>';
    case 'behind': return '<span class="wg-badge warn">Behind base</span>';
    case 'unstable': return '<span class="wg-badge warn">Checks failing</span>';
    case 'blocked': return '<span class="wg-badge warn">Blocked</span>';
    default: return d.mergeable === null ? '<span class="wg-badge">Checking…</span>' : '';
  }
}

function button(pr, act, label, cls, disabled) {
  const isPending = pending && pending.id === pr.id && pending.act === act;
  const text = working === pr.id ? '…' : isPending ? 'Confirm?' : label;
  return '<button class="wg-btn sm ' + cls + (isPending ? ' confirm' : '') + '" data-act="' + act + '" data-id="' + pr.id + '"' +
    (disabled || working === pr.id ? ' disabled' : '') + '>' + text + '</button>';
}

function render() {
  const count = $('count');
  count.hidden = !loaded;
  count.textContent = total > prs.length ? prs.length + ' of ' + total : String(total);
  if (!prs.length) {
    $('list').innerHTML = '<div class="wg-empty">No open pull requests ' + esc(FILTERS[filter]) + '. 🎉</div>';
    return;
  }
  $('list').innerHTML = prs.map((pr) => {
    const d = details[pr.id];
    const isDraft = !!(pr.draft || (d && d.draft));
    const dotCls = isDraft ? '' : (d && (d.mergeable === false || d.mergeable_state === 'dirty')) ? 'bad' : (d && d.mergeable_state === 'clean') ? 'good' : 'warn';
    const diff = d && typeof d.additions === 'number'
      ? '<span class="pr-diff"><span class="a">+' + d.additions + '</span> <span class="d">−' + d.deletions + '</span></span>' : '';
    const noMerge = isDraft || !d || d.mergeable === false || d.mergeable_state === 'dirty';
    const actions =
      (isDraft && pr.node_id ? button(pr, 'ready', 'Ready', 'primary', false) : '') +
      button(pr, 'merge', 'Merge', 'primary', noMerge) +
      button(pr, 'close', 'Close', 'danger', false);
    return '<div class="wg-card pr">' +
      '<div class="pr-top"><span class="wg-dot ' + dotCls + '"></span>' +
      '<a class="pr-title no-drag" href="' + esc(pr.html_url) + '" title="' + esc(pr.title) + '">' + esc(pr.title) + '</a></div>' +
      '<div class="pr-meta wg-truncate">' + esc(repoOf(pr)) + '#' + pr.number + ' · ' + esc(pr.user && pr.user.login) + ' · ' + esc(ago(pr.updated_at || pr.created_at)) + '</div>' +
      '<div class="pr-foot"><div class="pr-badges">' + stateBadge(pr, d) + diff + '</div><div class="pr-actions">' + actions + '</div></div></div>';
  }).join('');
}

async function loadDetails(bypass) {
  const list = prs.slice(0, MAX_DETAILS);
  await Promise.all(list.map(async (pr) => {
    try {
      details[pr.id] = await gh('/repos/' + repoOf(pr) + '/pulls/' + pr.number, { ttl: bypass ? 0 : 60 });
    } catch (e) { /* the badge simply stays at "Checking" */ }
  }));
}

async function load(manual) {
  if (busy || !token) return;
  busy = true;
  $('refresh').classList.add('spin');
  try {
    const q = 'is:pr is:open ' + filter + ':@me';
    const data = await gh('/search/issues?q=' + encodeURIComponent(q) + '&sort=updated&order=desc&per_page=15', { ttl: manual ? 0 : 60 });
    prs = Array.isArray(data.items) ? data.items : [];
    total = data.total_count || prs.length;
    loaded = true;
    if (!manual || !$('msg').querySelector('.wg-ok')) showMessage('');
    render();
    await loadDetails(manual);
    render();
  } catch (e) {
    if (!loaded) $('list').innerHTML = '';
    showMessage(e.message);
  } finally {
    busy = false;
    $('refresh').classList.remove('spin');
  }
}

function clearPending() {
  pending = null;
  if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
}

async function perform(pr, act) {
  working = pr.id;
  render();
  const repo = repoOf(pr);
  try {
    if (act === 'merge') {
      await gh('/repos/' + repo + '/pulls/' + pr.number + '/merge', { method: 'PUT', body: { merge_method: mergeMethod } });
    } else if (act === 'close') {
      await gh('/repos/' + repo + '/pulls/' + pr.number, { method: 'PATCH', body: { state: 'closed' } });
    } else if (act === 'ready') {
      const out = await gh('/graphql', {
        method: 'POST',
        body: { query: 'mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{id}}}', variables: { id: pr.node_id } }
      });
      if (out.errors && out.errors.length) throw new Error(String(out.errors[0].message));
    }
    const done = { merge: 'Merged', close: 'Closed', ready: 'Marked ready:' }[act];
    working = null;
    delete details[pr.id];
    await load(true);
    showMessage(done + ' ' + repo + '#' + pr.number, true);
  } catch (e) {
    working = null;
    render();
    showMessage(e.message);
  }
}

$('list').addEventListener('click', (e) => {
  const link = e.target.closest('a.pr-title');
  if (link) { e.preventDefault(); wd.openExternal(link.getAttribute('href')); return; }
  const btn = e.target.closest('button[data-act]');
  if (!btn || working) return;
  const id = Number(btn.dataset.id);
  const act = btn.dataset.act;
  const pr = prs.find((p) => p.id === id);
  if (!pr) return;
  if (pending && pending.id === id && pending.act === act) {
    clearPending();
    perform(pr, act);
    return;
  }
  // First click only arms the button; a second click within 4 seconds runs it.
  clearPending();
  pending = { id, act };
  pendingTimer = setTimeout(() => { clearPending(); render(); }, 4000);
  render();
});
$('refresh').addEventListener('click', () => load(true));

async function init() {
  token = String((await wd.getConfig('github_token')) || '').trim();
  const f = await wd.getConfig('pr_filter');
  filter = FILTERS[f] ? f : 'involves';
  mergeMethod = ['squash', 'merge', 'rebase'].includes(await wd.getConfig('merge_method')) ? await wd.getConfig('merge_method') : 'squash';
  $('sub').textContent = FILTERS[filter];
  if (!token) {
    $('list').innerHTML = '<div class="wg-empty">Add a GitHub personal access token in the widget settings<br>to see your pull requests.</div>';
    return;
  }
  $('list').innerHTML = '<div class="wg-card"><div class="wg-skeleton" style="width:70%"></div><div class="wg-skeleton" style="width:45%;margin-top:8px"></div></div>';
  load(false);
  setInterval(() => load(false), 120000);
}

init();
