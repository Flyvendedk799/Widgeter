(async function () {
  const num = (v, fallback, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || fallback));
  const workMin = num(await widgeter.getConfig('pt_work'), 25, 1, 180);
  const shortMin = num(await widgeter.getConfig('pt_short'), 5, 1, 60);
  const longMin = num(await widgeter.getConfig('pt_long'), 15, 1, 90);
  const cycles = Math.round(num(await widgeter.getConfig('pt_cycles'), 4, 2, 8));
  const auto = !!(await widgeter.getConfig('pt_auto'));
  const saved = (await widgeter.getConfig('pt_state')) || {};

  const $ = (id) => document.getElementById(id);
  const ringEl = document.querySelector('.pt-ring');
  const arc = $('pt-arc');
  const CIRC = 2 * Math.PI * 65;
  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

  const LENGTH = { focus: workMin * 60000, short: shortMin * 60000, long: longMin * 60000 };
  const NAME = { focus: 'Focus session', short: 'Short break', long: 'Long break' };

  // Wall-clock state: a running phase stores the moment it ends, so the display is always
  // computed from Date.now() and survives hidden/asleep periods and widget reloads.
  let phase = LENGTH[saved.phase] ? saved.phase : 'focus';
  let running = !!saved.running && Number(saved.endsAt) > 0;
  let endsAt = running ? Number(saved.endsAt) : 0;
  let remaining = Number(saved.remaining) > 0 ? Number(saved.remaining) : LENGTH[phase];
  let cycle = Math.max(0, Math.floor(Number(saved.cycle) || 0)) % cycles;
  let done = saved.day === today() ? Math.max(0, Math.floor(Number(saved.done) || 0)) : 0;
  let wake = null;

  // If the durations changed in settings, an untouched phase picks up the new length.
  if (!running && saved.full && Number(saved.full) !== LENGTH[phase] && remaining === Number(saved.full)) remaining = LENGTH[phase];
  remaining = Math.min(remaining, LENGTH[phase]);

  function persist() {
    widgeter.setConfig('pt_state', { phase, running, endsAt, remaining, cycle, done, day: today(), full: LENGTH[phase] });
  }

  const left = () => (running ? Math.max(0, endsAt - Date.now()) : remaining);

  function draw() {
    const ms = left();
    const secs = Math.ceil(ms / 1000);
    $('pt-time').textContent = pad(Math.floor(secs / 60)) + ':' + pad(secs % 60);
    const progress = 1 - ms / LENGTH[phase];
    const p = Math.max(0, Math.min(1, progress));
    arc.style.strokeDashoffset = String(CIRC * (1 - p));
    arc.style.opacity = p < 0.002 ? '0' : '1';
    ringEl.classList.toggle('break', phase !== 'focus');
    $('pt-mode').textContent = NAME[phase];
    $('pt-sub').textContent = running ? (phase === 'focus' ? 'Stay focused' : 'Take a break') : (ms < LENGTH[phase] ? 'Paused' : 'Ready');
    $('pt-cnt').textContent = done + ' today';
    $('pt-start').textContent = running ? '⏸ Pause' : (ms < LENGTH[phase] ? '▶ Resume' : '▶ Start');
    // Dots show focus sessions finished in the current set (a full set means a long break is due).
    const filled = phase === 'long' ? cycles : cycle;
    let dots = '';
    for (let i = 0; i < cycles; i++) dots += '<span class="pt-dot' + (i < filled ? ' on' : '') + '"></span>';
    $('pt-dots').innerHTML = dots;
  }

  function schedule() {
    clearTimeout(wake);
    // setTimeout is not paused with the intervals, so the notification is on time even while hidden.
    if (running) wake = setTimeout(check, Math.max(50, endsAt - Date.now() + 30));
  }

  function enter(next, startNow) {
    phase = next;
    remaining = LENGTH[next];
    running = !!startNow;
    endsAt = running ? Date.now() + remaining : 0;
    schedule(); persist(); draw();
  }

  function finish() {
    if (phase === 'focus') {
      done++;
      cycle = (cycle + 1) % cycles;
      const next = cycle === 0 ? 'long' : 'short';
      widgeter.notify('Focus session complete', 'Time for a ' + Math.round(LENGTH[next] / 60000) + ' minute ' + (next === 'long' ? 'long' : 'short') + ' break.');
      enter(next, auto);
    } else {
      widgeter.notify('Break is over', 'Ready for the next focus session.');
      enter('focus', auto);
    }
  }

  function check() {
    if (running && Date.now() >= endsAt) finish();
    else draw();
  }

  $('pt-start').addEventListener('click', () => {
    if (running) { remaining = Math.max(1, endsAt - Date.now()); running = false; endsAt = 0; }
    else { running = true; endsAt = Date.now() + remaining; }
    schedule(); persist(); draw();
  });
  $('pt-reset').addEventListener('click', () => { cycle = 0; enter('focus', false); });
  $('pt-skip').addEventListener('click', () => {
    // Skipping never counts as a finished session.
    enter(phase === 'focus' ? 'short' : 'focus', false);
  });

  if (running && Date.now() >= endsAt) finish(); // finished while the widget was not running
  else { schedule(); draw(); }
  setInterval(check, 250);
})();
