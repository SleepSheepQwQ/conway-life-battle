/* 游戏主逻辑：部署、移动、战斗判定、胜负
 * 模式：'pvp' 双人热座 | 'pve' 人机（红方为人类） | 'watch' 观战（双 AI）
 */
class Game {
  constructor(mode) {
    this.mode = mode;
    this.grid = new Grid(CONFIG.GRID_W, CONFIG.GRID_H);

    this.red = new Player({ color: 'red', name: '红方', isAI: mode === 'watch' });
    this.blue = new Player({ color: 'blue', name: '蓝方', isAI: mode !== 'pvp' });

    this.status = 'playing';   // 'playing' | 'over'
    this.winner = null;        // 'red' | 'blue' | 'draw'
    this.active = 'red';       // 热座模式下当前行动方
    this.gen = 0;
    this.lastStepAt = 0;

    this.placeCharacters();
  }

  opponentOf(p) { return p === this.red ? this.blue : this.red; }

  /* 对角开局：红左上、蓝右下 */
  placeCharacters() {
    const r = CONFIG.CHAR_START;
    const b = { x: CONFIG.GRID_W - 3, y: CONFIG.GRID_H - 3 };
    this.red.charX = r.x; this.red.charY = r.y;
    this.blue.charX = b.x; this.blue.charY = b.y;
    this.grid.set(r.x, r.y, CONFIG.CELL_RED_CHAR, 0);
    this.grid.set(b.x, b.y, CONFIG.CELL_BLUE_CHAR, 0);
  }

  /* 主循环：按节奏演化一代；AI 到点自动行动 */
  tick(now) {
    if (this.status !== 'playing') return;

    if (now - this.lastStepAt >= CONFIG.GEN_INTERVAL_MS) {
      this.lastStepAt = now;
      this.gen++;
      this.grid.step(this.gen);
      this.checkCombat();
    }

    if (this.red.isAI && this.red.ai) this.red.ai.act(now);
    if (this.blue.isAI && this.blue.ai) this.blue.ai.act(now);
  }

  /* 部署：在自己的部署半径内的空格放置一个己方细胞 */
  deploy(p, x, y, now) {
    if (this.status !== 'playing' || !p.ready(now)) return false;
    if (!this.grid.inBounds(x, y)) return false;
    if (this.grid.get(x, y) !== CONFIG.CELL_DEAD) return false;
    if (!p.inRange(x, y)) return false;

    this.grid.set(x, y, p.cellType, this.gen);
    p.markAction(now);
    this.afterAction(p);
    return true;
  }

  /* 移动：角色走到相邻空格 */
  move(p, x, y, now) {
    if (this.status !== 'playing' || !p.ready(now)) return false;
    if (!this.grid.inBounds(x, y)) return false;
    if (this.grid.get(x, y) !== CONFIG.CELL_DEAD) return false;
    if (Math.max(Math.abs(x - p.charX), Math.abs(y - p.charY)) !== 1) return false;

    this.grid.clear(p.charX, p.charY);
    p.charX = x; p.charY = y;
    this.grid.set(x, y, p.charCell, this.gen);
    p.markAction(now);
    this.afterAction(p);
    return true;
  }

  afterAction(p) {
    this.checkCombat();
    if (this.mode === 'pvp' && this.status === 'playing') {
      this.active = (p === this.red) ? 'blue' : 'red'; // 热座自动切换
    }
  }

  /* 战斗判定：角色周围 8 格出现敌方细胞 → 角色瞬间被消灭；
   * 两个角色同时接触（如相撞）→ 同归于尽，平局 */
  checkCombat() {
    if (this.status !== 'playing') return;

    const dead = [];
    for (const p of [this.red, this.blue]) {
      if (!p.charAlive) continue;
      const enemy = this.opponentOf(p);
      outer:
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const v = this.grid.get(p.charX + dx, p.charY + dy);
          if (this.grid.belongsTo(v, enemy.color)) {
            dead.push(p);
            break outer;
          }
        }
      }
    }

    if (!dead.length) return;
    for (const p of dead) {
      p.charAlive = false;
      this.grid.clear(p.charX, p.charY);
    }
    this.status = 'over';
    this.winner = dead.length === 2 ? 'draw' : (dead[0] === this.red ? 'blue' : 'red');
  }

  /* 双方存活细胞数（含角色本体） */
  scores() {
    return { red: this.grid.liveCount('red'), blue: this.grid.liveCount('blue') };
  }
}
