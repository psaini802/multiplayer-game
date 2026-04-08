import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import socket from '../socket';
import { useGame } from '../context/GameContext';
import Chat from '../components/Chat';

const CW = 800, CH = 520;
const PLAYER_R = 14;
const KILL_TARGET = 10;
const TOTAL_SECS  = 180;

// ── Pre-render starfield once ───────────────────────────────────────────────
function buildStarfield() {
  const oc = document.createElement('canvas');
  oc.width = CW; oc.height = CH;
  const ctx = oc.getContext('2d');

  // Deep space gradient
  const grad = ctx.createRadialGradient(CW / 2, CH / 2, 50, CW / 2, CH / 2, 500);
  grad.addColorStop(0,   '#0a0a1e');
  grad.addColorStop(0.5, '#060610');
  grad.addColorStop(1,   '#03030c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CW, CH);

  // Stars
  for (let i = 0; i < 220; i++) {
    const x   = Math.random() * CW;
    const y   = Math.random() * CH;
    const r   = Math.random() * 1.4;
    const a   = 0.3 + Math.random() * 0.7;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fill();
  }

  // Faint nebula blobs
  const nebulas = [
    { x: 180, y: 100, r: 120, c: 'rgba(80,0,180,0.07)' },
    { x: 620, y: 380, r: 100, c: 'rgba(0,80,160,0.06)' },
    { x: 400, y: 260, r: 160, c: 'rgba(120,0,80,0.05)' },
  ];
  for (const n of nebulas) {
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    g.addColorStop(0,   n.c);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CW, CH);
  }
  return oc;
}

// ── Draw asteroid ───────────────────────────────────────────────────────────
function drawAsteroid(ctx, a) {
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.beginPath();
  const v0 = a.verts[0];
  ctx.moveTo(Math.cos(v0.a) * v0.r, Math.sin(v0.a) * v0.r);
  for (let i = 1; i < a.verts.length; i++) {
    const v = a.verts[i];
    ctx.lineTo(Math.cos(v.a) * v.r, Math.sin(v.a) * v.r);
  }
  ctx.closePath();
  ctx.fillStyle   = '#555';
  ctx.strokeStyle = '#888';
  ctx.lineWidth   = 1.5;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// ── Draw player ship ────────────────────────────────────────────────────────
function drawShip(ctx, p, isMe) {
  if (!p.alive) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);

  // Engine glow when thrusting
  if (p.thrustOn) {
    ctx.shadowColor = p.color;
    ctx.shadowBlur  = 18;
    ctx.fillStyle   = `rgba(255,180,50,0.9)`;
    ctx.beginPath();
    ctx.moveTo(-PLAYER_R,  0);
    ctx.lineTo(-PLAYER_R - 14, -4);
    ctx.lineTo(-PLAYER_R - 14,  4);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Ship glow
  ctx.shadowColor = p.color;
  ctx.shadowBlur  = isMe ? 16 : 8;

  // Hull (triangle pointing right = angle 0)
  ctx.beginPath();
  ctx.moveTo( PLAYER_R,  0);
  ctx.lineTo(-PLAYER_R + 4, -PLAYER_R * 0.65);
  ctx.lineTo(-PLAYER_R + 4,  PLAYER_R * 0.65);
  ctx.closePath();
  ctx.fillStyle   = p.color;
  ctx.strokeStyle = isMe ? '#fff' : 'rgba(255,255,255,0.4)';
  ctx.lineWidth   = isMe ? 1.5 : 1;
  ctx.fill();
  ctx.stroke();

  // Cockpit
  ctx.fillStyle   = 'rgba(0,0,0,0.6)';
  ctx.strokeStyle = `${p.color}aa`;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.ellipse(2, 0, 5, 4, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.restore();

  // HP hearts above ship
  ctx.save();
  ctx.font      = '10px Arial';
  ctx.textAlign = 'center';
  const hearts  = '♥'.repeat(p.hp) + '♡'.repeat(Math.max(0, 3 - p.hp));
  ctx.fillStyle = p.hp > 1 ? p.color : '#ff4444';
  ctx.fillText(hearts, p.x, p.y - PLAYER_R - 6);

  // Name tag
  ctx.font      = isMe ? 'bold 10px Inter,sans-serif' : '9px Inter,sans-serif';
  ctx.fillStyle = isMe ? '#fff' : 'rgba(255,255,255,0.5)';
  ctx.fillText(p.username, p.x, p.y - PLAYER_R - 17);
  ctx.restore();
}

// ── Draw bullet ─────────────────────────────────────────────────────────────
function drawBullet(ctx, b) {
  ctx.save();
  ctx.shadowColor = b.color;
  ctx.shadowBlur  = 8;
  ctx.beginPath();
  ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = b.color + '66';
  ctx.fill();
  ctx.restore();
}

// ── Main draw ───────────────────────────────────────────────────────────────
function drawScene(ctx, starfield, gs, myUsername) {
  if (!gs) {
    ctx.fillStyle = '#03030c';
    ctx.fillRect(0, 0, CW, CH);
    return;
  }
  ctx.drawImage(starfield, 0, 0);

  for (const a of (gs.asteroids || [])) drawAsteroid(ctx, a);
  for (const b of (gs.bullets   || [])) drawBullet(ctx, b);

  const cars = Object.values(gs.players || {});
  const others = cars.filter(p => p.username !== myUsername);
  const me     = cars.find(p => p.username === myUsername);
  for (const p of others) drawShip(ctx, p, false);
  if (me) drawShip(ctx, me, true);
}

// ───────────────────────────────────────────────────────────────────────────
export default function SpaceGame() {
  const { code }   = useParams();
  const navigate   = useNavigate();
  const { player, showToast } = useGame();
  const canvasRef   = useRef(null);
  const starRef     = useRef(null);
  const gsRef       = useRef(null);
  const rafRef      = useRef(null);
  const hasJoined   = useRef(false);
  const keysRef     = useRef({});
  const inputTimer  = useRef(null);

  const [status,    setStatus]    = useState('waiting');
  const [countdown, setCountdown] = useState(null);
  const [players,   setPlayers]   = useState([]);
  const [winner,    setWinner]    = useState(null);
  const [scores,    setScores]    = useState([]);
  const [winReason, setWinReason] = useState('');
  const [amHost,    setAmHost]    = useState(false);
  const [canStart,  setCanStart]  = useState(false);
  const [chat,      setChat]      = useState([]);

  // HUD
  const [hudKills,  setHudKills]  = useState(0);
  const [hudHp,     setHudHp]     = useState(3);
  const [hudTimer,  setHudTimer]  = useState(TOTAL_SECS);
  const [killFeed,  setKillFeed]  = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);

  // ── Render loop ──────────────────────────────────────────────────────────
  const drawLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const star   = starRef.current;
    if (canvas && star) {
      drawScene(canvas.getContext('2d'), star, gsRef.current, player?.username);
    }
    rafRef.current = requestAnimationFrame(drawLoop);
  }, [player]);

  // ── Socket events ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!player) { navigate('/'); return; }
    if (!starRef.current) starRef.current = buildStarfield();

    function onError({ message }) {
      if (message === 'Not registered') {
        socket.once('registered', () => socket.emit('join_room', { code }));
      } else { showToast(message, 'error'); navigate('/lobby'); }
    }

    function onJoined({ room }) {
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

    function onCountdown({ count }) { setStatus('countdown'); setCountdown(count); }

    function onStart(room) {
      setStatus('playing'); setPlayers(room.players); setCountdown(null);
      if (!rafRef.current) rafRef.current = requestAnimationFrame(drawLoop);
      inputTimer.current = setInterval(() => {
        socket.emit('space_input', { code, keys: { ...keysRef.current } });
      }, 33);
    }

    function onTick(gs) {
      gsRef.current = gs;
      const me = gs.players?.[player.username];
      if (me) {
        setHudKills(me.kills);
        setHudHp(me.hp);
      }
      const secs = Math.max(0, Math.ceil(gs.ticksLeft * 33 / 1000));
      setHudTimer(secs);
      setKillFeed(gs.killFeed || []);

      const sorted = Object.values(gs.players || {})
        .sort((a, b) => b.kills - a.kills);
      setLeaderboard(sorted);
    }

    function onOver({ winner: w, reason, scores: sc }) {
      setWinner(w); setScores(sc || []); setWinReason(reason);
      setStatus('finished');
      clearInterval(inputTimer.current);
      setTimeout(() => { cancelAnimationFrame(rafRef.current); rafRef.current = null; }, 100);
    }

    function onRoomUpdated(room) {
      setPlayers(room.players);
      setAmHost(room.players[0]?.username === player.username);
      setCanStart(room.players.length >= 2);
    }

    function onRejoined({ room }) { onJoined({ room }); }
    function onChat(msg) { setChat(prev => [...prev.slice(-99), msg]); }

    socket.on('error',          onError);
    socket.on('room_joined',    onJoined);
    socket.on('room_rejoined',  onRejoined);
    socket.on('player_joined',  onPlayerJoined);
    socket.on('room_updated',   onRoomUpdated);
    socket.on('space_countdown', onCountdown);
    socket.on('space_start',    onStart);
    socket.on('space_tick',     onTick);
    socket.on('space_over',     onOver);
    socket.on('chat_message',   onChat);

    if (!hasJoined.current) { hasJoined.current = true; socket.emit('join_room', { code }); }

    const onBefore = () => socket.emit('leave_room', { code });
    window.addEventListener('beforeunload', onBefore);

    return () => {
      socket.off('error',          onError);
      socket.off('room_joined',    onJoined);
      socket.off('room_rejoined',  onRejoined);
      socket.off('player_joined',  onPlayerJoined);
      socket.off('room_updated',   onRoomUpdated);
      socket.off('space_countdown', onCountdown);
      socket.off('space_start',    onStart);
      socket.off('space_tick',     onTick);
      socket.off('space_over',     onOver);
      socket.off('chat_message',   onChat);
      window.removeEventListener('beforeunload', onBefore);
      cancelAnimationFrame(rafRef.current);
      clearInterval(inputTimer.current);
    };
  }, [code, player, navigate, showToast, drawLoop]);

  // ── Keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const MAP = {
      ArrowLeft:'a', a:'a',
      ArrowRight:'d', d:'d',
      ArrowUp:'w', w:'w',
      ArrowDown:'s', s:'s',
      ' ':'space',
    };
    const down = e => {
      const k = MAP[e.key];
      if (k) { e.preventDefault(); keysRef.current[k] = true; }
    };
    const up = e => {
      const k = MAP[e.key];
      if (k) delete keysRef.current[k];
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup',   up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const handleStart = () => socket.emit('start_game', { code });
  const handleLeave = () => { socket.emit('leave_room', { code }); navigate('/lobby'); };
  const sendChat    = msg => socket.emit('send_chat', { code, message: msg });

  const myColor  = gsRef.current?.players?.[player?.username]?.color || 'var(--primary)';
  const timerMin = String(Math.floor(hudTimer / 60)).padStart(2, '0');
  const timerSec = String(hudTimer % 60).padStart(2, '0');

  return (
    <div className="space-page">
      {/* Header */}
      <div className="space-header">
        <div className="space-title">🚀 SPACE SHOOTER</div>
        <div className="space-players">
          {players.map(p => (
            <div key={p.username}
              className={`space-chip ${p.username === player?.username ? 'me' : ''}`}
              style={{ '--chip-color': gsRef.current?.players?.[p.username]?.color || '#888' }}
            >
              <span className="space-chip-dot" />
              {p.username}
            </div>
          ))}
        </div>
        <button className="btn btn-ghost" style={{ padding:'6px 14px', fontSize:'0.78rem' }} onClick={handleLeave}>Leave</button>
      </div>

      {/* Arena */}
      <div className="space-arena">
        <canvas ref={canvasRef} width={CW} height={CH} className="space-canvas" />

        {/* In-game HUD */}
        {status === 'playing' && (
          <>
            {/* Top-left: HP + kills */}
            <div className="space-hud-left">
              <div className="space-hud-row">
                <span className="space-hud-label">HP</span>
                <span style={{ color: hudHp > 1 ? myColor : '#ff4444', fontFamily:'Arial', fontSize:'1rem' }}>
                  {'♥'.repeat(hudHp)}{'♡'.repeat(Math.max(0, 3 - hudHp))}
                </span>
              </div>
              <div className="space-hud-row">
                <span className="space-hud-label">KILLS</span>
                <span style={{ color: myColor, fontFamily:'Orbitron', fontWeight:700 }}>
                  {hudKills} / {KILL_TARGET}
                </span>
              </div>
              <div className="space-hud-row">
                <span className="space-hud-label">TIME</span>
                <span style={{ color: hudTimer < 30 ? '#ff4444' : 'var(--text)', fontFamily:'Orbitron', fontSize:'0.9rem', fontWeight:700 }}>
                  {timerMin}:{timerSec}
                </span>
              </div>
            </div>

            {/* Top-right: live leaderboard */}
            <div className="space-live-board">
              {leaderboard.map((p, i) => (
                <div key={p.username} className={`space-live-row ${p.username === player?.username ? 'me' : ''}`}>
                  <span className="space-live-pos" style={{ color: i === 0 ? 'var(--gold)' : 'var(--text-muted)' }}>
                    {i === 0 ? '👑' : `#${i + 1}`}
                  </span>
                  <span className="space-live-dot" style={{ background: p.color }} />
                  <span className="space-live-name">{p.username}</span>
                  <span className="space-live-kills">{p.kills}K</span>
                </div>
              ))}
            </div>

            {/* Bottom-right: kill feed */}
            {killFeed.length > 0 && (
              <div className="space-killfeed">
                {killFeed.map((kf, i) => (
                  <div key={i} className="space-kf-row">
                    <span style={{ color: '#ff9944' }}>{kf.killer}</span>
                    <span className="space-kf-icon">💥</span>
                    <span style={{ color: '#aaa' }}>{kf.victim}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Waiting overlay */}
        {status === 'waiting' && (
          <div className="game-overlay">
            <div className="game-overlay-card">
              <div style={{ fontSize:'3rem' }}>🚀</div>
              <h2>Space Shooter</h2>
              <p>Room: <strong style={{ color:'var(--primary)' }}>{code}</strong></p>
              <div className="space-lobby-grid">
                {players.map((p, i) => (
                  <div key={p.username} className="space-lobby-slot">
                    <span style={{ color: ['#00e5ff','#ff4444','#ffd700','#c77dff'][i] }}>▲</span>
                    {' '}{p.username}
                    {i === 0 && <span style={{ color:'var(--gold)', fontSize:'0.7rem' }}> HOST</span>}
                  </div>
                ))}
                {Array.from({ length: Math.max(0, 4 - players.length) }, (_, i) => (
                  <div key={i} className="space-lobby-slot empty">Empty slot</div>
                ))}
              </div>
              {players.length < 2 && <p style={{ color:'var(--text-muted)', fontSize:'0.82rem' }}>Waiting for players…</p>}
              {amHost && canStart && (
                <button className="btn btn-primary" style={{ marginTop:'1rem', minWidth:180 }} onClick={handleStart}>
                  🚀 Launch Game
                </button>
              )}
              {!amHost && canStart && <p style={{ color:'var(--text-muted)', fontSize:'0.82rem', marginTop:'0.75rem' }}>Waiting for host to start…</p>}
              <div style={{ marginTop:'1.5rem', fontSize:'0.78rem', color:'var(--text-muted)', lineHeight:1.9 }}>
                <kbd>A</kbd>/<kbd>D</kbd> Rotate &nbsp; <kbd>W</kbd> Thrust &nbsp; <kbd>S</kbd> Brake &nbsp; <kbd>Space</kbd> Shoot
              </div>
              <div style={{ marginTop:'0.5rem', fontSize:'0.75rem', color:'var(--text-muted)' }}>
                First to <strong style={{ color:'var(--gold)' }}>{KILL_TARGET} kills</strong> wins • 3-minute timer
              </div>
            </div>
          </div>
        )}

        {/* Countdown */}
        {status === 'countdown' && countdown !== null && (
          <div className="game-overlay" style={{ background:'rgba(3,3,12,0.75)' }}>
            <div className="space-countdown">{countdown === 0 ? 'FIRE!' : countdown}</div>
          </div>
        )}

        {/* Finished */}
        {status === 'finished' && (
          <div className="game-overlay">
            <div className="game-overlay-card">
              <div style={{ fontSize:'3rem' }}>{winner === player?.username ? '🏆' : '💀'}</div>
              <h2 style={{ color: winner === player?.username ? 'var(--primary)' : 'var(--text)' }}>
                {winner === player?.username ? 'Victory!' : `${winner} Wins!`}
              </h2>
              <p style={{ color:'var(--text-muted)', fontSize:'0.82rem' }}>
                {winReason === 'time'
                  ? `⏱️ Time's up! ${winner} wins with the most kills.`
                  : `🎯 ${winner} reached ${KILL_TARGET} kills first!`}
              </p>
              <div className="space-finish-list">
                {scores.map((s, i) => (
                  <div key={s.username} className="space-finish-row">
                    <span style={{ color: i === 0 ? 'var(--gold)' : 'var(--text-muted)', fontFamily:'Orbitron', fontSize:'0.9rem' }}>#{i+1}</span>
                    <span className="space-live-dot" style={{ background: s.color }} />
                    <span style={{ flex:1, fontWeight: s.username === player?.username ? 700 : 400 }}>{s.username}</span>
                    <span style={{ color:'#4caf50', fontFamily:'Orbitron', fontSize:'0.85rem' }}>{s.kills}K</span>
                    <span style={{ color:'var(--secondary)', fontFamily:'Orbitron', fontSize:'0.85rem', marginLeft:8 }}>{s.deaths}D</span>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" style={{ marginTop:'1.5rem', minWidth:180 }} onClick={() => navigate('/lobby')}>
                Back to Lobby
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="space-controls-hint">
        <kbd>A</kbd>/<kbd>←</kbd> Rotate Left &nbsp;·&nbsp;
        <kbd>D</kbd>/<kbd>→</kbd> Rotate Right &nbsp;·&nbsp;
        <kbd>W</kbd>/<kbd>↑</kbd> Thrust &nbsp;·&nbsp;
        <kbd>S</kbd>/<kbd>↓</kbd> Brake &nbsp;·&nbsp;
        <kbd>Space</kbd> Shoot
      </div>

      <Chat messages={chat} myUsername={player?.username} onSend={sendChat} />
    </div>
  );
}
