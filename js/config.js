/* 全局配置 —— 生命棋局 · 红蓝对决 */
var CONFIG = {
  GRID_W: 15,               // 网格列数（竖屏友好）
  GRID_H: 23,               // 网格行数

  GEN_INTERVAL_MS: 130,     // 每代演化间隔
  ACTION_COOLDOWN_MS: 1000, // 角色每 1 秒可行动一次
  DEPLOY_RANGE: 2,          // 部署半径（切比雪夫距离）
  PROTECT_GENS: 16,         // 刚部署细胞保护期（≈2 秒，避免孤独死亡）

  CHAR_START: { x: 2, y: 2 }, // 红方角色起点（左上角）；蓝方在右下角对称位置

  CELL_DEAD: 0,
  CELL_RED: 1,
  CELL_BLUE: 2,
  CELL_RED_CHAR: 3,
  CELL_BLUE_CHAR: 4,

  COLORS: {
    bg: '#0b0e14',
    gridLine: 'rgba(148,163,184,0.07)',
    red: '#ff3b30',
    blue: '#2e8bff',
    ring: '#ffffff',
  },
};
