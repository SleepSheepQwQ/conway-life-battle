/* 网格模型：细胞状态 + 康威 B3/S23 演化
 * 状态：0 死 | 1 红 | 2 蓝 | 3 红角色 | 4 蓝角色
 * 额外记录每个细胞的"出生代数"，用于部署保护期判定：
 * - 玩家部署的细胞：bornAt = 部署时代数 → 保护期内免疫死亡
 * - 康威诞生的细胞：bornAt = NO_PROTECT → 无保护期，严格遵循 B3/S23
 */
const NO_PROTECT = -1000000000;

class Grid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.cells = new Uint8Array(w * h);
    this.bornAt = new Int32Array(w * h).fill(-1);
  }

  idx(x, y) { return y * this.w + x; }

  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  get(x, y) {
    return this.inBounds(x, y) ? this.cells[this.idx(x, y)] : CONFIG.CELL_DEAD;
  }

  set(x, y, v, gen) {
    if (!this.inBounds(x, y)) return false;
    this.cells[this.idx(x, y)] = v;
    this.bornAt[this.idx(x, y)] = gen;
    return true;
  }

  clear(x, y) {
    if (!this.inBounds(x, y)) return;
    this.cells[this.idx(x, y)] = CONFIG.CELL_DEAD;
    this.bornAt[this.idx(x, y)] = -1;
  }

  isLive(v) { return v !== CONFIG.CELL_DEAD; }

  isChar(v) { return v === CONFIG.CELL_RED_CHAR || v === CONFIG.CELL_BLUE_CHAR; }

  belongsTo(v, color) {
    if (color === 'red') return v === CONFIG.CELL_RED || v === CONFIG.CELL_RED_CHAR;
    return v === CONFIG.CELL_BLUE || v === CONFIG.CELL_BLUE_CHAR;
  }

  /* 统计 8 邻域：活细胞总数 + 红蓝各自数量（角色按自身颜色计入） */
  neighborStats(x, y) {
    let live = 0, red = 0, blue = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const v = this.get(x + dx, y + dy);
        if (this.isLive(v)) {
          live++;
          if (v === CONFIG.CELL_RED || v === CONFIG.CELL_RED_CHAR) red++;
          else blue++;
        }
      }
    }
    return { live, red, blue };
  }

  /* 康威规则 B3/S23 演化一步：
   * - 角色细胞免疫死亡，永久存活
   * - 部署细胞在保护期内免疫死亡（仍参与邻居计数）
   * - 繁殖：死细胞周围恰好 3 个活细胞时诞生，颜色取邻居多数方
   */
  step(gen) {
    const w = this.w, h = this.h;
    const next = new Uint8Array(w * h);
    const nextBorn = new Int32Array(w * h).fill(-1);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = this.idx(x, y);
        const v = this.cells[i];
        if (this.isChar(v)) { next[i] = v; continue; }

        const { live, red } = this.neighborStats(x, y);
        let nv = CONFIG.CELL_DEAD;

        if (v !== CONFIG.CELL_DEAD) {
          const protectedNow = this.bornAt[i] >= 0 && (gen - this.bornAt[i]) < CONFIG.PROTECT_GENS;
          if (protectedNow || live === 2 || live === 3) nv = v; // 存活并保留颜色
        } else if (live === 3) {
          nv = red >= 2 ? CONFIG.CELL_RED : CONFIG.CELL_BLUE; // 繁殖，颜色取多数
        }

        next[i] = nv;
        if (nv !== CONFIG.CELL_DEAD) {
          nextBorn[i] = (nv === v) ? this.bornAt[i] : NO_PROTECT;
        }
      }
    }

    this.cells = next;
    this.bornAt = nextBorn;
  }

  /* 某方的存活细胞数（含角色本体） */
  liveCount(color) {
    let n = 0;
    for (let i = 0; i < this.cells.length; i++) {
      if (this.belongsTo(this.cells[i], color)) n++;
    }
    return n;
  }

  reset() {
    this.cells.fill(CONFIG.CELL_DEAD);
    this.bornAt.fill(-1);
  }
}
