import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { createTileSet } from '../shared/tiles.js';
import type {
  Ack,
  ClientToServerEvents,
  RoomIdentity,
  RoomSnapshot,
  ServerToClientEvents,
  Tile,
} from '../shared/types.js';
import { createGameServer } from './create-server.js';

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;
const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function boot(options: Parameters<typeof createGameServer>[0] = {}) {
  const server = createGameServer(options);
  await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve));
  const port = (server.httpServer.address() as AddressInfo).port;
  cleanups.push(async () => {
    await new Promise<void>((resolve) => server.io.close(() => resolve()));
    if (server.httpServer.listening) {
      await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
    }
  });
  return { ...server, url: `http://127.0.0.1:${port}` };
}

async function connect(url: string): Promise<TestClient> {
  const client: TestClient = createClient(url, {
    transports: ['websocket'],
    forceNew: true,
  });
  cleanups.push(() => client.disconnect());
  await new Promise<void>((resolve, reject) => {
    client.once('connect', resolve);
    client.once('connect_error', reject);
  });
  return client;
}

function emit<T>(client: TestClient, event: string, payload?: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => {
    const raw = client as unknown as { emit: (...args: unknown[]) => void };
    if (payload === undefined) raw.emit(event, resolve);
    else raw.emit(event, payload, resolve);
  });
}

function waitForState(
  client: TestClient,
  predicate: (state: RoomSnapshot) => boolean,
): Promise<RoomSnapshot> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off('room:state', listener);
      reject(new Error('等待房间状态超时'));
    }, 3_000);
    const listener = (state: RoomSnapshot) => {
      if (!predicate(state)) return;
      clearTimeout(timer);
      client.off('room:state', listener);
      resolve(state);
    };
    client.on('room:state', listener);
  });
}

async function createAndJoin(url: string) {
  const host = await connect(url);
  const guest = await connect(url);
  const created = await emit<RoomIdentity>(host, 'room:create', { nickname: '房主' });
  if (!created.ok) throw new Error(created.error);
  const joined = await emit<RoomIdentity>(guest, 'room:join', {
    code: created.data.code,
    nickname: '朋友',
  });
  if (!joined.ok) throw new Error(joined.error);
  return { host, guest, hostIdentity: created.data, guestIdentity: joined.data };
}

describe('Socket.IO 多人流程', () => {
  it('朋友加入后房主无需刷新即可看到玩家，并可主动同步错过的大厅状态', async () => {
    const { url } = await boot();
    const host = await connect(url);
    const guest = await connect(url);
    const created = await emit<RoomIdentity>(host, 'room:create', { nickname: '房主' });
    if (!created.ok) throw new Error(created.error);

    const hostSeesGuest = waitForState(
      host,
      (state) => state.phase === 'lobby' && state.players.length === 2,
    );
    const joined = await emit<RoomIdentity>(guest, 'room:join', {
      code: created.data.code,
      nickname: '朋友',
    });
    expect(joined.ok).toBe(true);
    const liveLobby = await hostSeesGuest;
    expect(liveLobby.players.map((player) => player.nickname)).toEqual(['房主', '朋友']);

    const resynced = waitForState(
      host,
      (state) => state.phase === 'lobby' && state.players.length === 2,
    );
    const sync = await emit(host, 'room:sync', {
      code: created.data.code,
      playerToken: created.data.playerToken,
    });
    expect(sync.ok).toBe(true);
    expect((await resynced).players).toHaveLength(2);
  });

  it('创建、两人加入、发 14 张牌、隐藏对手手牌、摸牌并切换回合', async () => {
    const { url } = await boot();
    const { host, guest } = await createAndJoin(url);

    const hostStarted = waitForState(host, (state) => state.phase === 'playing');
    const guestStarted = waitForState(guest, (state) => state.phase === 'playing');
    const startAck = await emit(host, 'game:start');
    expect(startAck.ok).toBe(true);
    const [hostState, guestState] = await Promise.all([hostStarted, guestStarted]);

    expect(hostState.hand).toHaveLength(14);
    expect(guestState.hand).toHaveLength(14);
    expect(hostState.players.map((player) => player.handCount)).toEqual([14, 14]);
    expect(hostState.hand.some((tile) => guestState.hand.some((other) => other.id === tile.id))).toBe(false);
    expect(Object.keys(hostState)).not.toContain('hands');

    const illegalDraw = await emit(guest, 'game:draw');
    expect(illegalDraw).toEqual({ ok: false, error: '现在不是你的回合' });

    const hostAfterDraw = waitForState(host, (state) => state.game?.turnNumber === 2);
    const guestAfterDraw = waitForState(guest, (state) => state.game?.turnNumber === 2);
    const drawAck = await emit(host, 'game:draw');
    expect(drawAck.ok).toBe(true);
    const [hostDrawn, guestWatching] = await Promise.all([hostAfterDraw, guestAfterDraw]);
    expect(hostDrawn.hand).toHaveLength(15);
    expect(guestWatching.hand).toHaveLength(14);
    expect(guestWatching.game?.currentPlayerId).toBe(guestWatching.meId);
    expect(guestWatching.players.find((player) => player.id === hostDrawn.meId)?.handCount).toBe(15);
  });

  it('刷新或短线后可用私密 token 恢复身份、手牌与轮次', async () => {
    const { url } = await boot();
    const { host, guest, hostIdentity } = await createAndJoin(url);
    const started = waitForState(host, (state) => state.phase === 'playing');
    await emit(host, 'game:start');
    await started;
    const drawn = waitForState(host, (state) => state.game?.turnNumber === 2);
    await emit(host, 'game:draw');
    const beforeDisconnect = await drawn;
    host.disconnect();

    const replacement = await connect(url);
    const recoveredState = waitForState(
      replacement,
      (state) => state.meId === hostIdentity.playerId && state.game?.turnNumber === 2,
    );
    const rejoin = await emit<RoomIdentity>(replacement, 'room:join', {
      code: hostIdentity.code,
      playerToken: hostIdentity.playerToken,
    });
    expect(rejoin.ok).toBe(true);
    const afterReconnect = await recoveredState;
    expect(afterReconnect.hand.map((tile) => tile.id)).toEqual(beforeDisconnect.hand.map((tile) => tile.id));
    expect(afterReconnect.players.find((player) => player.id === hostIdentity.playerId)?.connected).toBe(true);
    expect(afterReconnect.game?.currentPlayerId).toBe(afterReconnect.players[1].id);
  });

  it('服务器验证首次 30 分，合法出完手牌后宣布胜利', async () => {
    const winningIds = ['red-10-1', 'blue-10-1', 'black-10-1'];
    const fillerIds = ['orange-1-1', 'orange-2-1', 'orange-3-1'];
    const deckFactory = (): Tile[] => {
      const all = createTileSet();
      const selected = new Set([...winningIds, ...fillerIds]);
      const remaining = all.filter((tile) => !selected.has(tile.id));
      const byId = new Map(all.map((tile) => [tile.id, tile]));
      return [
        ...remaining,
        byId.get(fillerIds[2])!, byId.get(winningIds[2])!,
        byId.get(fillerIds[1])!, byId.get(winningIds[1])!,
        byId.get(fillerIds[0])!, byId.get(winningIds[0])!,
      ];
    };
    const { url } = await boot({ handSize: 3, deckFactory });
    const { host, guest } = await createAndJoin(url);
    const started = waitForState(host, (state) => state.phase === 'playing');
    await emit(host, 'game:start');
    const hostState = await started;
    expect(hostState.hand.map((tile) => tile.id)).toEqual(winningIds);

    const guestFinished = waitForState(guest, (state) => state.phase === 'finished');
    const submit = await emit(host, 'game:submit', {
      turnNumber: 1,
      groups: [{ id: 'opening-30', tileIds: winningIds }],
    });
    expect(submit.ok).toBe(true);
    const finished = await guestFinished;
    expect(finished.game?.winnerName).toBe('房主');
    expect(finished.players[0].handCount).toBe(0);
    expect(finished.game?.board[0].tiles.map((tile) => tile.id)).toEqual(winningIds);
  });

  it('拒绝不足 30 分的首次提交，真实桌面保持不变', async () => {
    const lowIds = ['red-3-1', 'blue-3-1', 'black-3-1'];
    const fillerIds = ['orange-1-1', 'orange-2-1', 'orange-3-1'];
    const deckFactory = (): Tile[] => {
      const all = createTileSet();
      const selected = new Set([...lowIds, ...fillerIds]);
      const remaining = all.filter((tile) => !selected.has(tile.id));
      const byId = new Map(all.map((tile) => [tile.id, tile]));
      return [
        ...remaining,
        byId.get(fillerIds[2])!, byId.get(lowIds[2])!,
        byId.get(fillerIds[1])!, byId.get(lowIds[1])!,
        byId.get(fillerIds[0])!, byId.get(lowIds[0])!,
      ];
    };
    const { url, service } = await boot({ handSize: 3, deckFactory });
    const { host, hostIdentity } = await createAndJoin(url);
    const started = waitForState(host, (state) => state.phase === 'playing');
    await emit(host, 'game:start');
    await started;

    const submit = await emit(host, 'game:submit', {
      turnNumber: 1,
      groups: [{ id: 'too-low', tileIds: lowIds }],
    });
    expect(submit).toEqual({ ok: false, error: '首次出牌共 9 分，还需要达到 30 分' });
    const room = service.store.get(hostIdentity.code)!;
    expect(room.game?.board).toEqual([]);
    expect(room.players[0].handIds).toEqual(lowIds);
    expect(room.game?.turnNumber).toBe(1);
  });
});
