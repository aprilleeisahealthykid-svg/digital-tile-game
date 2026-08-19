import type { Tile, TileColor } from './types.js';

const COLOR_NAMES: Record<TileColor, string> = {
  red: '红色',
  blue: '蓝色',
  black: '黑色',
  orange: '橙色',
};

export type CombinationKind = 'group' | 'run';

export interface CombinationResult {
  valid: boolean;
  kind?: CombinationKind;
  points?: number;
  error?: string;
}

function describeTile(tile: Tile): string {
  if (tile.isJoker) return 'Joker';
  return `${COLOR_NAMES[tile.color!]} ${tile.number}`;
}

function describeTiles(tiles: Tile[]): string {
  const natural = tiles.filter((tile) => !tile.isJoker);
  if (
    natural.length === tiles.length &&
    natural.length > 0 &&
    natural.every((tile) => tile.color === natural[0].color)
  ) {
    return `${COLOR_NAMES[natural[0].color!]} ${natural.map((tile) => tile.number).join('、')}`;
  }
  return tiles.map(describeTile).join('、');
}

function validateGroup(tiles: Tile[]): CombinationResult {
  if (tiles.length < 3 || tiles.length > 4) return { valid: false };
  const natural = tiles.filter((tile) => !tile.isJoker);
  if (natural.length === 0) return { valid: false };
  const number = natural[0].number!;
  if (natural.some((tile) => tile.number !== number)) return { valid: false };
  const colors = natural.map((tile) => tile.color);
  if (new Set(colors).size !== colors.length) return { valid: false };
  return { valid: true, kind: 'group', points: number * tiles.length };
}

function validateRun(tiles: Tile[]): CombinationResult {
  if (tiles.length < 3 || tiles.length > 13) return { valid: false };
  const naturalWithIndex = tiles
    .map((tile, index) => ({ tile, index }))
    .filter(({ tile }) => !tile.isJoker);
  if (naturalWithIndex.length === 0) return { valid: false };
  const color = naturalWithIndex[0].tile.color;
  if (naturalWithIndex.some(({ tile }) => tile.color !== color)) return { valid: false };

  const start = naturalWithIndex[0].tile.number! - naturalWithIndex[0].index;
  const end = start + tiles.length - 1;
  if (start < 1 || end > 13) return { valid: false };
  if (
    naturalWithIndex.some(
      ({ tile, index }) => tile.number !== start + index,
    )
  ) {
    return { valid: false };
  }

  let points = 0;
  for (let value = start; value <= end; value += 1) points += value;
  return { valid: true, kind: 'run', points };
}

export function validateCombination(tiles: Tile[]): CombinationResult {
  if (tiles.length < 3) {
    return {
      valid: false,
      error: `${describeTiles(tiles)} 少于 3 张，不能组成牌组`,
    };
  }
  const group = validateGroup(tiles);
  const run = validateRun(tiles);
  if (group.valid && run.valid) {
    return (run.points ?? 0) > (group.points ?? 0) ? run : group;
  }
  if (group.valid) return group;
  if (run.valid) return run;

  const natural = tiles.filter((tile) => !tile.isJoker);
  const sameColor =
    natural.length > 0 && natural.every((tile) => tile.color === natural[0].color);
  return {
    valid: false,
    error: sameColor
      ? `${describeTiles(tiles)} 不是连续牌组`
      : `${describeTiles(tiles)} 不能组成合法的同点数组或连续牌组`,
  };
}

export interface BoardValidationResult {
  valid: boolean;
  points: number;
  error?: string;
}

export function validateBoard(groups: Tile[][]): BoardValidationResult {
  let points = 0;
  for (let index = 0; index < groups.length; index += 1) {
    const result = validateCombination(groups[index]);
    if (!result.valid) {
      return {
        valid: false,
        points: 0,
        error: `第 ${index + 1} 组不合法：${result.error}`,
      };
    }
    points += result.points ?? 0;
  }
  return { valid: true, points };
}
