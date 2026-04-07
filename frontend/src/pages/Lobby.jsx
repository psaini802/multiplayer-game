import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import socket from '../socket';

const GAMES = [
  { id: 'tictactoe',   label: 'Tic Tac Toe',  icon: '✕○', color: 'var(--primary)', desc: '2 players · Strategy', path: '/game'  },
  { id: 'snake',       label: 'Arena Snake',  icon: '🐍', color: 'var(--accent)',  desc: '2–4 players · Action', path: '/snake' },
  { id: 'dice',        label: 'Dice Racing',  icon: '🎲', color: 'var(--gold)',    desc: '2–4 players · Racing', path: '/dice'  },
  { id: 'pong',        label: 'Pong',         icon: '🏓', color: '#00e5ff',        desc: '2 players · Real-time',path: '/pong'  },
  { id: 'connectfour', label: 'Connect Four', icon: '🔴', color: '#ffd700',        desc: '2 players · Strategy', path: '/c4'    },
  { id: 'rps',         label: 'RPS Battle',   icon: '✂️', color: '#ff6b9d',        desc: '2 players · Best of 5',path: '/rps'   },
];

export default function Lobby() {
  const { player, logout, showToast } = useGame();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const defaultGame = GAMES.find(g => g.id === searchParams.get('game'))?.id || 'tictactoe';
  const [activeGame, setActiveGame] = useState(defaultGame);
  const [rooms, setRooms] = useState([]);
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchRooms = useCallback(() => socket.emit('get_rooms'), []);

  useEffect(() => {
    const onRoomsList = setRooms;
    const onRoomsUpdated = fetchRooms;
    const onRoomCreated = ({ code, gameType }) => {
      setCreating(false);
      const game = GAMES.find(g => g.id === gameType);
      navigate(`${game?.path || '/game'}/${code}`);
    };
    const onRoomDiscovered = ({ code, gameType }) => {
      const game = GAMES.find(g => g.id === gameType);
      navigate(`${game?.path || '/game'}/${code}`);
    };
    const onError = ({ message }) => { showToast(message, 'error'); setCreating(false); };

    socket.on('rooms_list',     onRoomsList);
    socket.on('rooms_updated',  onRoomsUpdated);
    socket.on('room_created',   onRoomCreated);
    socket.on('room_discovered',onRoomDiscovered);
    socket.on('error',          onError);
    fetchRooms();

    return () => {
      socket.off('rooms_list',     onRoomsList);
      socket.off('rooms_updated',  onRoomsUpdated);
      socket.off('room_created',   onRoomCreated);
      socket.off('room_discovered',onRoomDiscovered);
      socket.off('error',          onError);
    };
  }, [fetchRooms, navigate, showToast]);

  const handleCreate = () => {
    setCreating(true);
    socket.emit('create_room', { gameType: activeGame });
  };

  const handleJoin = (e) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code || code.length < 4) return;
    // We don't know the game type yet — server will tell us via room_joined
    // Navigate to game detection page via lobby join logic
    const room = rooms.find(r => r.code === code);
    if (room) {
      const game = GAMES.find(g => g.id === room.gameType);
      navigate(`${game?.path || '/game'}/${code}`);
    } else {
      // Discover game type first, then navigate
      socket.emit('discover_room', { code });
      // room_discovered handler will navigate; if not found, error handler fires
    }
  };

  const handleQuickJoin = (room) => {
    const game = GAMES.find(g => g.id === room.gameType);
    navigate(`${game?.path || '/game'}/${room.code}`);
  };

  const filteredRooms = rooms.filter(r => r.gameType === activeGame);
  const activeGameInfo = GAMES.find(g => g.id === activeGame);

  return (
    <>
      <div className="page-bg" />
      <div className="page lobby">
        {/* Header */}
        <div className="lobby-header card">
          <span className="lobby-title">ARCADE LOBBY</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link to="/leaderboard" className="btn btn-ghost" style={{ padding: '8px 16px', fontSize: '0.82rem' }}>
              🏆 Ranks
            </Link>
            <div className="player-pill">
              <span>👤</span>
              <span style={{ fontWeight: 600 }}>{player?.username}</span>
              <span className="player-pill-elo">{player?.elo_rating} ELO</span>
            </div>
            <button className="btn btn-ghost" style={{ padding: '8px 14px' }} onClick={logout} title="Log out">⏻</button>
          </div>
        </div>

        {/* Game selector tabs */}
        <div style={{ maxWidth: 900, margin: '0 auto 20px', display: 'flex', gap: 10 }}>
          {GAMES.map(g => (
            <button
              key={g.id}
              className={`game-tab ${activeGame === g.id ? 'active' : ''}`}
              style={{ '--tab-color': g.color }}
              onClick={() => setActiveGame(g.id)}
            >
              <span className="game-tab-icon">{g.icon}</span>
              <div>
                <div className="game-tab-label">{g.label}</div>
                <div className="game-tab-desc">{g.desc}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="lobby-body">
          {/* Room list */}
          <div>
            <div className="lobby-section-title">Open Rooms — {activeGameInfo?.label}</div>
            <div className="rooms-list">
              {filteredRooms.length === 0 ? (
                <div className="rooms-empty">
                  <span style={{ fontSize: '1.5rem' }}>{activeGameInfo?.icon}</span>
                  <span>No open rooms — create one!</span>
                </div>
              ) : (
                filteredRooms.map(room => (
                  <div key={room.code} className="room-row" onClick={() => handleQuickJoin(room)}>
                    <div>
                      <div className="room-code">{room.code}</div>
                      <div className="room-host">
                        Host: {room.host}
                        <span style={{ marginLeft: 10, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                          {room.playerCount}/{room.maxPlayers} players
                        </span>
                      </div>
                    </div>
                    <button className="btn btn-secondary" style={{ padding: '8px 20px', fontSize: '0.82rem' }}>
                      Join
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="lobby-side">
            <div className="card lobby-panel">
              <div className="lobby-section-title">Create Room</div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                Start a new <strong style={{ color: activeGameInfo?.color }}>{activeGameInfo?.label}</strong> room and share the code.
              </p>
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? '⏳ Creating…' : `✚ Create ${activeGameInfo?.label} Room`}
              </button>
            </div>

            <div className="card lobby-panel">
              <div className="lobby-section-title">Join by Code</div>
              <form style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={handleJoin}>
                <input
                  className="input"
                  placeholder="ROOM CODE"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  maxLength={6}
                  style={{ textAlign: 'center', fontFamily: 'Orbitron', fontSize: '1.1rem', letterSpacing: '0.15em', textTransform: 'uppercase' }}
                  spellCheck={false}
                />
                <button type="submit" className="btn btn-secondary" disabled={joinCode.trim().length < 4}>
                  Join Room
                </button>
              </form>
            </div>

            <div className="card lobby-panel">
              <div className="lobby-section-title">Your Stats</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, textAlign: 'center' }}>
                {[
                  { label: 'Wins',   value: player?.wins   ?? 0, color: '#4caf50' },
                  { label: 'Draws',  value: player?.draws  ?? 0, color: 'var(--gold)' },
                  { label: 'Losses', value: player?.losses ?? 0, color: 'var(--secondary)' },
                ].map(s => (
                  <div key={s.label} style={{ padding: '10px 0', background: 'rgba(255,255,255,.03)', borderRadius: 8 }}>
                    <div style={{ fontFamily: 'Orbitron', fontWeight: 700, fontSize: '1.2rem', color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, textAlign: 'center' }}>
                <span style={{ fontFamily: 'Orbitron', fontSize: '1.1rem', color: 'var(--primary)', fontWeight: 700 }}>
                  {player?.elo_rating}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 6 }}>ELO</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
