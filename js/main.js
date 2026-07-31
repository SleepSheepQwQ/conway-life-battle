/* 入口：p5 实例模式，接线输入（点击部署 / 滑动移动）、渲染与 UI
 * 初始化顺序：错误横幅（最先）→ 按钮与全局函数（不依赖 p5，保证始终可点）→ p5 启动
 */
(function () {
  'use strict';

  let game = null;
  let renderer = null;
  let lastMode = 'pve';
  let touchStart = null;
  let lastMove = null;
  let overShown = false;
  let hintTimer = null;
  let hintBase = '';

  const HUD_TOP = 56;      // 顶部 HUD 留白
  const HUD_BOTTOM = 72;   // 底部提示条留白

  const $ = (id) => document.getElementById(id);

  /* 诊断埋点（logger.js 提供，缺失时静默降级） */
  const L = (ev, d) => { try { if (window.GOLog) window.GOLog.info(ev, d); } catch (e) {} };
  L('main_loaded', {});

  /* ---------- 1. 错误横幅（最先注册，任何后续错误都能在屏幕上看到） ---------- */
  function showBootError(msg) {
    let el = document.getElementById('boot-error');
    if (!el) {
      el = document.createElement('div');
      el.id = 'boot-error';
      el.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99999;' +
        'background:#c62828;color:#fff;font:12px/1.5 monospace;padding:10px 14px;' +
        'white-space:pre-wrap;word-break:break-all;cursor:pointer;';
      el.addEventListener('click', () => el.remove());
      document.body.appendChild(el);
    }
    el.textContent = '⚠️ 脚本错误: ' + msg + '（点击此条关闭）';
  }

  window.addEventListener('error', (e) => {
    showBootError((e.message || '未知错误') + ' @ ' + (e.filename || '') + ':' + (e.lineno || ''));
  });
  window.addEventListener('unhandledrejection', (e) => {
    showBootError('Promise 异常: ' + ((e.reason && e.reason.message) || e.reason));
  });

  /* ---------- 2. 模式切换与按钮（不依赖 p5，先定义保证可点） ---------- */
  window.startGame = function (mode) {
    L('start_game', { mode });
    lastMode = mode;
    game = new Game(mode);
    if (mode === 'watch') game.red.ai = new AI(game, game.red);
    if (mode !== 'pvp') game.blue.ai = new AI(game, game.blue);
    overShown = false;
    L('game_created', { mode, status: game.status });

    hintBase = mode === 'watch' ? 'AI 自动对战' : '点击空白格部署 · 滑动移动角色';
    $('hint-text').textContent = hintBase;
    $('start-screen').hidden = true;
    $('over-screen').hidden = true;
    $('pvp-bar').hidden = mode !== 'pvp';
    $('hint-bar').style.visibility = mode === 'pvp' ? 'hidden' : 'visible';
  };

  window.restart = function () { startGame(lastMode); };

  window.goHome = function () {
    game = null;
    $('over-screen').hidden = true;
    $('start-screen').hidden = false;
  };

  $('btn-restart').addEventListener('click', () => {
    if (game) startGame(lastMode);
  });
  $('btn-red').addEventListener('click', () => {
    if (game && game.mode === 'pvp') game.active = 'red';
  });
  $('btn-blue').addEventListener('click', () => {
    if (game && game.mode === 'pvp') game.active = 'blue';
  });

  // 长按不弹菜单
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------- HUD ---------- */
  function updateHUD(now) {
    if (!game) return;
    const s = game.scores();
    setText('score-red', s.red);
    setText('score-blue', s.blue);

    const cd = (pl) => {
      if (!pl.charAlive) return 0;
      return Math.max(0, Math.min(1, 1 - (pl.nextActionAt - now) / CONFIG.ACTION_COOLDOWN_MS));
    };
    $('cd-red').style.width = (cd(game.red) * 100).toFixed(0) + '%';
    $('cd-blue').style.width = (cd(game.blue) * 100).toFixed(0) + '%';

    let turn = '👀 观战中';
    if (game.mode === 'pvp') turn = game.active === 'red' ? '🔴 红方行动' : '🔵 蓝方行动';
    else if (game.mode === 'pve') turn = '你是 🔴 红方';
    setText('turn-info', turn);

    if (game.mode === 'pvp') {
      $('btn-red').classList.toggle('active', game.active === 'red');
      $('btn-blue').classList.toggle('active', game.active === 'blue');
    }
  }

  function setText(id, v) {
    const el = $(id);
    if (el && el.textContent !== String(v)) el.textContent = String(v);
  }

  function flashHint(msg) {
    if (hintTimer) clearTimeout(hintTimer);
    $('hint-text').textContent = msg;
    hintTimer = setTimeout(() => { $('hint-text').textContent = hintBase; }, 1200);
  }

  function showOver() {
    overShown = true;
    let text = '';
    if (game.winner === 'red') text = '🔴 红方获胜！';
    else if (game.winner === 'blue') text = '🔵 蓝方获胜！';
    else text = '🤝 同归于尽，平局';
    L('game_over', { winner: game.winner, red: game.scores().red, blue: game.scores().blue });
    $('winner-text').textContent = text;
    $('over-screen').hidden = false;
  }

  /* ---------- 3. p5 草图 ---------- */
  const sketch = (p) => {
    p.setup = () => {
      p.createCanvas(window.innerWidth, window.innerHeight);
      p.frameRate(60);
      renderer = new Renderer(p);
      layout();
      L('p5_setup', { w: p.width, h: p.height, cell: renderer.layout.cell });
    };

    function layout() {
      if (!renderer) return;
      p.resizeCanvas(window.innerWidth, window.innerHeight);
      renderer.resize(p.width, p.height, HUD_TOP, HUD_BOTTOM);
    }

    p.windowResized = layout;

    let frameCount = 0;

    p.draw = () => {
      frameCount++;
      const now = p.millis();
      if (!game) return;
      game.tick(now);
      renderer.draw(p, game, now);
      updateHUD(now);
      if (game.status === 'over' && !overShown) showOver();
      if (frameCount <= 5) L('frame', { n: frameCount });
    };

    /* —— 触摸输入 —— */
    p.touchStarted = (e) => {
      if (!game || game.status !== 'playing' || game.mode === 'watch') return false;
      const t = (e && e.touches && e.touches[0]) || { clientX: p.mouseX, clientY: p.mouseY };
      touchStart = { x: t.clientX, y: t.clientY };
      lastMove = { ...touchStart };
      return false;
    };

    p.touchMoved = (e) => {
      const t = e && e.touches && e.touches[0];
      if (t) lastMove = { x: t.clientX, y: t.clientY };
      return false;
    };

    p.touchEnded = () => { resolveGesture(); return false; };

    /* —— 鼠标输入（桌面调试） —— */
    p.mousePressed = () => {
      if (!game || game.status !== 'playing' || game.mode === 'watch') return false;
      touchStart = { x: p.mouseX, y: p.mouseY };
      lastMove = { ...touchStart };
      return false;
    };

    p.mouseReleased = () => { resolveGesture(); return false; };

    function resolveGesture() {
      if (!touchStart || !game || game.status !== 'playing' || game.mode === 'watch') {
        touchStart = null;
        return;
      }
      const end = lastMove || touchStart;
      const dx = end.x - touchStart.x;
      const dy = end.y - touchStart.y;
      const player = activeHuman();
      if (!player) { touchStart = null; return; }

      const rect = p.canvas.getBoundingClientRect();
      const sx = end.x - rect.left;
      const sy = end.y - rect.top;
      const now = p.millis();

      if (Math.hypot(dx, dy) < 14) {
        // 点击 → 部署
        const cell = renderer.screenToCell(sx, sy);
        if (cell.valid) {
          const ok = game.deploy(player, cell.x, cell.y, now);
          L('action', { type: 'deploy', x: cell.x, y: cell.y, ok, mode: game.mode });
          if (ok) flashHint('✅ ' + player.name + ' 已部署');
          else flashHint('❌ 不能部署在那里');
        }
      } else {
        // 滑动 → 移动一格
        const mx = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0;
        const my = Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0;
        const tx = player.charX + mx;
        const ty = player.charY + my;
        const ok = game.move(player, tx, ty, now);
        L('action', { type: 'move', x: tx, y: ty, ok, mode: game.mode });
        if (ok) {
          flashHint('🚶 ' + player.name + ' 移动一格');
        } else {
          flashHint('❌ 不能移动');
        }
      }
      touchStart = null;
    }

    function activeHuman() {
      if (game.mode === 'pve') return game.red;
      if (game.mode === 'pvp') return game.active === 'red' ? game.red : game.blue;
      return null;
    }
  };

  /* ---------- 4. p5 启动（失败时显示可见错误并上报日志） ---------- */
  if (typeof p5 === 'undefined') {
    L('p5_init', { ok: false, reason: 'p5 undefined' });
    showBootError('p5.js 未能加载（请检查 js/lib/p5.min.js 是否存在）');
  } else {
    L('p5_init', { ok: true, version: (p5 && p5.VERSION) || '?' });
    try {
      new p5(sketch);
      L('p5_started', {});
    } catch (err) {
      L('p5_init', { ok: false, error: String((err && err.stack) || err) });
      showBootError('游戏初始化失败: ' + ((err && err.message) || err));
    }
  }
})();
