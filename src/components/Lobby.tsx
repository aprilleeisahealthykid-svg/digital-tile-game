import type { RoomSnapshot } from '../../shared/types.js';

interface LobbyProps {
  snapshot: RoomSnapshot;
  busy: boolean;
  error: string;
  onStart: () => void;
  onShare: () => void;
}

export function Lobby({ snapshot, busy, error, onStart, onShare }: LobbyProps) {
  const isHost = snapshot.meId === snapshot.hostId;
  return (
    <main className="lobby-page">
      <header className="room-header">
        <div>
          <span className="eyebrow">等待开局</span>
          <h1>房间 {snapshot.code}</h1>
        </div>
        <button className="button button--ghost" onClick={onShare}>分享链接</button>
      </header>

      <section className="lobby-card">
        <div className="lobby-code">
          <span>房间码</span>
          <strong>{snapshot.code}</strong>
          <small>朋友也可以在首页输入这个码</small>
        </div>
        <div className="player-list" aria-label="玩家列表">
          {snapshot.players.map((player, index) => (
            <div className="player-row" key={player.id}>
              <span className={`player-avatar avatar-${index + 1}`}>{player.nickname.slice(0, 1)}</span>
              <div>
                <strong>{player.nickname}{player.id === snapshot.meId ? '（我）' : ''}</strong>
                <small>{player.isHost ? '房主' : '玩家'} · {player.connected ? '已连接' : '等待重连'}</small>
              </div>
              <span className={`status-dot ${player.connected ? 'online' : ''}`} />
            </div>
          ))}
          {Array.from({ length: 4 - snapshot.players.length }, (_, index) => (
            <div className="player-row player-row--empty" key={`empty-${index}`}>
              <span className="player-avatar">＋</span>
              <span>等待朋友加入</span>
            </div>
          ))}
        </div>
        {isHost ? (
          <button
            className="button button--primary button--large"
            disabled={busy || snapshot.players.length < 2 || snapshot.players.some((player) => !player.connected)}
            onClick={onStart}
          >
            开始游戏
          </button>
        ) : (
          <p className="waiting-note">等待房主开始游戏…</p>
        )}
        {snapshot.players.length < 2 && <p className="helper-text">至少 2 人即可开始</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
