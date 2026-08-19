import { describe, expect, it } from 'vitest';
import { validateBoard, validateCombination } from './rules.js';
import { createTileSet } from './tiles.js';
import type { Tile, TileColor } from './types.js';

let sequence = 0;
function tile(color: TileColor, number: number): Tile {
  sequence += 1;
  return { id: `test-${sequence}`, color, number, isJoker: false };
}
function joker(): Tile {
  sequence += 1;
  return { id: `joker-test-${sequence}`, color: null, number: null, isJoker: true };
}

describe('完整牌组', () => {
  it('包含 1–13、四色双份与 2 张 Joker，共 106 张', () => {
    const tiles = createTileSet();
    expect(tiles).toHaveLength(106);
    expect(new Set(tiles.map((item) => item.id)).size).toBe(106);
    expect(tiles.filter((item) => item.isJoker)).toHaveLength(2);
    expect(tiles.filter((item) => item.color === 'red' && item.number === 7)).toHaveLength(2);
  });
});

describe('牌组规则', () => {
  it('接受 3–4 张同数字不同颜色的 Group', () => {
    const result = validateCombination([
      tile('red', 7), tile('blue', 7), tile('black', 7), tile('orange', 7),
    ]);
    expect(result).toMatchObject({ valid: true, kind: 'group', points: 28 });
  });

  it('拒绝 Group 中重复颜色', () => {
    const result = validateCombination([tile('red', 7), tile('red', 7), tile('blue', 7)]);
    expect(result.valid).toBe(false);
  });

  it('接受同色连续 Run 并计算点数', () => {
    const result = validateCombination([
      tile('red', 4), tile('red', 5), tile('red', 6), tile('red', 7),
    ]);
    expect(result).toMatchObject({ valid: true, kind: 'run', points: 22 });
  });

  it('拒绝缺号的同色 Run，并给出可读错误', () => {
    const result = validateCombination([tile('blue', 4), tile('blue', 6), tile('blue', 7)]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('蓝色 4、6、7 不是连续牌组');
  });

  it('Joker 可补 Run 中间及末尾', () => {
    const middle = validateCombination([tile('orange', 9), joker(), tile('orange', 11)]);
    expect(middle).toMatchObject({ valid: true, kind: 'run', points: 30 });
    const end = validateCombination([tile('black', 11), tile('black', 12), joker()]);
    expect(end).toMatchObject({ valid: true, kind: 'run', points: 36 });
  });

  it('Joker 可补同点数组，按所代表数字计分', () => {
    const result = validateCombination([tile('red', 10), tile('blue', 10), joker()]);
    expect(result).toMatchObject({ valid: true, kind: 'group', points: 30 });
  });

  it('不允许超出 1–13 的 Joker Run', () => {
    const result = validateCombination([tile('red', 12), tile('red', 13), joker()]);
    expect(result.valid).toBe(false);
  });

  it('逐组检查整个桌面并指出错误组号', () => {
    const result = validateBoard([
      [tile('red', 3), tile('blue', 3), tile('black', 3)],
      [tile('orange', 2), tile('orange', 4), tile('orange', 5)],
    ]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('第 2 组不合法');
  });
});
