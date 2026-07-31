/* 玩家（角色）：颜色、位置、行动冷却、部署半径 */
class Player {
  constructor({ color, name, isAI }) {
    this.color = color;   // 'red' | 'blue'
    this.name = name;
    this.isAI = isAI;
    this.charAlive = true;
    this.charX = 0;
    this.charY = 0;
    this.nextActionAt = 0; // 行动冷却（每秒一次）
  }

  get cellType() {
    return this.color === 'red' ? CONFIG.CELL_RED : CONFIG.CELL_BLUE;
  }

  get charCell() {
    return this.color === 'red' ? CONFIG.CELL_RED_CHAR : CONFIG.CELL_BLUE_CHAR;
  }

  ready(now) { return this.charAlive && now >= this.nextActionAt; }

  /* 目标格是否在部署半径内（切比雪夫距离） */
  inRange(x, y) {
    return Math.max(Math.abs(x - this.charX), Math.abs(y - this.charY)) <= CONFIG.DEPLOY_RANGE;
  }

  markAction(now) { this.nextActionAt = now + CONFIG.ACTION_COOLDOWN_MS; }
}
