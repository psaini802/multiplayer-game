import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import socket from '../socket';
import { useGame } from '../context/GameContext';
import Chat from '../components/Chat';

const W = 600, H = 400;

export default function PongGame() {
  const { code } = useParams();
  const navigate  = useNavigate();
  const { player, showToast } = useGame();
  const canvasRef = useRef(null);
  const gsRef     = useRef(null);
  const hasJoined = useRef(false);
  const rafRef    = useRef(null);

  const [status, setStatus]   = useState('waiting');  // waiting | playing | finished
  const [mySymbol, setMySymbol] = useState(null);
  const [players, setPlayers]  = useState([]);
  const [winner, setWinner]   = useState(null);
  const [scores, setScores]   = useState({ left: 0, right: 0 });
  const [mySide, setMySide]   = useState(null); // 'left' | 'right'
  const [chat, setChat]       = useState([]);

  // ── Canvas renderer ────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const gs = gsRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !gs) return;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#060616';
    ctx.fillRect(0, 0, W, H);

    // Center line
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.setLineDash([12, 10]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Left paddle
    const lp = gs.paddles.left;
    ctx.shadowColor = '#6c63ff'; ctx.shadowBlur = 18;
    ctx.fillStyle = '#6c63ff';
    ctx.beginPath();
    ctx.roundRect(lp.x, lp.y, gs.paddle.W, gs.paddle.H, 4);
    ctx.fill();

    // Right paddle
    const rp = gs.paddles.right;
    ctx.shadowColor = '#ff6b9d'; ctx.shadowBlur = 18;
    ctx.fillStyle = '#ff6b9d';
    ctx.beginPath();
    ctx.roundRect(rp.x, rp.y, gs.paddle.W, gs.paddle.H, 4);
    ctx.fill();

    // Ball
    ctx.shadowColor = '#fff'; ctx.shadowBlur = 24;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(gs.ball.x, gs.ball.y, gs.ballR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Player labels near paddles
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(lp.username, lp.x + gs.paddle.W / 2, lp.y - 6);
    ctx.fillText(rp.username, rp.x + gs.paddle.W / 2, rp.y - 6);
  }, []);

  const loop = useCallback(() => {
    draw();
    rafRef.current = requestAnimationFrame(loop);
  }, [draw]);

  // ── Socket events ──────────────────────────────────────────────────────
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
      if (room.gameState) {
        gsRef.current = room.gameState;
        setScores({ ...room.gameState.scores });
        setMySide(room.gameState.paddles.left.username === player.username ? 'left' : 'right');
        setStatus(room.status);
        if (room.status === 'playing' && !rafRef.current) rafRef.current = requestAnimationFrame(loop);
      }
    }

    function onGameStart(room) {
      setStatus('playing');
      setPlayers(room.players);
      if (room.gameState) {
        gsRef.current = room.gameState;
        setScores({ ...room.gameState.scores });
        setMySide(room.gameState.paddles.left.username === player.username ? 'left' : 'right');
        if (!rafRef.current) rafRef.current = requestAnimationFrame(loop);
      }
    }

    function onTick(gs) {
      gsRef.current = gs;
      setScores({ ...gs.scores });
    }

    function onOver({ winner: w }) {
      setWinner(w);
      setStatus('finished');
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      draw();
    }

    function onChat(msg) { setChat(prev => [...prev.slice(-99), msg]); }
    function onPlayerJoined(room) { setPlayers(room.players); }
    function onRejoined({ symbol, room }) { onJoined({ symbol, room }); }

    socket.on('error', onError);
    socket.on('room_joined',    onJoined);
    socket.on('room_rejoined',  onRejoined);
    socket.on('game_start',     onGameStart);
    socket.on('player_joined',  onPlayerJoined);
    socket.on('pong_tick',      onTick);
    socket.on('pong_over',      onOver);
    socket.on('chat_message',   onChat);

    if (!hasJoined.current) {
      hasJoined.current = true;
      socket.emit('join_room', { code });
    }

    const onBeforeUnload = () => socket.emit('leave_room', { code });
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      socket.off('error', onError);
      socket.off('room_joined',   onJoined);
      socket.off('room_rejoined', onRejoined);
      socket.off('game_start',    onGameStart);
      socket.off('player_joined', onPlayerJoined);
      socket.off('pong_tick',     onTick);
      socket.off('pong_over',     onOver);
      socket.off('chat_message',  onChat);
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [code, player, navigate, showToast, loop, draw]);

  // ── Keyboard controls ──────────────────────────────────────────────────
  useEffect(() => {
    const keys = {};
    function sendPaddle() {
      const dy = (keys['ArrowDown'] || keys['s'] || keys['S']) ? 1
               : (keys['ArrowUp']   || keys['w'] || keys['W']) ? -1 : 0;
      socket.emit('pong_paddle', { code, dy });
    }
    function onKeyDown(e) {
      if (['ArrowUp','ArrowDown','w','s','W','S'].includes(e.key)) {
        e.preventDefault();
        keys[e.key] = true;
        sendPaddle();
      }
    }
    function onKeyUp(e) {
      if (['ArrowUp','ArrowDown','w','s','W','S'].includes(e.key)) {
        delete keys[e.key];
        sendPaddle();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
    };
  }, [code]);

  const handleLeave = () => {
    socket.emit('leave_room', { code });
    navigate('/lobby');
  };

  const sendChat = (msg) => socket.emit('send_chat', { code, message: msg });

  const opponent = players.find(p => p.username !== player?.username);
  const me       = players.find(p => p.username === player?.username);

  return (
    <div className="pong-page">
      <div className="pong-header">
        <div className="pong-player-info left-player">
          <span className="pong-name" style={{ color: '#6c63ff' }}>{players[0]?.username || '...'}</span>
          <span className="pong-score left-score">{scores.left}</span>
        </div>
        <div className="pong-center-info">
          <span className="pong-vs">VS</span>
          {status === 'waiting' && <div className="pong-waiting-text">Waiting for opponent...</div>}
        </div>
        <div className="pong-player-info right-player">
          <span className="pong-score right-score">{scores.right}</span>
          <span className="pong-name" style={{ color: '#ff6b9d' }}>{players[1]?.username || '...'}</span>
        </div>
      </div>

      <div className="pong-arena">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="pong-canvas"
        />

        {status === 'waiting' && (
          <div className="pong-overlay">
            <div className="pong-overlay-card">
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🏓</div>
              <h2>Pong</h2>
              <p>Room Code: <strong style={{ color: 'var(--primary)' }}>{code}</strong></p>
              <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                Waiting for opponent to join...
              </p>
              <div style={{ marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Controls: <kbd>W</kbd>/<kbd>S</kbd> or <kbd>↑</kbd>/<kbd>↓</kbd>
              </div>
            </div>
          </div>
        )}

        {status === 'finished' && (
          <div className="pong-overlay">
            <div className="pong-overlay-card">
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>
                {winner === player?.username ? '🏆' : '💀'}
              </div>
              <h2 style={{ color: winner === player?.username ? 'var(--primary)' : 'var(--danger)' }}>
                {winner === player?.username ? 'You Win!' : winner ? `${winner} Wins!` : 'Game Over'}
              </h2>
              <div className="pong-final-score">
                <span style={{ color: '#6c63ff' }}>{scores.left}</span>
                <span style={{ color: 'var(--text-muted)' }}> : </span>
                <span style={{ color: '#ff6b9d' }}>{scores.right}</span>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'center' }}>
                <button className="btn btn-primary" onClick={() => navigate('/lobby')}>Back to Lobby</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="pong-controls-hint">
        <span>Your side: <strong style={{ color: mySide === 'left' ? '#6c63ff' : '#ff6b9d' }}>{mySide || '...'}</strong></span>
        <span style={{ margin: '0 1rem', color: 'var(--text-muted)' }}>|</span>
        <span>Controls: <kbd>W</kbd>/<kbd>S</kbd> or <kbd>↑</kbd>/<kbd>↓</kbd></span>
        <button className="btn btn-ghost" style={{ marginLeft: '1.5rem', padding: '0.25rem 0.75rem', fontSize: '0.8rem' }} onClick={handleLeave}>Leave</button>
      </div>

      <Chat messages={chat} myUsername={player?.username} onSend={sendChat} />
    </div>
  );
}
