import { useCallback, useEffect, useState } from 'react';
import type { Ack, BoardGroup, RoomIdentity, RoomSnapshot } from '../../shared/types.js';
import { socket } from '../socket.js';
import { getRoomToken, getSavedNickname, saveNickname, saveRoomToken } from '../storage.js';
import { GameTable } from './GameTable.js';
import { Lobby } from './Lobby.js';

interface RoomPageProps {
  code: string;
  navigate: (path: string) => void;
}

export function RoomPage({ code, navigate }: RoomPageProps) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [nickname, setNickname] = useState(getSavedNickname());
  const [needsNickname, setNeedsNickname] = useState(!getRoomToken(code) && !getSavedNickname());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const storeIdentity = (identity: RoomIdentity, chosenNickname?: string) => {
    saveRoomToken(identity.code, identity.playerToken);
    if (chosenNickname?.trim()) saveNickname(chosenNickname.trim());
  };

  const join = useCallback((chosenNickname?: string) => {
    const token = getRoomToken(code);
    const knownNickname = chosenNickname ?? getSavedNickname();
    if (!token && !knownNickname.trim()) {
      setNeedsNickname(true);
      return;
    }
    socket.emit('room:join', { code, nickname: knownNickname, playerToken: token || undefined }, (result) => {
      if (!result.ok) {
        setError(result.error);
        if (!token) setNeedsNickname(true);
        return;
      }
      storeIdentity(result.data, knownNickname);
      setNeedsNickname(false);
      setError('');
    });
  }, [code]);

  const syncRoom = useCallback(() => {
    const playerToken = getRoomToken(code);
    if (!playerToken || !socket.connected) return;
    socket.emit('room:sync', { code, playerToken }, (result) => {
      if (!result.ok) join();
    });
  }, [code, join]);

  useEffect(() => {
    const onState = (next: RoomSnapshot) => {
      if (next.code === code) setSnapshot(next);
    };
    const onGameError = (message: string) => {
      setError(message);
      window.setTimeout(() => setError((current) => current === message ? '' : current), 4_500);
    };
    const onConnect = () => join();
    const onResume = () => {
      if (document.visibilityState === 'visible') syncRoom();
    };
    socket.on('room:state', onState);
    socket.on('game:error', onGameError);
    socket.on('connect', onConnect);
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', syncRoom);
    window.addEventListener('pageshow', syncRoom);
    if (socket.connected) join();
    return () => {
      socket.off('room:state', onState);
      socket.off('game:error', onGameError);
      socket.off('connect', onConnect);
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', syncRoom);
      window.removeEventListener('pageshow', syncRoom);
    };
  }, [code, join, syncRoom]);

  useEffect(() => {
    if (snapshot?.phase !== 'lobby') return;
    const timer = window.setInterval(syncRoom, 2_000);
    return () => window.clearInterval(timer);
  }, [snapshot?.phase, syncRoom]);

  const action = (emit: (ack: (result: Ack) => void) => void, successNotice = '') => {
    setBusy(true);
    setError('');
    emit((result) => {
      setBusy(false);
      if (!result.ok) setError(result.error);
      else if (successNotice) setNotice(successNotice);
    });
  };

  const share = async () => {
    const url = `${window.location.origin}/room/${code}`;
    const data = { title: '数字牌局', text: `来加入我的数字牌局，房间码 ${code}`, url };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(url);
        setNotice('房间链接已复制');
      }
    } catch (shareError) {
      if ((shareError as DOMException).name !== 'AbortError') setError('分享失败，请复制浏览器地址');
    }
  };

  const submitNickname = () => {
    if (!nickname.trim()) {
      setError('请输入昵称');
      return;
    }
    setBusy(true);
    socket.emit('room:join', { code, nickname }, (result) => {
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      storeIdentity(result.data, nickname);
      setNeedsNickname(false);
      setError('');
    });
  };

  if (needsNickname) {
    return (
      <main className="entry-page">
        <section className="join-card">
          <p className="eyebrow">加入房间 {code}</p>
          <h1>朋友在等你</h1>
          <label htmlFor="room-nickname">你的昵称</label>
          <input id="room-nickname" value={nickname} maxLength={12} autoFocus placeholder="1–12 个字符" onChange={(event) => setNickname(event.target.value)} />
          <button className="button button--primary button--large" disabled={busy} onClick={submitNickname}>加入游戏</button>
          <button className="button button--ghost" onClick={() => navigate('/')}>返回首页</button>
          {error && <p className="form-error" role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="loading-page">
        <div className="loading-tiles"><span>3</span><span>6</span><span>9</span></div>
        <p>{error || '正在进入房间…'}</p>
        {error && <button className="button button--ghost" onClick={() => navigate('/')}>返回首页</button>}
      </main>
    );
  }

  if (snapshot.phase === 'lobby') {
    return (
      <Lobby
        snapshot={snapshot}
        busy={busy}
        error={error}
        onShare={share}
        onStart={() => action((ack) => socket.emit('game:start', ack))}
      />
    );
  }

  const submitBoard = (board: BoardGroup[]) => {
    action((ack) => socket.emit('game:submit', {
      turnNumber: snapshot.game!.turnNumber,
      groups: board.map((group) => ({ id: group.id, tileIds: group.tiles.map((tile) => tile.id) })),
    }, ack));
  };

  return (
    <GameTable
      snapshot={snapshot}
      busy={busy}
      error={error}
      notice={notice}
      onError={(message) => {
        setError(message);
        window.setTimeout(() => setError((current) => current === message ? '' : current), 3_500);
      }}
      onShare={share}
      onDraw={() => action((ack) => socket.emit('game:draw', ack))}
      onSubmit={submitBoard}
      onRematch={() => action((ack) => socket.emit('game:rematch', ack))}
      onReturnLobby={() => action((ack) => socket.emit('game:returnLobby', ack))}
    />
  );
}
