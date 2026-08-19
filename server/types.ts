import type { RoomPhase, Tile } from '../shared/types.js';

export interface PlayerRecord {
  id: string;
  token: string;
  nickname: string;
  socketId: string | null;
  connected: boolean;
  handIds: string[];
  hasOpened: boolean;
}

export interface GameRecord {
  tileCatalog: Record<string, Tile>;
  deckIds: string[];
  board: Array<{ id: string; tileIds: string[] }>;
  currentPlayerIndex: number;
  turnNumber: number;
  revision: number;
  winnerId: string | null;
}

export interface RoomRecord {
  code: string;
  phase: RoomPhase;
  hostId: string;
  players: PlayerRecord[];
  game: GameRecord | null;
  createdAt: number;
}
