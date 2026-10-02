// Runs inside every widget window before the widget's own script.
//  - forwards uncaught errors and unhandled rejections to the engine log
//  - lets the engine pause polling while the widget is hidden or the PC is asleep
//    (setInterval callbacks are skipped while paused, and run once on resume)
(function () {
  var paused = false;
  var timers = Object.create(null);
  var nativeSet = window.setInterval.bind(window);
  var nativeClear = window.clearInterval.bind(window);
  var listeners = [];

  function log(level, message, extra) {
    try {
      if (window.widgeter && window.widgeter.log) window.widgeter.log(level, message, extra);
    } catch (e) { /* logging must never throw */ }
  }

  window.addEventListener('error', function (e) {
    var where = e.filename ? ' (' + String(e.filename).split(/[\\/]/).pop() + ':' + e.lineno + ')' : '';
    log('error', (e.message || 'Script error') + where, e.error && e.error.stack);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    log('error', 'Unhandled promise rejection: ' + (r && r.message ? r.message : String(r)), r && r.stack);
  });

  window.setInterval = function (fn, ms) {
    if (typeof fn !== 'function') return nativeSet.apply(window, arguments);
    var args = Array.prototype.slice.call(arguments, 2);
    var id = nativeSet(function () {
      if (!paused) fn.apply(window, args);
    }, ms);
    timers[id] = { fn: fn, args: args };
    return id;
  };
  window.clearInterval = function (id) {
    delete timers[id];
    return nativeClear(id);
  };

  function setPaused(next) {
    next = !!next;
    if (next === paused) return;
    paused = next;
    document.documentElement.classList.toggle('widgeter-paused', paused);
    if (!paused) {
      // Catch up once instead of replaying every missed tick.
      Object.keys(timers).forEach(function (id) {
        var t = timers[id];
        if (t) { try { t.fn.apply(window, t.args); } catch (err) { log('error', err.message, err.stack); } }
      });
    }
    listeners.slice().forEach(function (cb) { try { cb(!paused); } catch (err) { log('error', err.message, err.stack); } });
  }

  window.__widgeterRuntime = {
    setPaused: setPaused,
    isPaused: function () { return paused; },
    onVisible: function (cb) { listeners.push(cb); return function () { listeners = listeners.filter(function (l) { return l !== cb; }); }; }
  };
})();
