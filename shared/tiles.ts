import { TILE_COLORS, type Tile } from './types.js';

export function createTileSet(): Tile[] {
  const tiles: Tile[] = [];
  for (const color of TILE_COLORS) {
    for (let number = 1; number <= 13; number += 1) {
      for (let copy = 1; copy <= 2; copy += 1) {
        tiles.push({
          id: `${color}-${number}-${copy}`,
          color,
          number,
          isJoker: false,
        });
      }
    }
  }
  tiles.push(
    { id: 'joker-1', color: null, number: null, isJoker: true },
    { id: 'joker-2', color: null, number: null, isJoker: true },
  );
  return tiles;
}

export function shuffleTiles<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}
