/* 渲染器：画布布局、网格、细胞、角色白色光环、部署范围与冷却指示 */
class Renderer {
  constructor(p) {
    this.p = p;
    this.layout = { cell: 0, ox: 0, oy: 0 };
  }

  /* 网格居中放在 HUD 上下留白之间，随屏幕尺寸自适应 */
  resize(w, h, top, bottom) {
    const availW = w;
    const availH = h - top - bottom;
    const cell = Math.max(6, Math.floor(Math.min(availW / CONFIG.GRID_W, availH / CONFIG.GRID_H)));
    this.layout = {
      cell,
      ox: Math.floor((w - cell * CONFIG.GRID_W) / 2),
      oy: Math.floor(top + (availH - cell * CONFIG.GRID_H) / 2),
    };
  }

  cellCenter(x, y) {
    const l = this.layout;
    return { x: l.ox + x * l.cell + l.cell / 2, y: l.oy + y * l.cell + l.cell / 2 };
  }

  screenToCell(px, py) {
    const l = this.layout;
    const x = Math.floor((px - l.ox) / l.cell);
    const y = Math.floor((py - l.oy) / l.cell);
    return { x, y, valid: x >= 0 && y >= 0 && x < CONFIG.GRID_W && y < CONFIG.GRID_H };
  }

  draw(p, game, now) {
    p.background(CONFIG.COLORS.bg);
    const l = this.layout;
    const c = l.cell;
    const grid = game.grid;

    // 网格线
    p.stroke(CONFIG.COLORS.gridLine);
    p.strokeWeight(1);
    for (let x = 0; x <= CONFIG.GRID_W; x++) {
      p.line(l.ox + x * c, l.oy, l.ox + x * c, l.oy + CONFIG.GRID_H * c);
    }
    for (let y = 0; y <= CONFIG.GRID_H; y++) {
      p.line(l.ox, l.oy + y * c, l.ox + CONFIG.GRID_W * c, l.oy + y * c);
    }

    // 可行动方范围提示
    const hint = this.actionablePlayer(game, now);
    if (hint) this.drawRange(p, game, hint);

    // 细胞
    for (let y = 0; y < CONFIG.GRID_H; y++) {
      for (let x = 0; x < CONFIG.GRID_W; x++) {
        const v = grid.get(x, y);
        if (v === CONFIG.CELL_DEAD) continue;
        const isChar = grid.isChar(v);
        const col = (v === CONFIG.CELL_RED || v === CONFIG.CELL_RED_CHAR)
          ? CONFIG.COLORS.red : CONFIG.COLORS.blue;
        if (isChar) this.drawCharacter(p, x, y, col, now);
        else this.drawCell(p, x, y, col, grid, game);
      }
    }

    // 冷却圆弧
    for (const pl of [game.red, game.blue]) {
      if (pl.charAlive) this.drawCooldown(p, pl, now);
    }
  }

  /* 当前允许人类行动的一方（用于显示部署范围） */
  actionablePlayer(game, now) {
    if (game.status !== 'playing') return null;
    if (game.mode === 'watch') return null;
    if (game.mode === 'pve') return game.red.ready(now) ? game.red : null;
    const p = game.active === 'red' ? game.red : game.blue;
    return p.ready(now) ? p : null;
  }

  drawRange(p, game, player) {
    const c = this.layout.cell;
    const cc = this.cellCenter(player.charX, player.charY);
    const tint = player.color === 'red' ? 'rgba(255,59,48,' : 'rgba(46,139,255,';

    // 可部署空格微亮
    p.noStroke();
    p.fill(tint + '0.10)');
    for (let y = 0; y < CONFIG.GRID_H; y++) {
      for (let x = 0; x < CONFIG.GRID_W; x++) {
        if (game.grid.get(x, y) !== CONFIG.CELL_DEAD) continue;
        if (!player.inRange(x, y)) continue;
        p.rect(this.layout.ox + x * c + 1, this.layout.oy + y * c + 1, c - 2, c - 2);
      }
    }

    // 部署半径虚线圆
    p.noFill();
    p.stroke(tint + '0.45)');
    p.strokeWeight(1.5);
    p.drawingContext.setLineDash([5, 5]);
    p.circle(cc.x, cc.y, c * (CONFIG.DEPLOY_RANGE * 2 + 1));
    p.drawingContext.setLineDash([]);
  }

  drawCell(p, x, y, col, grid, game) {
    const c = this.layout.cell;
    const l = this.layout;
    const pad = c * 0.13;
    const px = l.ox + x * c + pad;
    const py = l.oy + y * c + pad;
    const size = c - pad * 2;

    p.noStroke();
    p.fill(col);
    p.rect(px, py, size, size, c * 0.16);

    // 保护期描边（刚部署的细胞有白色细边）
    const age = game.gen - grid.bornAt[grid.idx(x, y)];
    if (age < CONFIG.PROTECT_GENS) {
      p.noFill();
      p.stroke('rgba(255,255,255,0.85)');
      p.strokeWeight(Math.max(1.5, c * 0.06));
      p.rect(px, py, size, size, c * 0.16);
    }
  }

  /* 角色：光晕 + 本体 + 白色光环（独特标志，带呼吸脉动） */
  drawCharacter(p, x, y, col, now) {
    const c = this.layout.cell;
    const cc = this.cellCenter(x, y);
    const r = c * 0.42;
    const pulse = 1 + 0.06 * Math.sin(now / 280);

    p.noStroke();
    p.fill(this.alpha(col, 0.22));
    p.circle(cc.x, cc.y, r * 2 * 1.75);

    p.fill(col);
    p.circle(cc.x, cc.y, r * 2 * pulse);

    p.noFill();
    p.stroke(CONFIG.COLORS.ring);
    p.strokeWeight(Math.max(2, c * 0.1));
    p.circle(cc.x, cc.y, r * 2 * pulse + c * 0.2);
    p.strokeWeight(Math.max(1, c * 0.05));
    p.stroke(this.alpha(CONFIG.COLORS.ring, 0.35));
    p.circle(cc.x, cc.y, r * 2 * pulse + c * 0.42);
  }

  /* 冷却指示：角色周围剩余冷却圆弧 */
  drawCooldown(p, player, now) {
    if (player.ready(now)) return;
    const cc = this.cellCenter(player.charX, player.charY);
    const frac = Math.max(0, Math.min(1, (player.nextActionAt - now) / CONFIG.ACTION_COOLDOWN_MS));
    const d = this.layout.cell * 0.95;
    p.noFill();
    p.stroke(player.color === 'red' ? 'rgba(255,59,48,0.8)' : 'rgba(46,139,255,0.8)');
    p.strokeWeight(2.5);
    p.arc(cc.x, cc.y, d, d, -p.HALF_PI, -p.HALF_PI + p.TWO_PI * (1 - frac));
  }

  /* #rrggbb → rgba() */
  alpha(hex, a) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
}
