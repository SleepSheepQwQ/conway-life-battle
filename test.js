/* 核心逻辑冒烟测试（node test.js）
 * 覆盖：康威规则（静物/振荡器/繁殖颜色）、部署保护期、战斗判定、冷却、移动与范围限制
 */
const fs = require('fs');
const vm = require('vm');

for (const f of ['config.js', 'grid.js', 'player.js', 'game.js', 'ai.js']) {
  vm.runInThisContext(fs.readFileSync('js/' + f, 'utf8'), { filename: f });
}

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗ FAIL:', msg); }
}

// 1) 2x2 方块是静物（康威纯规则：bornAt 用 NO_PROTECT 哨兵）
{
  const g = new Grid(10, 10);
  [[3, 3], [4, 3], [3, 4], [4, 4]].forEach(([x, y]) => g.set(x, y, CONFIG.CELL_RED, -1e9));
  g.step(1);
  const ok = [[3, 3], [4, 3], [3, 4], [4, 4]].every(([x, y]) => g.get(x, y) === CONFIG.CELL_RED);
  assert(ok, '2x2 方块是静物（稳定存活）');
}

// 2) 振荡器：横排三连 → 竖排（两端必须死亡，验证保护期不误伤康威规则）
{
  const g = new Grid(10, 10);
  [[4, 5], [5, 5], [6, 5]].forEach(([x, y]) => g.set(x, y, CONFIG.CELL_RED, -1e9));
  g.step(1);
  assert(
    g.get(5, 4) === CONFIG.CELL_RED && g.get(5, 5) === CONFIG.CELL_RED && g.get(5, 6) === CONFIG.CELL_RED,
    '横排三连变为竖排（振荡器）'
  );
  assert(g.get(4, 5) === CONFIG.CELL_DEAD && g.get(6, 5) === CONFIG.CELL_DEAD, '振荡器两端细胞死亡');
}

// 3) 繁殖颜色取多数
{
  const g = new Grid(10, 10);
  g.set(3, 4, CONFIG.CELL_RED, -1e9);
  g.set(4, 4, CONFIG.CELL_RED, -1e9);
  g.set(5, 4, CONFIG.CELL_BLUE, -1e9);
  g.step(1);
  assert(g.get(4, 3) === CONFIG.CELL_RED, '3 邻居繁殖：多数方红色胜出');
}

// 4) 部署保护期：孤独细胞保护期内存活，保护期结束后死亡
{
  const g = new Grid(10, 10);
  g.set(5, 5, CONFIG.CELL_RED, 0); // 孤立细胞
  g.step(1);
  assert(g.get(5, 5) === CONFIG.CELL_RED, '保护期内孤独细胞存活');
  for (let i = 1; i <= CONFIG.PROTECT_GENS + 2; i++) g.step(i);
  assert(g.get(5, 5) === CONFIG.CELL_DEAD, '保护期结束后孤独细胞死亡');
}

// 5) 战斗：敌方细胞贴脸 → 角色被瞬间消灭
{
  const game = new Game('pve');
  assert(game.grid.get(2, 2) === CONFIG.CELL_RED_CHAR, '红方角色就位于对角');
  assert(game.grid.get(CONFIG.GRID_W - 3, CONFIG.GRID_H - 3) === CONFIG.CELL_BLUE_CHAR, '蓝方角色就位于对角');
  game.grid.set(3, 2, CONFIG.CELL_BLUE, 0); // 蓝方细胞贴到红方角色
  game.checkCombat();
  assert(game.status === 'over' && game.winner === 'blue' && !game.red.charAlive, '红方角色被贴脸消灭，蓝方获胜');
}

// 6) 行动冷却：1 秒内只能行动一次
{
  const game = new Game('pve');
  const ok1 = game.deploy(game.red, 4, 2, 0);
  const ok2 = game.deploy(game.red, 4, 3, 100); // 冷却中
  assert(ok1 && !ok2, '冷却期内不能连续部署');
  assert(game.deploy(game.red, 4, 3, 1000), '冷却结束后可再次部署');
}

// 7) 移动限制：只能移动到相邻空格，原格清空
{
  const game = new Game('pve');
  assert(!game.move(game.red, 6, 2, 0), '不能跳跃移动');
  const ok = game.move(game.red, 3, 2, 0);
  assert(ok && game.red.charX === 3 && game.red.charY === 2 && game.grid.get(2, 2) === CONFIG.CELL_DEAD,
    '相邻空格可移动，原格清空');
}

// 8) 部署范围限制
{
  const game = new Game('pve');
  assert(!game.deploy(game.red, 9, 9, 0), '超出部署半径不能部署');
}

// 9) AI 行动：能部署且不越权（liveCount 含角色本体，故期望 2）
{
  const game = new Game('pve');
  game.blue.ai = new AI(game, game.blue);
  game.blue.nextActionAt = 0;
  game.blue.ai.act(1000);
  const n = game.grid.liveCount('blue');
  assert(n === 2 && game.blue.nextActionAt === 2000, 'AI 部署一个蓝方细胞并进入冷却');
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
