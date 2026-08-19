import { useState } from 'react';
import type { Ack, GameMode, RoomIdentity } from '../../shared/types.js';
import { socket } from '../socket.js';
import { getSavedNickname, saveNickname, saveRoomToken } from '../storage.js';

interface HomePageProps {
  navigate: (path: string) => void;
}

export function HomePage({ navigate }: HomePageProps) {
  const [nickname, setNickname] = useState(getSavedNickname());
  const [roomCode, setRoomCode] = useState('');
  const [gameMode, setGameMode] = useState<GameMode>('timed');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleIdentity = (result: Ack<RoomIdentity>, chosenNickname: string) => {
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    saveNickname(chosenNickname.trim());
    saveRoomToken(result.data.code, result.data.playerToken);
    navigate(`/room/${result.data.code}`);
  };

  const createRoom = () => {
    if (!nickname.trim()) {
      setError('请先输入昵称');
      return;
    }
    setBusy(true);
    setError('');
    socket.emit('room:create', { nickname, mode: gameMode }, (result) => handleIdentity(result, nickname));
  };

  const joinRoom = () => {
    if (!nickname.trim()) {
      setError('请先输入昵称');
      return;
    }
    const code = roomCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setError('请输入 6 位房间码');
      return;
    }
    setBusy(true);
    setError('');
    socket.emit('room:join', { code, nickname }, (result) => handleIdentity(result, nickname));
  };

  return (
    <main className="home-page">
      <section className="brand-panel" aria-labelledby="home-title">
        <div className="brand-mark" aria-hidden="true">
          <span>3</span><span>6</span><span>9</span>
        </div>
        <p className="eyebrow">2–4 人 · 在线牌桌</p>
        <h1 id="home-title">数字牌局</h1>
        <p className="home-intro">凑成同点数组或连续数字，率先打完手牌。</p>
      </section>

      <section className="join-card" aria-label="进入游戏">
        <label htmlFor="nickname">你的昵称</label>
        <input
          id="nickname"
          value={nickname}
          maxLength={12}
          autoComplete="nickname"
          placeholder="例如：小林"
          onChange={(event) => setNickname(event.target.value)}
        />
        <div className="mode-picker" role="radiogroup" aria-label="游戏模式">
          <span className="mode-picker__label">选择游戏模式</span>
          <div className="mode-options">
            <button
              type="button"
              role="radio"
              aria-checked={gameMode === 'timed'}
              className={gameMode === 'timed' ? 'mode-option mode-option--selected' : 'mode-option'}
              onClick={() => setGameMode('timed')}
            >
              <strong>55 秒模式</strong>
              <small>超时自动摸牌并换人</small>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={gameMode === 'relaxed'}
              className={gameMode === 'relaxed' ? 'mode-option mode-option--selected' : 'mode-option'}
              onClick={() => setGameMode('relaxed')}
            >
              <strong>自由模式</strong>
              <small>每回合不限时间</small>
            </button>
          </div>
        </div>
        <button className="button button--primary button--large" disabled={busy} onClick={createRoom}>
          创建房间
        </button>
        <div className="join-divider"><span>或加入朋友的房间</span></div>
        <div className="code-row">
          <input
            aria-label="6 位房间码"
            value={roomCode}
            maxLength={6}
            autoCapitalize="characters"
            placeholder="房间码"
            onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
          />
          <button className="button button--secondary" disabled={busy} onClick={joinRoom}>
            加入房间
          </button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>

      <p className="home-footnote">无需注册 · 无广告 · 刷新后可自动重连</p>
    </main>
  );
}
