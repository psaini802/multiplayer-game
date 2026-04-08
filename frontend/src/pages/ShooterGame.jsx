import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import socket from '../socket';
import { useGame } from '../context/GameContext';
import Chat from '../components/Chat';

const CW = 800, CH = 560;
const PLAYER_R = 16, BULLET_R = 5;

// ── Canvas draw ────────────────────────────────────────────────────────────
function drawScene(ctx, gs, myUsername) {
  if (!gs) return;

  // Background
  ctx.fillStyle = '#06060e';
  ctx.fillRect(0, 0, CW, CH);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x < CW; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CH); ctx.stroke(); }
  for (let y = 0; y < CH; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke(); }

  // Border
  ctx.strokeStyle = 'rgba(108,99,255,0.3)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, CW - 2, CH - 2);

  // Obstacles
  for (const o of (gs.obstacles || [])) {
    ctx.shadowColor = '#6c63ff'; ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(108,99,255,0.25)';
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.strokeStyle = 'rgba(108,99,255,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(o.x, o.y, o.w, o.h);
  }
  ctx.shadowBlur = 0;

  // Bullets
  for (const b of (gs.bullets || [])) {
    ctx.shadowColor = b.color || '#fff'; ctx.shadowBlur = 14;
    ctx.fillStyle = b.color || '#fff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, BULLET_R, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // Players
  for (const p of Object.values(gs.players || {})) {
    const isMe = p.username === myUsername;

    if (!p.alive) {
      // Skull for dead players
      ctx.globalAlpha = 0.4;
      ctx.font = '22px serif'; ctx.textAlign = 'center';
      ctx.fillText('💀', p.x, p.y + 8);
      ctx.globalAlpha = 1;
      continue;
    }

    // Glow ring for self
    if (isMe) {
      ctx.shadowColor = p.color; ctx.shadowBlur = 20;
      ctx.strokeStyle = p.color + '66';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER_R + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Body
    ctx.shadowColor = p.color; ctx.shadowBlur = 16;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_R, 0, Math.PI * 2);
    ctx.fill();

    // Aim indicator
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#fff'; ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.angle) * PLAYER_R, p.y + Math.sin(p.angle) * PLAYER_R);
    ctx.lineTo(p.x + Math.cos(p.angle) * (PLAYER_R + 12), p.y + Math.sin(p.angle) * (PLAYER_R + 12));
    ctx.stroke();
    ctx.shadowBlur = 0;

    // HP bar
    const barW = 36, barH = 5;
    const bx = p.x - barW / 2, by = p.y - PLAYER_R - 14;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx, by, barW, barH);
    const hpFrac = Math.max(0, p.hp / (gs.maxHp || 100));
    ctx.fillStyle = hpFrac > 0.5 ? '#4caf50' : hpFrac > 0.25 ? '#ffd700' : '#ff4444';
    ctx.fillRect(bx, by, barW * hpFrac, barH);

    // Name label
    ctx.shadowBlur = 0;
    ctx.fillStyle = isMe ? '#fff' : 'rgba(255,255,255,0.65)';
    ctx.font = isMe ? 'bold 11px Inter,sans-serif' : '10px Inter,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.username, p.x, p.y - PLAYER_R - 18);
  }
  ctx.shadowBlur = 0;
}

// ──────────────────────────────────────────────────────────────────────────
export default function ShooterGame() {
  const { code }   = useParams();
  const navigate   = useNavigate();
  const { player, showToast } = useGame();
  const canvasRef  = useRef(null);
  const gsRef      = useRef(null);
  const rafRef     = useRef(null);
  const hasJoined  = useRef(false);
  const inputRef   = useRef({ keys: {}, angle: 0, shoot: false });
  const inputTimer = useRef(null);

  const [status, setStatus]       = useState('waiting');  // waiting|countdown|playing|finished
  const [countdown, setCountdown] = useState(null);
  const [players, setPlayers]     = useState([]);
  const [winner, setWinner]       = useState(null);
  const [scores, setScores]       = useState([]);
  const [killFeed, setKillFeed]   = useState([]);
  const [chat, setChat]           = useState([]);
  const [canStart, setCanStart]   = useState(false);
  const [amHost, setAmHost]       = useState(false);

  // ── Render loop ──────────────────────────────────────────────────────────
  const drawLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) drawScene(canvas.getContext('2d'), gsRef.current, player?.username);
    rafRef.current = requestAnimationFrame(drawLoop);
  }, [player]);

  // ── Socket events ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!player) { navigate('/'); return; }

    function onError({ message }) {
      if (message === 'Not registered') {
        socket.once('registered', () => socket.emit('join_room', { code }));
      } else { showToast(message, 'error'); navigate('/lobby'); }
    }

    function onJoined({ symbol, room }) {
      setPlayers(room.players);
      setChat(room.chat || []);
      setAmHost(room.players[0]?.username === player.username);
      setCanStart(room.players.length >= 2);
    }

    function onPlayerJoined(room) {
      setPlayers(room.players);
      setAmHost(room.players[0]?.username === player.username);
      setCanStart(room.players.length >= 2);
    }

    function onCountdown({ count }) {
      setStatus('countdown');
      setCountdown(count);
    }

    function onStart(room) {
      setStatus('playing');
      setPlayers(room.players);
      setCountdown(null);
      // Start render loop
      if (!rafRef.current) rafRef.current = requestAnimationFrame(drawLoop);
      // Start sending input
      inputTimer.current = setInterval(() => {
        const inp = inputRef.current;
        socket.emit('shooter_input', { code, keys: inp.keys, angle: inp.angle, shoot: inp.shoot });
        inp.shoot = false; // consume shoot flag
      }, 33);
    }

    function onTick(gs) { gsRef.current = gs; }

    function onKills(kills) {
      setKillFeed(prev => {
        const next = [...prev, ...kills.map(k => ({ ...k, id: Date.now() + Math.random() }))];
        return next.slice(-5);
      });
    }

    function onOver({ winner: w, scores: sc }) {
      setWinner(w);
      setScores(sc || []);
      setStatus('finished');
      clearInterval(inputTimer.current);
      // Final render
      setTimeout(() => {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }, 100);
    }

    function onRoomUpdated(room) {
      setPlayers(room.players);
      setCanStart(room.players.length >= 2);
      setAmHost(room.players[0]?.username === player.username);
    }

    function onRejoined({ symbol, room }) { onJoined({ symbol, room }); }
    function onChat(msg) { setChat(prev => [...prev.slice(-99), msg]); }

    socket.on('error',            onError);
    socket.on('room_joined',      onJoined);
    socket.on('room_rejoined',    onRejoined);
    socket.on('player_joined',    onPlayerJoined);
    socket.on('room_updated',     onRoomUpdated);
    socket.on('shooter_countdown',onCountdown);
    socket.on('shooter_start',    onStart);
    socket.on('shooter_tick',     onTick);
    socket.on('shooter_kills',    onKills);
    socket.on('shooter_over',     onOver);
    socket.on('chat_message',     onChat);

    if (!hasJoined.current) {
      hasJoined.current = true;
      socket.emit('join_room', { code });
    }

    const onBeforeUnload = () => socket.emit('leave_room', { code });
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      socket.off('error',             onError);
      socket.off('room_joined',       onJoined);
      socket.off('room_rejoined',     onRejoined);
      socket.off('player_joined',     onPlayerJoined);
      socket.off('room_updated',      onRoomUpdated);
      socket.off('shooter_countdown', onCountdown);
      socket.off('shooter_start',     onStart);
      socket.off('shooter_tick',      onTick);
      socket.off('shooter_kills',     onKills);
      socket.off('shooter_over',      onOver);
      socket.off('chat_message',      onChat);
      window.removeEventListener('beforeunload', onBeforeUnload);
      cancelAnimationFrame(rafRef.current);
      clearInterval(inputTimer.current);
    };
  }, [code, player, navigate, showToast, drawLoop]);

  // ── Keyboard input ────────────────────────────────────────────────────────
  useEffect(() => {
    const TRACKED = new Set(['w','a','s','d','W','A','S','D','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
    function onDown(e) {
      if (TRACKED.has(e.key)) {
        e.preventDefault();
        inputRef.current.keys[e.key.toLowerCase().replace('arrow','')] = true;
        // Arrow keys map too
        if (e.key === 'ArrowUp')    inputRef.current.keys.w = true;
        if (e.key === 'ArrowDown')  inputRef.current.keys.s = true;
        if (e.key === 'ArrowLeft')  inputRef.current.keys.a = true;
        if (e.key === 'ArrowRight') inputRef.current.keys.d = true;
      }
    }
    function onUp(e) {
      if (TRACKED.has(e.key)) {
        delete inputRef.current.keys[e.key.toLowerCase().replace('arrow','')];
        if (e.key === 'ArrowUp')    delete inputRef.current.keys.w;
        if (e.key === 'ArrowDown')  delete inputRef.current.keys.s;
        if (e.key === 'ArrowLeft')  delete inputRef.current.keys.a;
        if (e.key === 'ArrowRight') delete inputRef.current.keys.d;
      }
    }
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup',   onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, []);

  // ── Mouse aim + shoot ─────────────────────────────────────────────────────
  useEffect(() => {
    function onMouseMove(e) {
      const canvas = canvasRef.current;
      if (!canvas || !gsRef.current) return;
      const me = gsRef.current.players?.[player?.username];
      if (!me) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = CW / rect.width, scaleY = CH / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top)  * scaleY;
      inputRef.current.angle = Math.atan2(cy - me.y, cx - me.x);
    }
    function onMouseDown(e) {
      if (e.button === 0) inputRef.current.shoot = true;
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [player]);

  // Remove kill feed entries after 3s
  useEffect(() => {
    if (!killFeed.length) return;
    const t = setTimeout(() => setKillFeed(prev => prev.slice(1)), 3000);
    return () => clearTimeout(t);
  }, [killFeed]);

  const handleStart = () => socket.emit('start_game', { code });
  const handleLeave = () => { socket.emit('leave_room', { code }); navigate('/lobby'); };
  const sendChat    = (msg) => socket.emit('send_chat', { code, message: msg });

  return (
    <div className="shooter-page">
      {/* Scoreboard */}
      <div className="shooter-header">
        <div className="shooter-title">🔫 ARENA SHOOTER</div>
        <div className="shooter-players">
          {players.map(p => (
            <div key={p.username} className={`shooter-score-pill ${p.username === player?.username ? 'me' : ''}`}>
              <span style={{ color: gsRef.current?.players?.[p.username]?.color || 'var(--primary)' }}>●</span>
              <span>{p.username}</span>
              <span className="shooter-kills">{gsRef.current?.players?.[p.username]?.score ?? 0} kills</span>
            </div>
          ))}
        </div>
        <button className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: '0.78rem' }} onClick={handleLeave}>Leave</button>
      </div>

      {/* Arena */}
      <div className="shooter-arena">
        <canvas
          ref={canvasRef}
          width={CW}
          height={CH}
          className="shooter-canvas"
          style={{ cursor: status === 'playing' ? 'crosshair' : 'default' }}
        />

        {/* Kill feed */}
        {killFeed.length > 0 && (
          <div className="shooter-killfeed">
            {killFeed.map(k => (
              <div key={k.id} className="shooter-kill-entry">
                <span style={{ color: '#ff6b9d' }}>{k.killer}</span>
                <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>☠</span>
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>{k.victim}</span>
              </div>
            ))}
          </div>
        )}

        {/* Waiting overlay */}
        {status === 'waiting' && (
          <div className="game-overlay">
            <div className="game-overlay-card">
              <div style={{ fontSize: '3rem' }}>🔫</div>
              <h2>Arena Shooter</h2>
              <p>Room Code: <strong style={{ color: 'var(--primary)' }}>{code}</strong></p>
              <div className="shooter-lobby-players">
                {players.map(p => (
                  <div key={p.username} className="shooter-lobby-player">
                    <span>👤</span> {p.username}
                    {players[0]?.username === p.username && <span style={{ color: 'var(--gold)', fontSize: '0.75rem' }}> HOST</span>}
                  </div>
                ))}
              </div>
              {players.length < 2 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Waiting for players ({players.length}/4)...</p>}
              {amHost && canStart && (
                <button className="btn btn-primary" style={{ marginTop: '1rem', minWidth: 180 }} onClick={handleStart}>
                  🚀 Start Game
                </button>
              )}
              {!amHost && canStart && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.75rem' }}>Waiting for host to start...</p>}
              <div style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Controls: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · Mouse aim · Click shoot
              </div>
            </div>
          </div>
        )}

        {/* Countdown overlay */}
        {status === 'countdown' && countdown !== null && (
          <div className="game-overlay" style={{ background: 'rgba(6,6,22,0.7)' }}>
            <div className="shooter-countdown">{countdown}</div>
          </div>
        )}

        {/* Game over overlay */}
        {status === 'finished' && (
          <div className="game-overlay">
            <div className="game-overlay-card">
              <div style={{ fontSize: '3rem' }}>
                {winner === player?.username ? '🏆' : '💀'}
              </div>
              <h2 style={{ color: winner === player?.username ? 'var(--primary)' : 'var(--danger)' }}>
                {winner === player?.username ? 'You Win!' : winner ? `${winner} Wins!` : 'Game Over'}
              </h2>
              <div className="shooter-final-scores">
                {scores.map((s, i) => (
                  <div key={s.username} className="shooter-final-row">
                    <span style={{ color: 'var(--gold)', marginRight: 8 }}>{i + 1}.</span>
                    <span style={{ color: s.color }}>●</span>
                    <span style={{ marginLeft: 6 }}>{s.username}</span>
                    <span className="shooter-kills" style={{ marginLeft: 'auto' }}>{s.score} kills</span>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" style={{ marginTop: '1.5rem', minWidth: 180 }} onClick={() => navigate('/lobby')}>
                Back to Lobby
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="shooter-controls-hint">
        <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move &nbsp;·&nbsp; Mouse Aim &nbsp;·&nbsp; Click Shoot
      </div>

      <Chat messages={chat} myUsername={player?.username} onSend={sendChat} />
    </div>
  );
}
