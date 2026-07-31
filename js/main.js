/* 入口：p5 实例模式，接线输入（点击部署 / 滑动移动）、渲染与 UI */
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

  /* ---------- p5 草图 ---------- */
  const sketch = (p) => {
    p.setup = () => {
      p.createCanvas(window.innerWidth, window.innerHeight);
      p.frameRate(60);
      renderer = new Renderer(p);
      layout();
    };

    function layout() {
      if (!renderer) return;
      p.resizeCanvas(window.innerWidth, window.innerHeight);
      renderer.resize(p.width, p.height, HUD_TOP, HUD_BOTTOM);
    }

    p.windowResized = layout;

    p.draw = () => {
      const now = p.millis();
      if (!game) return;
      game.tick(now);
      renderer.draw(p, game, now);
      updateHUD(now);
      if (game.status === 'over' && !overShown) showOver();
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
          if (game.deploy(player, cell.x, cell.y, now)) flashHint('✅ ' + player.name + ' 已部署');
          else flashHint('❌ 不能部署在那里');
        }
      } else {
        // 滑动 → 移动一格
        const mx = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0;
        const my = Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0;
        if (game.move(player, player.charX + mx, player.charY + my, now)) {
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

  new p5(sketch);

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
    $('winner-text').textContent = text;
    $('over-screen').hidden = false;
  }

  /* ---------- 模式切换 / 按钮 ---------- */
  window.startGame = function (mode) {
    lastMode = mode;
    game = new Game(mode);
    if (mode === 'watch') game.red.ai = new AI(game, game.red);
    if (mode !== 'pvp') game.blue.ai = new AI(game, game.blue);
    overShown = false;

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
})();
