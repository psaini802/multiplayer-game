import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import socket from '../socket';
import { useGame } from '../context/GameContext';
import Chat from '../components/Chat';

const ROWS = 6, COLS = 7;
const COLORS = { R: '#6c63ff', Y: '#ffd700' };

export default function ConnectFourGame() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { player, showToast } = useGame();
  const hasJoined = useRef(false);

  const [status, setStatus]     = useState('waiting');
  const [gameState, setGS]      = useState(null);
  const [mySymbol, setMySymbol] = useState(null);
  const [hoverCol, setHoverCol] = useState(null);
  const [winner, setWinner]     = useState(null);
  const [players, setPlayers]   = useState([]);
  const [chat, setChat]         = useState([]);
  const [lastDrop, setLastDrop] = useState(null); // {row, col} for animation

  // Resolve C4 token ('R'/'Y') by matching username in gameState.players
  const myToken  = gameState && player
    ? Object.keys(gameState.players || {}).find(t => gameState.players[t].username === player.username)
    : null;
  const isMyTurn = gameState && myToken && gameState.currentTurn === myToken;
  const myColor  = myToken ? COLORS[myToken] : null;

  useEffect(() => {
    if (!player) { navigate('/'); return; }

    function onError({ message }) {
      if (message === 'Not registered') {
        socket.once('registered', () => socket.emit('join_room', { code }));
      } else {
        showToast(message, 'error');
        navigate('/lobby');
      }
    }

    function onJoined({ symbol, room }) {
      setMySymbol(symbol);
      setPlayers(room.players);
      setChat(room.chat || []);
      if (room.gameState) { setGS(room.gameState); setStatus(room.status); }
    }

    function onGameStart(room) {
      setStatus('playing');
      setPlayers(room.players);
      if (room.gameState) setGS(room.gameState);
    }

    function onC4Update({ gameState: gs, col, row, token }) {
      setGS({ ...gs });
      setLastDrop({ row, col, token });
      setTimeout(() => setLastDrop(null), 400);
    }

    function onC4Over({ winner: w, winCells, gameState: gs }) {
      setGS({ ...gs, winCells });
      setWinner(w);
      setStatus('finished');
    }

    function onPlayerJoined(room) { setPlayers(room.players); }
    function onRejoined({ symbol, room }) { onJoined({ symbol, room }); }
    function onChat(msg) { setChat(prev => [...prev.slice(-99), msg]); }

    socket.on('error',          onError);
    socket.on('room_joined',    onJoined);
    socket.on('room_rejoined',  onRejoined);
    socket.on('game_start',     onGameStart);
    socket.on('player_joined',  onPlayerJoined);
    socket.on('c4_update',      onC4Update);
    socket.on('c4_over',        onC4Over);
    socket.on('chat_message',   onChat);

    if (!hasJoined.current) {
      hasJoined.current = true;
      socket.emit('join_room', { code });
    }

    const onBeforeUnload = () => socket.emit('leave_room', { code });
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      socket.off('error',         onError);
      socket.off('room_joined',   onJoined);
      socket.off('room_rejoined', onRejoined);
      socket.off('game_start',    onGameStart);
      socket.off('player_joined', onPlayerJoined);
      socket.off('c4_update',     onC4Update);
      socket.off('c4_over',       onC4Over);
      socket.off('chat_message',  onChat);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [code, player, navigate, showToast]);

  const handleDrop = (col) => {
    if (!isMyTurn || status !== 'playing') return;
    socket.emit('c4_drop', { code, col });
  };

  const handleLeave = () => {
    socket.emit('leave_room', { code });
    navigate('/lobby');
  };

  const sendChat = (msg) => socket.emit('send_chat', { code, message: msg });

  function cellStyle(r, c) {
    const gs = gameState;
    if (!gs) return {};
    const token = gs.board[r]?.[c];
    const isWin = gs.winCells?.some(([wr, wc]) => wr === r && wc === c);
    const isNew = lastDrop && lastDrop.row === r && lastDrop.col === c;

    if (!token) return {};
    return {
      background: COLORS[token] || 'transparent',
      boxShadow: isWin
        ? `0 0 18px 6px ${COLORS[token]}, 0 0 4px ${COLORS[token]}`
        : `0 0 10px 2px ${COLORS[token]}66`,
      transform: isNew ? 'scale(1.1)' : 'scale(1)',
      transition: 'transform 0.2s ease',
    };
  }

  const playerR = gameState?.players?.R;
  const playerY = gameState?.players?.Y;

  return (
    <div className="c4-page">
      {/* Header */}
      <div className="c4-header">
        <div className={`c4-player-badge ${gameState?.currentTurn === 'R' && status === 'playing' ? 'active' : ''}`} style={{ '--badge-color': COLORS.R }}>
          <div className="c4-token-dot" style={{ background: COLORS.R }} />
          <span>{playerR?.username || players[0]?.username || '...'}</span>
          {gameState?.currentTurn === 'R' && status === 'playing' && <span className="c4-turn-arrow">▶ Turn</span>}
        </div>

        <div className="c4-vs-badge">
          <span style={{ fontSize: '1.5rem' }}>🔴</span>
          <span>Connect Four</span>
        </div>

        <div className={`c4-player-badge ${gameState?.currentTurn === 'Y' && status === 'playing' ? 'active' : ''}`} style={{ '--badge-color': COLORS.Y }}>
          {gameState?.currentTurn === 'Y' && status === 'playing' && <span className="c4-turn-arrow">Turn ◀</span>}
          <span>{playerY?.username || players[1]?.username || '...'}</span>
          <div className="c4-token-dot" style={{ background: COLORS.Y }} />
        </div>
      </div>

      {/* Turn indicator */}
      {status === 'playing' && (
        <div className="c4-turn-indicator" style={{ color: isMyTurn ? myColor : 'var(--text-muted)' }}>
          {isMyTurn ? '⚡ Your turn — click a column' : "Opponent's turn..."}
        </div>
      )}

      {/* Board */}
      <div className="c4-board-wrap">
        {/* Column hover arrows */}
        {status === 'playing' && isMyTurn && (
          <div className="c4-col-arrows">
            {Array.from({ length: COLS }, (_, c) => (
              <div
                key={c}
                className={`c4-col-arrow ${hoverCol === c ? 'visible' : ''}`}
                style={{ color: myColor }}
              >▼</div>
            ))}
          </div>
        )}

        <div
          className="c4-board"
          onMouseLeave={() => setHoverCol(null)}
        >
          {/* Clickable column overlays */}
          <div className="c4-col-hitboxes">
            {Array.from({ length: COLS }, (_, c) => (
              <div
                key={c}
                className={`c4-col-hitbox ${hoverCol === c && isMyTurn && status === 'playing' ? 'hovered' : ''}`}
                style={{ '--col-color': myColor || 'transparent' }}
                onMouseEnter={() => setHoverCol(c)}
                onClick={() => handleDrop(c)}
              />
            ))}
          </div>

          {/* Grid */}
          {Array.from({ length: ROWS }, (_, r) => (
            <div key={r} className="c4-row">
              {Array.from({ length: COLS }, (_, c) => (
                <div
                  key={c}
                  className={`c4-cell ${!gameState?.board[r]?.[c] ? 'empty' : ''} ${gameState?.winCells?.some(([wr, wc]) => wr===r && wc===c) ? 'win-cell' : ''}`}
                >
                  <div className="c4-token" style={cellStyle(r, c)} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Waiting overlay */}
      {status === 'waiting' && (
        <div className="game-overlay">
          <div className="game-overlay-card">
            <div style={{ fontSize: '3rem' }}>🔴</div>
            <h2>Connect Four</h2>
            <p>Room Code: <strong style={{ color: 'var(--primary)' }}>{code}</strong></p>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Waiting for opponent...</p>
          </div>
        </div>
      )}

      {/* Game over overlay */}
      {status === 'finished' && (
        <div className="game-overlay">
          <div className="game-overlay-card">
            <div style={{ fontSize: '3rem' }}>{winner === player?.username ? '🏆' : winner === 'draw' ? '🤝' : '💀'}</div>
            <h2 style={{ color: winner === player?.username ? 'var(--primary)' : winner === 'draw' ? 'var(--gold)' : 'var(--danger)' }}>
              {winner === player?.username ? 'You Win!' : winner === 'draw' ? "It's a Draw!" : `${winner} Wins!`}
            </h2>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => navigate('/lobby')}>Back to Lobby</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
        <button className="btn btn-ghost" onClick={handleLeave}>Leave Game</button>
      </div>

      <Chat messages={chat} myUsername={player?.username} onSend={sendChat} />
    </div>
  );
}
