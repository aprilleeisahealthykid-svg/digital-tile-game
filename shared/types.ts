export const TILE_COLORS = ['red', 'blue', 'black', 'orange'] as const;
export type TileColor = (typeof TILE_COLORS)[number];

export interface Tile {
  id: string;
  color: TileColor | null;
  number: number | null;
  isJoker: boolean;
}

export interface BoardGroup {
  id: string;
  tiles: Tile[];
}

export interface BoardSubmission {
  groups: Array<{
    id: string;
    tileIds: string[];
  }>;
}

export type RoomPhase = 'lobby' | 'playing' | 'finished';

export interface PlayerView {
  id: string;
  nickname: string;
  isHost: boolean;
  connected: boolean;
  handCount: number;
  hasOpened: boolean;
}

export interface GameView {
  board: BoardGroup[];
  deckCount: number;
  currentPlayerId: string;
  currentPlayerName: string;
  turnNumber: number;
  revision: number;
  winnerId: string | null;
  winnerName: string | null;
}

export interface RoomSnapshot {
  code: string;
  phase: RoomPhase;
  hostId: string;
  meId: string;
  players: PlayerView[];
  game: GameView | null;
  hand: Tile[];
}

export type AckSuccess<T = undefined> = T extends undefined
  ? { ok: true }
  : { ok: true; data: T };
export type AckFailure = { ok: false; error: string };
export type Ack<T = undefined> = AckSuccess<T> | AckFailure;

export interface RoomIdentity {
  code: string;
  playerId: string;
  playerToken: string;
}

export interface ClientToServerEvents {
  'room:create': (
    payload: { nickname: string },
    ack: (result: Ack<RoomIdentity>) => void,
  ) => void;
  'room:join': (
    payload: { code: string; nickname?: string; playerToken?: string },
    ack: (result: Ack<RoomIdentity>) => void,
  ) => void;
  'game:start': (ack: (result: Ack) => void) => void;
  'game:draw': (ack: (result: Ack) => void) => void;
  'game:submit': (
    payload: BoardSubmission & { turnNumber: number },
    ack: (result: Ack) => void,
  ) => void;
  'game:rematch': (ack: (result: Ack) => void) => void;
  'game:returnLobby': (ack: (result: Ack) => void) => void;
}

export interface ServerToClientEvents {
  'room:state': (snapshot: RoomSnapshot) => void;
  'game:error': (message: string) => void;
}

export interface SocketData {
  roomCode?: string;
  playerId?: string;
}
