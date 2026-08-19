import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useEffect, useMemo, useState } from 'react';
import { TIMED_TURN_SECONDS } from '../../shared/types.js';
import type { BoardGroup, RoomSnapshot, Tile } from '../../shared/types.js';
import { TileCard, type TileLocation } from './TileCard.js';

interface GameTableProps {
  snapshot: RoomSnapshot;
  busy: boolean;
  error: string;
  notice: string;
  onError: (message: string) => void;
  onDraw: () => void;
  onSubmit: (board: BoardGroup[]) => void;
  onRematch: () => void;
  onReturnLobby: () => void;
  onShare: () => void;
}

function boardSignature(board: BoardGroup[]): string {
  return board.map((group) => `${group.id}:${group.tiles.map((tile) => tile.id).join(',')}`).join('|');
}

function HandDropZone({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'drop:hand',
    data: { location: { zone: 'hand' } },
    disabled: !enabled,
  });
  return <div ref={setNodeRef} className={`hand-tiles${isOver ? ' drop-active' : ''}`}>{children}</div>;
}

function GroupDropZone({
  group,
  enabled,
  selectedIds,
  onSelect,
  onAddSelected,
  onSplit,
  onMergePrevious,
  canMerge,
}: {
  group: BoardGroup;
  enabled: boolean;
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onAddSelected: () => void;
  onSplit: () => void;
  onMergePrevious: () => void;
  canMerge: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop:group:${group.id}`,
    data: { location: { zone: 'group', groupId: group.id } },
    disabled: !enabled,
  });
  return (
    <div ref={setNodeRef} className={`board-group${isOver ? ' drop-active' : ''}`}>
      <div className="board-group__tiles">
        {group.tiles.map((tile) => (
          <TileCard
            key={tile.id}
            tile={tile}
            location={{ zone: 'group', groupId: group.id, tileId: tile.id }}
            interactive={enabled}
            selected={selectedIds.has(tile.id)}
            onClick={() => enabled && onSelect(tile.id)}
          />
        ))}
        {group.tiles.length === 0 && <span className="empty-group-label">拖到这里</span>}
      </div>
      {enabled && (
        <div className="group-actions">
          <button type="button" onClick={onAddSelected}>加入所选手牌</button>
          <button type="button" onClick={onSplit}>从选中处拆分</button>
          {canMerge && <button type="button" onClick={onMergePrevious}>并入前组</button>}
        </div>
      )}
    </div>
  );
}

export function GameTable({
  snapshot,
  busy,
  error,
  notice,
  onError,
  onDraw,
  onSubmit,
  onRematch,
  onReturnLobby,
  onShare,
}: GameTableProps) {
  const game = snapshot.game!;
  const me = snapshot.players.find((player) => player.id === snapshot.meId)!;
  const isMyTurn = snapshot.phase === 'playing' && game.currentPlayerId === snapshot.meId;
  const isHost = snapshot.meId === snapshot.hostId;
  const [draftBoard, setDraftBoard] = useState<BoardGroup[]>(game.board);
  const [draftHand, setDraftHand] = useState<Tile[]>(snapshot.hand);
  const [selectedHand, setSelectedHand] = useState<Set<string>>(new Set());
  const [selectedTable, setSelectedTable] = useState<Set<string>>(new Set());
  const [activeTile, setActiveTile] = useState<Tile | null>(null);
  const [clockNow, setClockNow] = useState(Date.now());

  useEffect(() => {
    setDraftBoard(game.board);
    setDraftHand(snapshot.hand);
    setSelectedHand(new Set());
    setSelectedTable(new Set());
  }, [game.revision, snapshot.meId]);

  useEffect(() => {
    if (snapshot.mode !== 'timed' || !game.turnDeadlineAt || snapshot.phase !== 'playing') return;
    setClockNow(Date.now());
    const timer = window.setInterval(() => setClockNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [snapshot.mode, snapshot.phase, game.turnDeadlineAt]);

  const secondsLeft = game.turnDeadlineAt
    ? Math.min(
        TIMED_TURN_SECONDS,
        Math.max(0, Math.ceil((game.turnDeadlineAt - clockNow) / 1_000)),
      )
    : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 140, tolerance: 6 } }),
  );
  const dirty = boardSignature(draftBoard) !== boardSignature(game.board);

  const tileById = useMemo(
    () => new Map([...draftHand, ...draftBoard.flatMap((group) => group.tiles)].map((tile) => [tile.id, tile])),
    [draftHand, draftBoard],
  );

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const playSelected = () => {
    const tiles = draftHand.filter((tile) => selectedHand.has(tile.id));
    if (!tiles.length) {
      onError('请先选择要出的手牌');
      return;
    }
    const ids = new Set(tiles.map((tile) => tile.id));
    setDraftHand((hand) => hand.filter((tile) => !ids.has(tile.id)));
    setDraftBoard((board) => [...board, { id: `new-${snapshot.meId}-${Date.now()}`, tiles }]);
    setSelectedHand(new Set());
  };

  const addSelected = (groupId: string) => {
    const tiles = draftHand.filter((tile) => selectedHand.has(tile.id));
    if (!tiles.length) {
      onError('请先选择要加入的手牌');
      return;
    }
    const ids = new Set(tiles.map((tile) => tile.id));
    setDraftHand((hand) => hand.filter((tile) => !ids.has(tile.id)));
    setDraftBoard((board) => board.map((group) =>
      group.id === groupId ? { ...group, tiles: [...group.tiles, ...tiles] } : group,
    ));
    setSelectedHand(new Set());
  };

  const splitGroup = (groupId: string) => {
    const group = draftBoard.find((item) => item.id === groupId)!;
    const splitIndex = group.tiles.findIndex((tile) => selectedTable.has(tile.id));
    if (splitIndex <= 0) {
      onError('请先选中该组中第二张或更后的牌');
      return;
    }
    const before = group.tiles.slice(0, splitIndex);
    const after = group.tiles.slice(splitIndex);
    setDraftBoard((board) => {
      const index = board.findIndex((item) => item.id === groupId);
      const next = [...board];
      next.splice(index, 1, { ...group, tiles: before }, {
        id: `split-${snapshot.meId}-${Date.now()}`,
        tiles: after,
      });
      return next;
    });
    setSelectedTable(new Set());
  };

  const mergePrevious = (groupId: string) => {
    setDraftBoard((board) => {
      const index = board.findIndex((group) => group.id === groupId);
      if (index <= 0) return board;
      const next = [...board];
      next[index - 1] = { ...next[index - 1], tiles: [...next[index - 1].tiles, ...next[index].tiles] };
      next.splice(index, 1);
      return next;
    });
  };

  const moveTile = (source: TileLocation, target: Partial<TileLocation>) => {
    if (target.zone === 'hand' && source.zone === 'group') {
      onError('桌面上的牌不能收回手牌，可以拖到其他牌组');
      return;
    }
    if (source.tileId === target.tileId) return;
    const tile = tileById.get(source.tileId);
    if (!tile) return;

    if (target.zone === 'hand') {
      setDraftHand((hand) => {
        const next = hand.filter((item) => item.id !== tile.id);
        const index = target.tileId ? next.findIndex((item) => item.id === target.tileId) : next.length;
        next.splice(index < 0 ? next.length : index, 0, tile);
        return next;
      });
      return;
    }
    if (target.zone !== 'group' || !target.groupId) return;

    setDraftHand((hand) => hand.filter((item) => item.id !== tile.id));
    setDraftBoard((board) => {
      const next = board
        .map((group) => ({ ...group, tiles: group.tiles.filter((item) => item.id !== tile.id) }))
        .filter((group) => group.tiles.length > 0 || group.id === target.groupId);
      const targetGroup = next.find((group) => group.id === target.groupId);
      if (!targetGroup) return board;
      const index = target.tileId
        ? targetGroup.tiles.findIndex((item) => item.id === target.tileId)
        : targetGroup.tiles.length;
      targetGroup.tiles.splice(index < 0 ? targetGroup.tiles.length : index, 0, tile);
      return next;
    });
    setSelectedHand((current) => {
      const next = new Set(current);
      next.delete(tile.id);
      return next;
    });
  };

  const dragStart = (event: DragStartEvent) => {
    setActiveTile(event.active.data.current?.tile as Tile | null);
  };
  const dragEnd = (event: DragEndEvent) => {
    setActiveTile(null);
    const source = event.active.data.current?.location as TileLocation | undefined;
    const target = event.over?.data.current?.location as Partial<TileLocation> | undefined;
    if (source && target) moveTile(source, target);
  };

  const resetDraft = () => {
    setDraftBoard(game.board);
    setDraftHand(snapshot.hand);
    setSelectedHand(new Set());
    setSelectedTable(new Set());
    onError('已撤销本回合操作');
  };

  const sortHand = (mode: 'number' | 'color') => {
    const colorOrder = { red: 0, blue: 1, black: 2, orange: 3 } as const;
    setDraftHand((hand) => [...hand].sort((left, right) => {
      if (left.isJoker) return 1;
      if (right.isJoker) return -1;
      if (mode === 'number') return left.number! - right.number! || colorOrder[left.color!] - colorOrder[right.color!];
      return colorOrder[left.color!] - colorOrder[right.color!] || left.number! - right.number!;
    }));
  };

  return (
    <DndContext sensors={sensors} onDragStart={dragStart} onDragEnd={dragEnd} onDragCancel={() => setActiveTile(null)}>
      <main className="game-page">
        <header className="game-topbar">
          <button className="room-pill" onClick={onShare}>房间 {snapshot.code}</button>
          <div className={`turn-indicator${isMyTurn ? ' turn-indicator--mine' : ''}`}>
            <span>{isMyTurn ? '轮到你' : '当前玩家'}</span>
            <div className="turn-details">
              <strong>{game.currentPlayerName}</strong>
              {snapshot.mode === 'timed' ? (
                <time className={`turn-clock${secondsLeft !== null && secondsLeft <= 10 ? ' turn-clock--urgent' : ''}`}>
                  {secondsLeft ?? TIMED_TURN_SECONDS} 秒
                </time>
              ) : <span className="turn-clock turn-clock--free">不限时</span>}
            </div>
          </div>
          <div className="deck-count"><span>牌堆</span><strong>{game.deckCount}</strong></div>
        </header>

        <div className="opponent-strip">
          {snapshot.players.map((player) => (
            <div className={`opponent${player.id === game.currentPlayerId ? ' opponent--active' : ''}`} key={player.id}>
              <span className={player.connected ? 'online-dot' : 'offline-dot'} />
              <strong>{player.nickname}{player.id === snapshot.meId ? '（我）' : ''}</strong>
              <span>{player.handCount} 张</span>
              {player.hasOpened && <em>已开牌</em>}
            </div>
          ))}
        </div>

        {(error || notice) && <div className={`game-message${error ? ' game-message--error' : ''}`} role="status">{error || notice}</div>}

        <section className="table-area" aria-label="公共牌桌">
          {draftBoard.length === 0 ? (
            <div className="empty-table">
              <span className="empty-table__tiles">1 · 2 · 3</span>
              <strong>牌桌还是空的</strong>
              <small>{isMyTurn ? '选择手牌后点击「出牌」建立牌组' : `等待 ${game.currentPlayerName} 出牌`}</small>
            </div>
          ) : (
            <div className="board-groups">
              {draftBoard.map((group, index) => (
                <GroupDropZone
                  key={group.id}
                  group={group}
                  enabled={isMyTurn}
                  selectedIds={selectedTable}
                  onSelect={(id) => toggle(setSelectedTable, id)}
                  onAddSelected={() => addSelected(group.id)}
                  onSplit={() => splitGroup(group.id)}
                  onMergePrevious={() => mergePrevious(group.id)}
                  canMerge={index > 0}
                />
              ))}
            </div>
          )}
        </section>

        <section className="hand-panel" aria-label="我的手牌">
          <div className="hand-heading">
            <div><strong>我的手牌</strong><span>{draftHand.length} 张</span></div>
            <div className="sort-actions">
              <button onClick={() => sortHand('number')}>按数字</button>
              <button onClick={() => sortHand('color')}>按颜色</button>
            </div>
          </div>
          <HandDropZone enabled={isMyTurn}>
            {draftHand.map((tile) => (
              <TileCard
                key={tile.id}
                tile={tile}
                location={{ zone: 'hand', tileId: tile.id }}
                interactive={isMyTurn}
                selected={selectedHand.has(tile.id)}
                onClick={() => isMyTurn && toggle(setSelectedHand, tile.id)}
              />
            ))}
          </HandDropZone>
          <div className="game-actions">
            <button className="button button--secondary" disabled={!isMyTurn || busy} onClick={playSelected}>出牌</button>
            <button className="button button--ghost" disabled={!isMyTurn || busy || !dirty} onClick={resetDraft}>撤销本回合</button>
            <button className="button button--dark" disabled={!isMyTurn || busy || dirty} onClick={onDraw}>摸牌</button>
            <button className="button button--primary" disabled={!isMyTurn || busy || !dirty} onClick={() => onSubmit(draftBoard)}>提交回合</button>
          </div>
          {isMyTurn && !me.hasOpened && <p className="opening-rule">首次出牌需使用自己的手牌组成合法牌组，总分至少 30 分</p>}
          {!isMyTurn && snapshot.phase === 'playing' && <p className="waiting-note">你可以先查看和整理思路，轮到你时再操作</p>}
        </section>

        {snapshot.phase === 'finished' && (
          <div className="modal-backdrop">
            <section className="winner-card" role="dialog" aria-modal="true" aria-labelledby="winner-title">
              <span className="winner-spark">✦</span>
              <p>本局结束</p>
              <h2 id="winner-title">{game.winnerName} 获胜</h2>
              {isHost ? (
                <>
                  <button className="button button--primary button--large" disabled={busy} onClick={onRematch}>再来一局</button>
                  <button className="button button--ghost" disabled={busy} onClick={onReturnLobby}>返回房间</button>
                </>
              ) : <p className="waiting-note">等待房主选择下一步</p>}
            </section>
          </div>
        )}
      </main>
      <DragOverlay dropAnimation={null}>
        {activeTile && (
          <TileCard
            tile={activeTile}
            location={{ zone: 'hand', tileId: activeTile.id }}
            overlay
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
