(function () {
  var GRIP_ID = 'widgeter-resize-grip';
  var display = window.__widgeterDisplay || { enabled: false, minWidth: 160, maxWidth: 800, minHeight: 80, maxHeight: 900 };
  var enabled = !!display.enabled;
  var lastSentW = 0;
  var lastSentH = 0;
  var timer = null;
  var dragging = false;

  function viewHeight() {
    return window.innerHeight || document.documentElement.clientHeight || 0;
  }

  function clearViewportLocks() {
    var tweaks = [];
    var nodes = document.querySelectorAll('html, body, body *');
    var viewH = viewHeight();
    var planned = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.id === GRIP_ID) continue;
      var cs = getComputedStyle(el);
      var minH = parseFloat(cs.minHeight) || 0;
      var h = parseFloat(cs.height) || 0;
      var locksMin = viewH > 0 && minH >= viewH - 4;
      var locksHeight = viewH > 0 && Math.abs(h - viewH) <= 2 && el.scrollHeight <= viewH + 8 && el.children.length > 0;
      if (locksMin || locksHeight) planned.push(el);
    }
    for (var j = 0; j < planned.length; j++) {
      var node = planned[j];
      tweaks.push({ el: node, minHeight: node.style.minHeight, height: node.style.height });
      node.style.minHeight = '0px';
      node.style.height = 'auto';
    }
    return tweaks;
  }

  function restore(tweaks) {
    for (var i = 0; i < tweaks.length; i++) {
      tweaks[i].el.style.minHeight = tweaks[i].minHeight;
      tweaks[i].el.style.height = tweaks[i].height;
    }
  }

  function measure() {
    var tweaks = clearViewportLocks();
    var body = document.body;
    var bcs = getComputedStyle(body);
    var height = Math.max(body.scrollHeight, body.offsetHeight);
    var width = Math.max(body.scrollWidth, body.offsetWidth);
    height += (parseFloat(bcs.borderTopWidth) || 0) + (parseFloat(bcs.borderBottomWidth) || 0);
    height += (parseFloat(bcs.marginTop) || 0) + (parseFloat(bcs.marginBottom) || 0);
    width += (parseFloat(bcs.borderLeftWidth) || 0) + (parseFloat(bcs.borderRightWidth) || 0);
    width += (parseFloat(bcs.marginLeft) || 0) + (parseFloat(bcs.marginRight) || 0);
    restore(tweaks);
    return { width: Math.ceil(width), height: Math.ceil(height) + 2 };
  }

  window.__widgeterMeasure = measure;

  function send() {
    if (!enabled || dragging) return;
    if (!window.widgeter || !window.widgeter.autoResize) return;
    var m = measure();
    if (m.width < 40 || m.height < 40) return;
    if (Math.abs(m.width - lastSentW) < 2 && Math.abs(m.height - lastSentH) < 2) return;
    lastSentW = m.width;
    lastSentH = m.height;
    window.widgeter.autoResize(m.width, m.height);
  }

  function schedule() {
    if (!enabled) return;
    clearTimeout(timer);
    timer = setTimeout(send, 60);
  }

  function syncClass() {
    document.documentElement.classList.toggle('widgeter-smart', enabled);
  }

  function ensureGrip() {
    var grip = document.getElementById(GRIP_ID);
    if (grip) return grip;
    grip = document.createElement('div');
    grip.id = GRIP_ID;
    grip.title = 'Drag to resize. Smart mode changes width and refits the height.';
    document.body.appendChild(grip);

    var startX = 0;
    var startY = 0;
    var startW = 0;
    var startH = 0;

    grip.addEventListener('mousedown', function (e) {
      dragging = true;
      startX = e.screenX;
      startY = e.screenY;
      startW = window.innerWidth;
      startH = window.innerHeight;
      e.preventDefault();
      e.stopPropagation();
    });

    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var minW = display.minWidth || 80;
      var minH = display.minHeight || 50;
      var w = Math.max(minW, startW + (e.screenX - startX));
      var h = Math.max(minH, startH + (e.screenY - startY));
      if (window.widgeter && window.widgeter.userResize) {
        window.widgeter.userResize({ width: Math.round(w), height: Math.round(h), done: false });
      }
    });

    window.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      if (window.widgeter && window.widgeter.userResize) {
        window.widgeter.userResize({
          width: window.innerWidth,
          height: window.innerHeight,
          done: true
        });
      }
      lastSentW = 0;
      lastSentH = 0;
      if (enabled) schedule();
    });

    return grip;
  }

  function applyMode(next) {
    if (next && typeof next === 'object') {
      enabled = !!next.enabled;
      display = Object.assign({}, display, next);
    } else {
      enabled = !!next;
    }
    display.enabled = enabled;
    syncClass();
    ensureGrip();
    lastSentW = 0;
    lastSentH = 0;
    if (enabled) schedule();
  }

  function boot() {
    ensureGrip();
    syncClass();
    if (window.widgeter && window.widgeter.onResizeMode) {
      window.widgeter.onResizeMode(applyMode);
    }
    var mo = new MutationObserver(function () { schedule(); });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener('load', schedule);
    schedule();
  }

  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
