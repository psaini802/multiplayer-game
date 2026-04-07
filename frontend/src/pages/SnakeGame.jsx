import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import socket from '../socket';
import Chat from '../components/Chat';

const CELL = 20; // px per grid cell
const GRID = { W: 30, H: 20 };
const CANVAS_W = GRID.W * CELL;
const CANVAS_H = GRID.H * CELL;

// Canvas drawing helpers
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h); ctx.arcTo(x, y+h, x, y+h-r, r);
  ctx.lineTo(x, y+r); ctx.arcTo(x, y, x+r, y, r);
  ctx.closePath();
}

function renderGame(canvas, gameState, myUsername) {
  if (!canvas || !gameState) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // Background
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Grid dots
  ctx.fillStyle = 'rgba(108,99,255,0.06)';
  for (let x = 0; x < GRID.W; x++) {
    for (let y = 0; y < GRID.H; y++) {
      ctx.beginPath();
      ctx.arc(x*CELL+CELL/2, y*CELL+CELL/2, 1, 0, Math.PI*2);
      ctx.fill();
    }
  }

  // Border
  ctx.strokeStyle = 'rgba(108,99,255,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, CANVAS_W-2, CANVAS_H-2);

  // Food
  for (const [fx, fy] of (gameState.food||[])) {
    const cx = fx*CELL+CELL/2, cy = fy*CELL+CELL/2;
    ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#ff4444';
    ctx.beginPath(); ctx.arc(cx, cy, CELL/2.5, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Snakes
  for (const [username, snake] of Object.entries(gameState.snakes||{})) {
    const isMe = username === myUsername;
    const color = snake.alive ? snake.color : '#2a2a3a';

    snake.segments.forEach(([sx, sy], i) => {
      const isHead = i === 0;
      const pad = isHead ? 1 : 2;
      const sz = CELL - pad * 2;

      if (isHead && snake.alive) {
        ctx.shadowColor = color; ctx.shadowBlur = 14;
      }
      ctx.fillStyle = isHead ? color : (snake.alive ? color + 'cc' : '#1e1e2e');
      roundRect(ctx, sx*CELL+pad, sy*CELL+pad, sz, sz, isHead?5:3);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Eyes on head
      if (isHead && snake.alive) {
        ctx.fillStyle = '#fff';
        const eyeSize = 3;
        const { dir } = snake;
        let ex1, ey1, ex2, ey2;
        const hcx = sx*CELL+CELL/2, hcy = sy*CELL+CELL/2;
        if (dir==='right'||dir==='left') {
          const eo = dir==='right'?4:-4;
          ex1=hcx+eo; ey1=hcy-3; ex2=hcx+eo; ey2=hcy+3;
        } else {
          const eo = dir==='down'?4:-4;
          ex1=hcx-3; ey1=hcy+eo; ex2=hcx+3; ey2=hcy+eo;
        }
        ctx.beginPath(); ctx.arc(ex1, ey1, eyeSize, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex2, ey2, eyeSize, 0, Math.PI*2); ctx.fill();
      }
    });

    // Name label above head (only if alive)
    if (snake.alive && snake.segments.length > 0) {
      const [hx, hy] = snake.segments[0];
      const label = isMe ? `★ ${username}` : username;
      ctx.font = `bold 10px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = isMe ? '#fff' : 'rgba(255,255,255,0.6)';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
      ctx.fillText(label.substring(0,12), hx*CELL+CELL/2, hy*CELL-3);
      ctx.shadowBlur = 0;
    }
  }
}

export default function SnakeGame() {
  const { code } = useParams();
  const { player, showToast } = useGame();
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const hasJoinedRef = useRef(false);
  const gameStateRef = useRef(null);
  const rafRef = useRef(null);

  const [room, setRoom]             = useState(null);
  const [mySymbol, setMySymbol]     = useState(null);
  const [isSpectator, setIsSpectator] = useState(false);
  const [status, setStatus]         = useState('connecting'); // connecting|waiting|countdown|playing|finished
  const [countdown, setCountdown]   = useState(null);
  const [gameOver, setGameOver]     = useState(null); // { winner, scores }
  const [scores, setScores]         = useState({});
  const [copied, setCopied]         = useState(false);
  const [isHost, setIsHost]         = useState(false);
  const [canStart, setCanStart]     = useState(false);

  // Render loop
  useEffect(() => {
    const draw = () => {
      if (canvasRef.current && gameStateRef.current) {
        renderGame(canvasRef.current, gameStateRef.current, player?.username);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [player?.username]);

  // Socket events
  useEffect(() => {
    const onJoined = ({ symbol, gameType, room: r, isSpectator: spec }) => {
      if (spec) { setIsSpectator(true); }
      else { setMySymbol(symbol); }
      setRoom(r);
      setIsHost(r.players[0]?.username === player?.username);
      setCanStart(r.players.length >= 2);
      setStatus(r.status === 'playing' ? 'playing' : 'waiting');
      if (r.gameState) gameStateRef.current = r.gameState;
    };
    const onPlayerJoined = (r) => {
      setRoom(r);
      setIsHost(r.players[0]?.username === player?.username);
      setCanStart(r.players.length >= 2);
    };
    const onCountdown = ({ count }) => {
      setStatus('countdown');
      setCountdown(count);
    };
    const onStart = (r) => {
      setStatus('playing');
      setCountdown(null);
      setRoom(r);
      if (r.gameState) gameStateRef.current = r.gameState;
    };
    const onTick = (gs) => {
      gameStateRef.current = gs;
      // Update live scores without re-rendering React
      const s = {};
      for (const [u, sn] of Object.entries(gs.snakes)) s[u] = { score: sn.score, alive: sn.alive };
      setScores(s);
    };
    const onOver = ({ winner, scores: sc }) => {
      setStatus('finished');
      setGameOver({ winner, scores: sc });
    };
    const onChatMsg = (msg) => {
      setRoom(prev => prev ? { ...prev, chat: [...(prev.chat||[]), msg].slice(-50) } : prev);
    };
    const onError = ({ message }) => {
      showToast(message, 'error');
      if (message === 'Not registered') {
        socket.once('registered', () => socket.emit('join_room', { code }));
        return;
      }
      showToast(message, 'error');
      if (message === 'Room not found') setTimeout(() => navigate('/lobby'), 1500);
    };
    const onPlayerLeft = ({ username }) => {
      showToast(`${username} left`, 'error');
    };
    const onRoomUpdated = (r) => setRoom(r);

    socket.on('room_joined',    onJoined);
    socket.on('room_rejoined',  onJoined);
    socket.on('joined_as_spectator', d => onJoined({ ...d, isSpectator: true }));
    socket.on('player_joined',  onPlayerJoined);
    socket.on('snake_countdown',onCountdown);
    socket.on('snake_start',    onStart);
    socket.on('snake_tick',     onTick);
    socket.on('snake_over',     onOver);
    socket.on('chat_message',   onChatMsg);
    socket.on('error',          onError);
    socket.on('player_left',    onPlayerLeft);
    socket.on('room_updated',   onRoomUpdated);

    if (!hasJoinedRef.current) {
      hasJoinedRef.current = true;
      socket.emit('join_room', { code });
    }

    return () => {
      socket.off('room_joined',    onJoined);
      socket.off('room_rejoined',  onJoined);
      socket.off('joined_as_spectator');
      socket.off('player_joined',  onPlayerJoined);
      socket.off('snake_countdown',onCountdown);
      socket.off('snake_start',    onStart);
      socket.off('snake_tick',     onTick);
      socket.off('snake_over',     onOver);
      socket.off('chat_message',   onChatMsg);
      socket.off('error',          onError);
      socket.off('player_left',    onPlayerLeft);
      socket.off('room_updated',   onRoomUpdated);
    };
  }, [code]); // eslint-disable-line

  useEffect(() => {
    hasJoinedRef.current = false;
    const onUnload = () => socket.emit('leave_room', { code });
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [code]);

  // Keyboard controls
  useEffect(() => {
    const DIRS = {
      ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right',
      KeyW:'up', KeyS:'down', KeyA:'left', KeyD:'right',
    };
    const handleKey = (e) => {
      const dir = DIRS[e.code];
      if (dir && status === 'playing' && !isSpectator) {
        e.preventDefault();
        socket.emit('snake_direction', { code, direction: dir });
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [code, status, isSpectator]);

  const handleLeave = () => {
    socket.emit('leave_room', { code });
    navigate('/lobby');
  };
  const handleStart = () => socket.emit('start_game', { code });
  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true); setTimeout(()=>setCopied(false),2000);
  };

  return (
    <>
      <div className="page-bg" />
      <div className="page snake-page">
        {/* Header */}
        <div className="snake-header">
          <button className="btn btn-ghost" style={{padding:'8px 14px',fontSize:'0.82rem'}} onClick={handleLeave}>← Lobby</button>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontFamily:'Orbitron',fontSize:'0.9rem',color:'var(--accent)'}}>🐍 ARENA SNAKE</span>
            <div className="game-room-code" onClick={copyCode} style={{cursor:'pointer'}}>
              <span style={{fontSize:'0.65rem',color:'var(--text-muted)'}}>ROOM</span>
              <span style={{fontFamily:'Orbitron',fontSize:'0.85rem',letterSpacing:'0.1em'}}>{code}</span>
              <span style={{fontSize:'0.7rem',color:'var(--text-muted)'}}>{copied?'✓':'⎘'}</span>
            </div>
          </div>
          <div style={{width:80}}/>
        </div>

        <div className="snake-layout">
          {/* LEFT: player list + controls */}
          <div className="snake-sidebar">
            <div className="card" style={{padding:16,marginBottom:12}}>
              <div className="lobby-section-title" style={{marginBottom:10}}>Players</div>
              {(room?.players||[]).map(p => {
                const sn = gameStateRef.current?.snakes?.[p.username];
                const sc = scores[p.username];
                return (
                  <div key={p.username} style={{
                    display:'flex',alignItems:'center',gap:8,
                    padding:'8px 10px',borderRadius:8,marginBottom:6,
                    background: p.username===player?.username ? 'rgba(108,99,255,0.1)' : 'rgba(255,255,255,0.03)',
                    border: '1px solid',
                    borderColor: p.username===player?.username ? 'rgba(108,99,255,0.3)' : 'transparent',
                    opacity: sc && !sc.alive && status==='playing' ? 0.4 : 1,
                  }}>
                    <div style={{width:10,height:10,borderRadius:'50%',background: sn?.color||'#6c63ff',flexShrink:0}}/>
                    <span style={{fontSize:'0.85rem',fontWeight:600,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {p.username}{p.username===player?.username?' (you)':''}
                    </span>
                    {status==='playing' && sc && (
                      <span style={{fontFamily:'Orbitron',fontSize:'0.75rem',color:'var(--accent)'}}>
                        {sc.alive ? `🍎${sc.score}` : '💀'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {status==='waiting' && isHost && canStart && (
              <button className="btn btn-primary" style={{width:'100%',marginBottom:12}} onClick={handleStart}>
                🚀 Start Game
              </button>
            )}
            {status==='waiting' && !isHost && (
              <div style={{textAlign:'center',padding:'10px',fontSize:'0.82rem',color:'var(--text-muted)',background:'rgba(255,255,255,0.03)',borderRadius:8,marginBottom:12}}>
                Waiting for host to start…
              </div>
            )}
            {status==='waiting' && room?.players.length < 2 && (
              <div style={{textAlign:'center',padding:'10px',fontSize:'0.82rem',color:'var(--accent)',background:'rgba(0,210,255,0.05)',borderRadius:8,border:'1px solid rgba(0,210,255,0.15)',marginBottom:12}}>
                Share room code to invite players!
              </div>
            )}

            <div className="card" style={{padding:'12px 14px'}}>
              <div style={{fontSize:'0.75rem',color:'var(--text-muted)',marginBottom:8,letterSpacing:'0.08em',textTransform:'uppercase'}}>Controls</div>
              <div style={{fontSize:'0.8rem',color:'rgba(232,232,255,0.7)',lineHeight:1.8}}>
                <div>↑ / W — Up</div>
                <div>↓ / S — Down</div>
                <div>← / A — Left</div>
                <div>→ / D — Right</div>
              </div>
            </div>
          </div>

          {/* CENTER: canvas */}
          <div className="snake-center">
            <div className="snake-canvas-wrap" style={{position:'relative'}}>
              <canvas
                ref={canvasRef}
                width={CANVAS_W}
                height={CANVAS_H}
                style={{display:'block',borderRadius:8,border:'1px solid rgba(108,99,255,0.2)'}}
              />

              {/* Overlays */}
              {status === 'connecting' && (
                <div className="canvas-overlay">
                  <div className="overlay-text">Connecting…</div>
                </div>
              )}
              {status === 'waiting' && (
                <div className="canvas-overlay">
                  <div className="overlay-title">🐍 Arena Snake</div>
                  <div className="overlay-text">
                    {room?.players.length||0} / 4 players
                  </div>
                  <div style={{fontSize:'0.8rem',color:'var(--text-muted)',marginTop:8}}>
                    {isHost && room?.players.length >= 2 ? 'Click Start Game →' : 'Waiting for players…'}
                  </div>
                </div>
              )}
              {status === 'countdown' && countdown !== null && (
                <div className="canvas-overlay">
                  <div className="countdown-number">{countdown || 'GO!'}</div>
                </div>
              )}
              {status === 'finished' && gameOver && (
                <div className="canvas-overlay">
                  <div className="overlay-title" style={{color: gameOver.winner===player?.username?'var(--gold)':'var(--secondary)'}}>
                    {gameOver.winner ? (gameOver.winner===player?.username ? '🏆 You Win!' : `${gameOver.winner} Wins!`) : 'Draw!'}
                  </div>
                  <div style={{marginTop:16,display:'flex',flexDirection:'column',gap:6,width:'100%',maxWidth:200}}>
                    {(gameOver.scores||[]).slice(0,4).map((s,i)=>(
                      <div key={s.username} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 12px',background:'rgba(255,255,255,0.05)',borderRadius:6,border:`1px solid ${i===0?'rgba(255,215,0,0.3)':'transparent'}`}}>
                        <span style={{fontSize:'0.82rem',fontWeight:600}}>
                          {i===0?'🥇':i===1?'🥈':i===2?'🥉':'  '} {s.username}
                        </span>
                        <span style={{fontFamily:'Orbitron',fontSize:'0.75rem',color:'var(--accent)'}}>🍎{s.score}</span>
                      </div>
                    ))}
                  </div>
                  <button className="btn btn-primary" style={{marginTop:20}} onClick={handleLeave}>Return to Lobby</button>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: chat */}
          <Chat
            messages={room?.chat||[]}
            myUsername={player?.username}
            onSend={msg => socket.emit('send_chat',{code,message:msg})}
            disabled={!room}
          />
        </div>
      </div>
    </>
  );
}
