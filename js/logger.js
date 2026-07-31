/* 浏览器端详细日志系统
 * 目标：把手机浏览器里发生的一切（错误、点击、触摸、初始化、游戏事件）实时上报到
 * 本地服务器 logs/browser.log，供开发者直接读取定位问题。
 *
 * 通道：POST /api/log（fetch keepalive → sendBeacon → Image 兜底）
 * 兜底：上报失败时日志存入 localStorage，并显示屏幕右下角「📋」日志面板（可复制）。
 */
(function () {
  'use strict';

  var SESSION = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  var MAX_BUFFER = 600;
  var FLUSH_INTERVAL = 2000;
  var buffer = [];
  var lastFlush = 0;
  var lastTouchAt = 0;

  function ts() { return new Date().toISOString(); }

  function push(level, event, details) {
    try {
      buffer.push({ t: ts(), s: SESSION, lv: level, ev: event, d: details === undefined ? null : details });
    } catch (e) { return; }
    if (buffer.length > MAX_BUFFER) buffer.shift();
    if (level === 'error') flush(true);
  }

  /* ---------- 上报（三级兜底） ---------- */
  function post(url, payload) {
    try {
      if (typeof fetch === 'function') {
        fetch(url, {
          method: 'POST', keepalive: true, body: payload,
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        }).catch(function () {});
        return true;
      }
    } catch (e) {}
    try {
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        return navigator.sendBeacon(url, payload);
      }
    } catch (e) {}
    try {
      var img = new Image();
      img.src = url + '?m=' + encodeURIComponent(payload.slice(0, 1500));
      return true;
    } catch (e) {}
    return false;
  }

  function flush(force) {
    if (!buffer.length) return;
    var nowMs = Date.now();
    if (!force && nowMs - lastFlush < FLUSH_INTERVAL) return;
    lastFlush = nowMs;
    var batch = buffer.splice(0, buffer.length);
    var payload = JSON.stringify(batch);
    var ok = post('/api/log', payload);
    if (!ok) {
      // 上报失败（如 file:// 或沙箱预览）→ 存入 localStorage 供日志面板读取
      try {
        var old = JSON.parse(localStorage.getItem('gol_log') || '[]');
        localStorage.setItem('gol_log', JSON.stringify(old.concat(batch).slice(-MAX_BUFFER)));
      } catch (e) {}
    }
  }
  setInterval(function () { flush(false); }, FLUSH_INTERVAL);
  window.addEventListener('beforeunload', function () { flush(true); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush(true);
  });

  /* ---------- 全局错误（含资源加载失败，capture 阶段） ---------- */
  window.addEventListener('error', function (e) {
    if (e && e.target && e.target !== window && e.target.tagName) {
      push('error', 'resource_fail', { tag: e.target.tagName, src: e.target.src || e.target.href || '' });
    } else {
      push('error', 'window_error', {
        msg: (e && e.message) || '', file: (e && e.filename) || '',
        line: e && e.lineno, col: e && e.colno,
        stack: (e && e.error && e.error.stack) || '',
      });
    }
  }, true);

  window.addEventListener('unhandledrejection', function (e) {
    push('error', 'promise_reject', {
      msg: String((e && e.reason) || ''),
      stack: (e && e.reason && e.reason.stack) || '',
    });
  });

  /* ---------- console 拦截 ---------- */
  try {
    ['error', 'warn'].forEach(function (lv) {
      var orig = console[lv];
      console[lv] = function () {
        var args = Array.prototype.slice.call(arguments);
        push(lv, 'console', args.map(String).join(' '));
        orig.apply(console, args);
      };
    });
  } catch (e) {}

  /* ---------- 环境信息 ---------- */
  push('info', 'boot', {
    ua: navigator.userAgent || '',
    lang: navigator.language || '',
    screen: (window.screen ? screen.width + 'x' + screen.height : '?') + ' dpr=' + (window.devicePixelRatio || 1),
    viewport: window.innerWidth + 'x' + window.innerHeight,
    href: location.href,
    readyState: document.readyState,
  });

  window.addEventListener('DOMContentLoaded', function () { push('info', 'dom_ready', {}); });
  window.addEventListener('load', function () {
    push('info', 'window_load', {});
    try {
      var res = performance.getEntriesByType('resource').map(function (r) {
        return { n: String(r.name).split('/').pop(), ms: r.duration ? Math.round(r.duration) : 0 };
      });
      push('info', 'resources', res);
    } catch (e) {}
  });

  /* ---------- 点击 / 触摸全记录（判断按钮是否真的收到事件） ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target;
    push('info', 'click', {
      tag: t && t.tagName, id: t && t.id,
      cls: t && t.className ? String(t.className).slice(0, 60) : '',
      text: t && t.textContent ? t.textContent.trim().slice(0, 20) : '',
    });
  }, true);

  document.addEventListener('touchstart', function (e) {
    var nowMs = Date.now();
    if (nowMs - lastTouchAt < 300) return; // 节流，避免刷屏
    lastTouchAt = nowMs;
    var t = e.changedTouches && e.changedTouches[0];
    push('info', 'touch', t ? { x: Math.round(t.clientX), y: Math.round(t.clientY) } : {});
  }, true);

  /* ---------- 屏幕日志面板（上报失败时兜底，可复制日志） ---------- */
  function ensurePanel() {
    if (document.getElementById('gol-panel')) return;
    var btn = document.createElement('button');
    btn.id = 'gol-btn';
    btn.textContent = '📋';
    btn.title = '查看诊断日志';
    btn.style.cssText = 'position:fixed;right:10px;bottom:64px;z-index:99998;width:42px;height:42px;' +
      'border-radius:50%;border:none;background:rgba(255,255,255,0.16);color:#fff;font-size:18px;cursor:pointer;';

    var panel = document.createElement('div');
    panel.id = 'gol-panel';
    panel.hidden = true;
    panel.style.cssText = 'position:fixed;left:0;right:0;top:0;bottom:0;z-index:99999;' +
      'background:rgba(8,10,14,0.97);color:#e6e6e6;font:11px/1.5 monospace;' +
      'padding:14px;overflow:auto;white-space:pre-wrap;word-break:break-all;';

    var head = document.createElement('div');
    head.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;';
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '✕ 关闭';
    closeBtn.style.cssText = 'flex:none;padding:6px 12px;border-radius:8px;border:none;background:#c62828;color:#fff;';
    var copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 复制日志';
    copyBtn.style.cssText = 'flex:none;padding:6px 12px;border-radius:8px;border:none;background:#fff;color:#111;';
    var pre = document.createElement('pre');
    pre.style.cssText = 'margin:0;';
    head.appendChild(closeBtn);
    head.appendChild(copyBtn);
    panel.appendChild(head);
    panel.appendChild(pre);
    document.body.appendChild(btn);
    document.body.appendChild(panel);

    function render() {
      var all = [];
      try { all = all.concat(JSON.parse(localStorage.getItem('gol_log') || '[]')); } catch (e) {}
      all = all.concat(buffer);
      pre.textContent = all.map(function (x) {
        return '[' + x.t + '] ' + x.lv + ' ' + x.ev + ' ' + JSON.stringify(x.d);
      }).join('\n');
    }
    btn.addEventListener('click', function () { render(); panel.hidden = false; });
    closeBtn.addEventListener('click', function () { panel.hidden = true; });
    copyBtn.addEventListener('click', function () {
      var txt = pre.textContent;
      try { navigator.clipboard.writeText(txt); } catch (e) {
        var ta = document.createElement('textarea');
        ta.value = txt;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e2) {}
        document.body.removeChild(ta);
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensurePanel);
  } else {
    ensurePanel();
  }

  /* ---------- 对外接口 ---------- */
  window.GOLog = {
    info: function (ev, d) { push('info', ev, d); },
    warn: function (ev, d) { push('warn', ev, d); },
    error: function (ev, d) { push('error', ev, d); },
  };
})();
