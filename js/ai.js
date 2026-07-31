/* 简单 AI：
 * 1. 优先部署能贴脸敌方角色的格子（一击必杀）
 * 2. 否则向敌方推进部署（选离敌方角色最近的格子）
 * 3. 部署位全满时，尝试向敌方安全移动（目标格周围不得有敌方细胞）
 */
class AI {
  constructor(game, player) {
    this.game = game;
    this.player = player;
  }

  act(now) {
    const p = this.player, g = this.game, grid = g.grid;
    if (g.status !== 'playing' || !p.ready(now)) return;
    const enemy = g.opponentOf(p);

    // 收集部署半径内的空格
    const spots = [];
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        if (grid.get(x, y) !== CONFIG.CELL_DEAD || !p.inRange(x, y)) continue;
        const dChar = Math.max(Math.abs(x - enemy.charX), Math.abs(y - enemy.charY));
        spots.push({ x, y, dChar });
      }
    }

    if (spots.length) {
      const kills = spots.filter(s => s.dChar <= 1); // 贴脸击杀位
      let pick;
      if (kills.length) {
        pick = kills[(Math.random() * kills.length) | 0];
      } else {
        const minD = Math.min(...spots.map(s => s.dChar));
        const near = spots.filter(s => s.dChar <= minD + 2);
        pick = near[(Math.random() * near.length) | 0];
      }
      g.deploy(p, pick.x, pick.y, now);
      return;
    }

    // 无位可部署：向敌方安全移动
    const dx = Math.sign(enemy.charX - p.charX);
    const dy = Math.sign(enemy.charY - p.charY);
    const moves = [[dx, 0], [0, dy], [dx, dy]].filter(([mx, my]) => {
      const tx = p.charX + mx, ty = p.charY + my;
      if (!grid.inBounds(tx, ty) || grid.get(tx, ty) !== CONFIG.CELL_DEAD) return false;
      // 目标格周围 8 格不得有敌方细胞，否则移动即贴脸送命
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          if (grid.belongsTo(grid.get(tx + ox, ty + oy), enemy.color)) return false;
        }
      }
      return true;
    });

    if (moves.length) {
      const [mx, my] = moves[(Math.random() * moves.length) | 0];
      g.move(p, p.charX + mx, p.charY + my, now);
    }
  }
}
