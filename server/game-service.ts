import { randomBytes, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { validateBoard } from '../shared/rules.js';
import { createTileSet, shuffleTiles } from '../shared/tiles.js';
import { TIMED_TURN_SECONDS } from '../shared/types.js';
import type {
  Ack,
  BoardSubmission,
  ClientToServerEvents,
  GameMode,
  RoomIdentity,
  RoomSnapshot,
  ServerToClientEvents,
  SocketData,
  Tile,
} from '../shared/types.js';
import { MemoryRoomStore, type RoomStore } from './store.js';
import type { GameRecord, PlayerRecord, RoomRecord } from './types.js';

type GameSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

type GameIo = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export interface GameServiceOptions {
  store?: RoomStore;
  random?: () => number;
  handSize?: number;
  deckFactory?: () => Tile[];
  turnDurationMs?: number;
}

export class GameError extends Error {}

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function cleanNickname(nickname: string | undefined): string {
  const clean = (nickname ?? '').trim().replace(/\s+/g, ' ');
  if (clean.length < 1 || clean.length > 12) {
    throw new GameError('昵称需为 1–12 个字符');
  }
  return clean;
}

function cleanGameMode(mode: GameMode | undefined): GameMode {
  if (mode === undefined) return 'relaxed';
  if (mode !== 'timed' && mode !== 'relaxed') throw new GameError('未知的游戏模式');
  return mode;
}

function sameArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export class GameService {
  readonly store: RoomStore;
  private readonly random: () => number;
  private readonly handSize: number;
  private readonly deckFactory?: () => Tile[];
  private readonly turnDurationMs: number;
  private readonly turnTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly io: GameIo,
    options: GameServiceOptions = {},
  ) {
    this.store = options.store ?? new MemoryRoomStore();
    this.random = options.random ?? Math.random;
    this.handSize = options.handSize ?? 14;
    this.deckFactory = options.deckFactory;
    this.turnDurationMs = options.turnDurationMs ?? TIMED_TURN_SECONDS * 1_000;
  }

  createRoom(
    socket: GameSocket,
    nicknameInput: string,
    modeInput?: GameMode,
  ): RoomIdentity {
    const nickname = cleanNickname(nicknameInput);
    const mode = cleanGameMode(modeInput);
    const code = this.createRoomCode();
    const player = this.createPlayer(nickname, socket.id);
    const room: RoomRecord = {
      code,
      mode,
      phase: 'lobby',
      hostId: player.id,
      players: [player],
      game: null,
      createdAt: Date.now(),
    };
    this.store.set(room);
    this.bindSocket(socket, room, player);
    this.broadcast(room);
    return { code, playerId: player.id, playerToken: player.token };
  }

  joinRoom(
    socket: GameSocket,
    payload: { code: string; nickname?: string; playerToken?: string },
  ): RoomIdentity {
    const code = normalizeCode(payload.code);
    const room = this.store.get(code);
    if (!room) throw new GameError('找不到这个房间，请检查房间码');

    const returning = payload.playerToken
      ? room.players.find((player) => player.token === payload.playerToken)
      : undefined;
    if (returning) {
      this.bindSocket(socket, room, returning);
      this.broadcast(room);
      return { code, playerId: returning.id, playerToken: returning.token };
    }

    if (room.phase !== 'lobby') {
      throw new GameError('游戏已经开始，只有原玩家可以重连');
    }
    if (room.players.length >= 4) throw new GameError('房间已满（最多 4 人）');

    const nickname = cleanNickname(payload.nickname);
    if (room.players.some((player) => player.nickname === nickname)) {
      throw new GameError('这个昵称已被使用，请换一个');
    }
    const player = this.createPlayer(nickname, socket.id);
    room.players.push(player);
    this.bindSocket(socket, room, player);
    this.broadcast(room);
    return { code, playerId: player.id, playerToken: player.token };
  }

  syncRoom(
    socket: GameSocket,
    payload: { code: string; playerToken: string },
  ): void {
    const code = normalizeCode(payload.code);
    const room = this.store.get(code);
    const player = room?.players.find((item) => item.token === payload.playerToken);
    if (!room || !player) throw new GameError('房间身份已失效，请重新加入');

    const connectionChanged = !player.connected || player.socketId !== socket.id;
    this.bindSocket(socket, room, player);
    if (connectionChanged) {
      this.broadcast(room);
    } else {
      this.io.to(socket.id).emit('room:state', this.snapshot(room, player));
    }
  }

  startGame(socket: GameSocket): void {
    const { room, player } = this.context(socket);
    if (room.hostId !== player.id) throw new GameError('只有房主可以开始游戏');
    if (room.phase !== 'lobby') throw new GameError('游戏已经开始');
    if (room.players.length < 2) throw new GameError('至少需要 2 名玩家');
    if (room.players.length > 4) throw new GameError('最多只能有 4 名玩家');
    if (room.players.some((item) => !item.connected)) {
      throw new GameError('请等待所有玩家重新连接后再开始');
    }
    this.initializeGame(room);
    this.broadcast(room);
  }

  drawTile(socket: GameSocket): void {
    const { room, player, game } = this.playingContext(socket);
    this.assertTurn(room, player, game);
    const tileId = game.deckIds.pop();
    if (!tileId) throw new GameError('牌堆已空，无法继续摸牌');
    player.handIds.push(tileId);
    this.advanceTurn(room, game);
    game.revision += 1;
    this.broadcast(room);
  }

  submitTurn(
    socket: GameSocket,
    submission: BoardSubmission & { turnNumber: number },
  ): void {
    const { room, player, game } = this.playingContext(socket);
    this.assertTurn(room, player, game);
    if (submission.turnNumber !== game.turnNumber) {
      throw new GameError('回合状态已经更新，请重新操作');
    }
    if (!submission.groups.length) throw new GameError('桌面不能为空');

    const groupIds = submission.groups.map((group) => group.id);
    if (groupIds.some((id) => !id.trim()) || new Set(groupIds).size !== groupIds.length) {
      throw new GameError('牌组标识重复，请撤销本回合后重试');
    }

    const submittedIds = submission.groups.flatMap((group) => group.tileIds);
    if (submittedIds.length !== new Set(submittedIds).size) {
      throw new GameError('同一张牌不能在桌面上出现两次');
    }
    const originalIds = game.board.flatMap((group) => group.tileIds);
    const submittedSet = new Set(submittedIds);
    for (const tileId of originalIds) {
      if (!submittedSet.has(tileId)) throw new GameError('不能把桌面上的牌收回手牌');
    }

    const originalSet = new Set(originalIds);
    const addedIds = submittedIds.filter((id) => !originalSet.has(id));
    if (addedIds.length === 0) throw new GameError('本回合至少要从手牌打出 1 张牌');
    const handSet = new Set(player.handIds);
    if (addedIds.some((id) => !handSet.has(id))) {
      throw new GameError('提交中包含不属于你手牌的牌');
    }

    const resolvedGroups = submission.groups.map((group) => {
      const tiles = group.tileIds.map((id) => game.tileCatalog[id]);
      if (tiles.some((tile) => !tile)) throw new GameError('提交中包含不存在的牌');
      return tiles;
    });
    const boardResult = validateBoard(resolvedGroups);
    if (!boardResult.valid) throw new GameError(boardResult.error!);

    if (!player.hasOpened) {
      for (const originalGroup of game.board) {
        const submittedGroup = submission.groups.find((group) => group.id === originalGroup.id);
        if (!submittedGroup || !sameArray(submittedGroup.tileIds, originalGroup.tileIds)) {
          throw new GameError('首次达到 30 分前，不能移动或修改桌面已有牌组');
        }
      }
      const originalGroupIds = new Set(game.board.map((group) => group.id));
      const newGroups = submission.groups
        .filter((group) => !originalGroupIds.has(group.id))
        .map((group) => group.tileIds.map((id) => game.tileCatalog[id]));
      const openingResult = validateBoard(newGroups);
      if (!openingResult.valid) throw new GameError(openingResult.error!);
      if (openingResult.points < 30) {
        throw new GameError(`首次出牌共 ${openingResult.points} 分，还需要达到 30 分`);
      }
      player.hasOpened = true;
    }

    player.handIds = player.handIds.filter((id) => !new Set(addedIds).has(id));
    game.board = submission.groups.map((group) => ({
      id: group.id,
      tileIds: [...group.tileIds],
    }));
    game.revision += 1;

    if (player.handIds.length === 0) {
      game.winnerId = player.id;
      game.turnDeadlineAt = null;
      room.phase = 'finished';
      this.clearTurnTimer(room.code);
    } else {
      this.advanceTurn(room, game);
    }
    this.broadcast(room);
  }

  rematch(socket: GameSocket): void {
    const { room, player } = this.context(socket);
    if (room.hostId !== player.id) throw new GameError('只有房主可以发起再来一局');
    if (room.phase !== 'finished') throw new GameError('当前对局尚未结束');
    if (room.players.some((item) => !item.connected)) {
      throw new GameError('请等待所有玩家重新连接后再来一局');
    }
    this.initializeGame(room);
    this.broadcast(room);
  }

  returnToLobby(socket: GameSocket): void {
    const { room, player } = this.context(socket);
    if (room.hostId !== player.id) throw new GameError('只有房主可以返回房间');
    if (room.phase !== 'finished') throw new GameError('当前对局尚未结束');
    room.phase = 'lobby';
    room.game = null;
    this.clearTurnTimer(room.code);
    for (const item of room.players) {
      item.handIds = [];
      item.hasOpened = false;
    }
    this.broadcast(room);
  }

  disconnect(socket: GameSocket): void {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) return;
    const room = this.store.get(roomCode);
    const player = room?.players.find((item) => item.id === playerId);
    if (!room || !player || player.socketId !== socket.id) return;
    player.connected = false;
    player.socketId = null;
    this.broadcast(room);
  }

  private initializeGame(room: RoomRecord): void {
    this.clearTurnTimer(room.code);
    const tiles = this.deckFactory
      ? this.deckFactory().map((tile) => ({ ...tile }))
      : shuffleTiles(createTileSet(), this.random);
    if (new Set(tiles.map((tile) => tile.id)).size !== tiles.length) {
      throw new GameError('牌组初始化失败：牌 ID 重复');
    }
    if (tiles.length < room.players.length * this.handSize + 1) {
      throw new GameError('牌组数量不足，无法开局');
    }
    const game: GameRecord = {
      tileCatalog: Object.fromEntries(tiles.map((tile) => [tile.id, tile])),
      deckIds: tiles.map((tile) => tile.id),
      board: [],
      currentPlayerIndex: 0,
      turnNumber: 1,
      revision: 1,
      turnDeadlineAt: null,
      winnerId: null,
    };
    for (const player of room.players) {
      player.handIds = [];
      player.hasOpened = false;
    }
    for (let count = 0; count < this.handSize; count += 1) {
      for (const player of room.players) {
        player.handIds.push(game.deckIds.pop()!);
      }
    }
    room.game = game;
    room.phase = 'playing';
    this.startTurnTimer(room, game);
  }

  private advanceTurn(room: RoomRecord, game: GameRecord): void {
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % room.players.length;
    game.turnNumber += 1;
    this.startTurnTimer(room, game);
  }

  private startTurnTimer(room: RoomRecord, game: GameRecord): void {
    this.clearTurnTimer(room.code);
    if (room.mode !== 'timed') {
      game.turnDeadlineAt = null;
      return;
    }

    game.turnDeadlineAt = Date.now() + this.turnDurationMs;
    const expectedTurn = game.turnNumber;
    const timer = setTimeout(() => {
      this.turnTimers.delete(room.code);
      const currentRoom = this.store.get(room.code);
      const currentGame = currentRoom?.game;
      if (
        !currentRoom ||
        currentRoom.phase !== 'playing' ||
        currentRoom.mode !== 'timed' ||
        !currentGame ||
        currentGame.turnNumber !== expectedTurn
      ) return;

      const currentPlayer = currentRoom.players[currentGame.currentPlayerIndex];
      const tileId = currentGame.deckIds.pop();
      if (tileId) currentPlayer.handIds.push(tileId);
      currentGame.revision += 1;
      this.advanceTurn(currentRoom, currentGame);
      this.broadcast(currentRoom);
    }, this.turnDurationMs);
    timer.unref();
    this.turnTimers.set(room.code, timer);
  }

  private clearTurnTimer(roomCode: string): void {
    const timer = this.turnTimers.get(roomCode);
    if (timer) clearTimeout(timer);
    this.turnTimers.delete(roomCode);
  }

  private assertTurn(room: RoomRecord, player: PlayerRecord, game: GameRecord): void {
    if (room.players[game.currentPlayerIndex]?.id !== player.id) {
      throw new GameError('现在不是你的回合');
    }
  }

  private context(socket: GameSocket): { room: RoomRecord; player: PlayerRecord } {
    const { roomCode, playerId } = socket.data;
    const room = roomCode ? this.store.get(roomCode) : undefined;
    const player = room?.players.find((item) => item.id === playerId);
    if (!room || !player) throw new GameError('请先进入房间');
    return { room, player };
  }

  private playingContext(socket: GameSocket): {
    room: RoomRecord;
    player: PlayerRecord;
    game: GameRecord;
  } {
    const context = this.context(socket);
    if (context.room.phase !== 'playing' || !context.room.game) {
      throw new GameError('当前没有进行中的游戏');
    }
    return { ...context, game: context.room.game };
  }

  private createPlayer(nickname: string, socketId: string): PlayerRecord {
    return {
      id: randomUUID(),
      token: randomBytes(24).toString('base64url'),
      nickname,
      socketId,
      connected: true,
      handIds: [],
      hasOpened: false,
    };
  }

  private createRoomCode(): string {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const bytes = randomBytes(6);
      let code = '';
      for (const byte of bytes) code += ROOM_ALPHABET[byte % ROOM_ALPHABET.length];
      if (!this.store.get(code)) return code;
    }
    throw new GameError('暂时无法创建房间，请稍后重试');
  }

  private bindSocket(socket: GameSocket, room: RoomRecord, player: PlayerRecord): void {
    if (socket.data.roomCode) socket.leave(socket.data.roomCode);
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    player.socketId = socket.id;
    player.connected = true;
    socket.join(room.code);
  }

  private snapshot(room: RoomRecord, me: PlayerRecord): RoomSnapshot {
    const game = room.game;
    const currentPlayer = game ? room.players[game.currentPlayerIndex] : null;
    const winner = game?.winnerId
      ? room.players.find((player) => player.id === game.winnerId)
      : null;
    return {
      code: room.code,
      mode: room.mode,
      phase: room.phase,
      hostId: room.hostId,
      meId: me.id,
      players: room.players.map((player) => ({
        id: player.id,
        nickname: player.nickname,
        isHost: player.id === room.hostId,
        connected: player.connected,
        handCount: player.handIds.length,
        hasOpened: player.hasOpened,
      })),
      game: game
        ? {
            board: game.board.map((group) => ({
              id: group.id,
              tiles: group.tileIds.map((id) => game.tileCatalog[id]),
            })),
            deckCount: game.deckIds.length,
            currentPlayerId: currentPlayer?.id ?? '',
            currentPlayerName: currentPlayer?.nickname ?? '',
            turnNumber: game.turnNumber,
            revision: game.revision,
            turnDeadlineAt: game.turnDeadlineAt,
            winnerId: game.winnerId,
            winnerName: winner?.nickname ?? null,
          }
        : null,
      hand: game ? me.handIds.map((id) => game.tileCatalog[id]) : [],
    };
  }

  private broadcast(room: RoomRecord): void {
    for (const player of room.players) {
      if (!player.connected || !player.socketId) continue;
      this.io.to(player.socketId).emit('room:state', this.snapshot(room, player));
    }
  }
}

export function withAck<T>(
  socket: GameSocket,
  ack: (result: Ack<T>) => void,
  action: () => T | void,
): void {
  try {
    const data = action();
    if (data === undefined) {
      ack({ ok: true } as Ack<T>);
    } else {
      ack({ ok: true, data } as Ack<T>);
    }
  } catch (error) {
    const message = error instanceof GameError ? error.message : '服务器处理失败，请重试';
    if (!(error instanceof GameError)) console.error(error);
    socket.emit('game:error', message);
    ack({ ok: false, error: message });
  }
}
