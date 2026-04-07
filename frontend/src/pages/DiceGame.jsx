import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import socket from '../socket';
import Chat from '../components/Chat';

const SPECIAL_TILES = {
  6:{emoji:'🚀',label:'Rocket! +6'},13:{emoji:'💥',label:'Trap! −4'},
  20:{emoji:'🎲',label:'Roll Again!'},24:{emoji:'⭐',label:'→ 45'},
  35:{emoji:'🕳',label:'Pitfall! −7'},40:{emoji:'🏆',label:'+10'},
  48:{emoji:'🎲',label:'Roll Again!'},52:{emoji:'💀',label:'−5'},
  60:{emoji:'🚀',label:'Sprint! +8'},70:{emoji:'⚡',label:'→ 85'},
  75:{emoji:'😱',label:'−10'},80:{emoji:'🎲',label:'Roll Again!'},
  88:{emoji:'💨',label:'+5'},
};

const DICE_FACES = ['⚀','⚁','⚂','⚃','⚄','⚅'];

function RaceTrack({ players }) {
  const TOTAL = 100;
  return (
    <div className="race-track-wrap">
      {players.map(p => (
        <div key={p.username} className="race-lane">
          <div className="race-lane-label" style={{color:p.color}}>
            {p.avatar} {p.username}
          </div>
          <div className="race-bar-bg">
            <div
              className="race-bar-fill"
              style={{
                width:`${(p.position/TOTAL)*100}%`,
                background:`linear-gradient(90deg, ${p.color}88, ${p.color})`,
                boxShadow:`0 0 10px ${p.color}66`,
              }}
            />
            {/* Milestone markers */}
            {[25,50,75].map(m => (
              <div key={m} className="race-milestone" style={{left:`${m}%`}} title={`${m}`}>
                <span>{m}</span>
              </div>
            ))}
            {/* Player token */}
            <div
              className="race-token"
              style={{
                left:`calc(${(p.position/TOTAL)*100}% - 14px)`,
                background:p.color,
                boxShadow:`0 0 12px ${p.color}`,
                transition:'left 0.5s cubic-bezier(0.34,1.56,0.64,1)',
              }}
            >
              {p.avatar}
            </div>
          </div>
          <div className="race-pos-label" style={{color:p.color}}>
            {p.position}<span>/100</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DiceDisplay({ value, rolling }) {
  return (
    <div className={`dice-display ${rolling ? 'rolling' : ''} ${value ? 'has-value' : ''}`}>
      <div className="dice-face">
        {value ? DICE_FACES[value-1] : '🎲'}
      </div>
    </div>
  );
}

export default function DiceGame() {
  const { code } = useParams();
  const { player, showToast } = useGame();
  const navigate = useNavigate();
  const hasJoinedRef = useRef(false);

  const [room, setRoom]           = useState(null);
  const [gameState, setGameState] = useState(null);
  const [isSpectator, setIsSpectator] = useState(false);
  const [status, setStatus]       = useState('connecting');
  const [rolling, setRolling]     = useState(false);
  const [lastRoll, setLastRoll]   = useState(null);
  const [lastEffect, setLastEffect] = useState(null);
  const [timeLeft, setTimeLeft]   = useState(25);
  const [gameOver, setGameOver]   = useState(null);
  const [copied, setCopied]       = useState(false);
  const [isHost, setIsHost]       = useState(false);

  const myTurn = gameState &&
    gameState.players[gameState.currentIdx]?.username === player?.username &&
    status === 'playing' &&
    !isSpectator;

  useEffect(() => {
    const onJoined = ({ symbol, gameType, room: r, isSpectator: spec }) => {
      if (spec) setIsSpectator(true);
      setRoom(r);
      setIsHost(r.players[0]?.username === player?.username);
      if (r.gameState) { setGameState(r.gameState); setStatus('playing'); }
      else setStatus(r.status==='playing' ? 'playing' : 'waiting');
    };
    const onPlayerJoined = (r) => {
      setRoom(r);
      setIsHost(r.players[0]?.username === player?.username);
    };
    const onDiceStart = (r) => {
      setRoom(r);
      setGameState(r.gameState);
      setStatus('playing');
    };
    const onDiceRolled = ({ roll, from, to, tile, canRollAgain, isAuto, gameState: gs }) => {
      setRolling(true);
      setTimeout(() => {
        setRolling(false);
        setLastRoll(roll);
        setLastEffect(tile);
        setGameState(gs);
        if (tile) {
          showToast(`${tile.emoji} ${tile.label}`, tile.type==='trap'?'error':tile.type==='boost'?'success':'info');
        }
      }, 500);
    };
    const onTimer = ({ timeLeft: t }) => setTimeLeft(t);
    const onDiceOver = ({ winner, gameState: gs }) => {
      setGameState(gs);
      setStatus('finished');
      setGameOver({ winner });
    };
    const onChatMsg = (msg) => {
      setRoom(prev => prev ? {...prev, chat:[...(prev.chat||[]),msg].slice(-50)} : prev);
    };
    const onError = ({ message }) => {
      showToast(message, 'error');
      if (message === 'Not registered') {
        socket.once('registered', () => socket.emit('join_room', { code }));
        return;
      }
      showToast(message, 'error');
      if (message==='Room not found') setTimeout(()=>navigate('/lobby'),1500);
    };
    const onRoomUpdated = (r) => { setRoom(r); setIsHost(r.players[0]?.username===player?.username); };

    socket.on('room_joined', onJoined);
    socket.on('room_rejoined', onJoined);
    socket.on('joined_as_spectator', d=>onJoined({...d,isSpectator:true}));
    socket.on('player_joined', onPlayerJoined);
    socket.on('dice_start', onDiceStart);
    socket.on('dice_rolled', onDiceRolled);
    socket.on('dice_timer', onTimer);
    socket.on('dice_over', onDiceOver);
    socket.on('chat_message', onChatMsg);
    socket.on('error', onError);
    socket.on('room_updated', onRoomUpdated);

    if (!hasJoinedRef.current) {
      hasJoinedRef.current = true;
      socket.emit('join_room', { code });
    }

    return () => {
      socket.off('room_joined', onJoined);
      socket.off('room_rejoined', onJoined);
      socket.off('joined_as_spectator');
      socket.off('player_joined', onPlayerJoined);
      socket.off('dice_start', onDiceStart);
      socket.off('dice_rolled', onDiceRolled);
      socket.off('dice_timer', onTimer);
      socket.off('dice_over', onDiceOver);
      socket.off('chat_message', onChatMsg);
      socket.off('error', onError);
      socket.off('room_updated', onRoomUpdated);
    };
  }, [code]); // eslint-disable-line

  useEffect(() => {
    hasJoinedRef.current = false;
    const onUnload = () => socket.emit('leave_room', { code });
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [code]);

  const handleRoll = () => {
    if (!myTurn || rolling) return;
    socket.emit('roll_dice', { code });
  };

  const handleStart = () => socket.emit('start_game', { code });
  const handleLeave = () => { socket.emit('leave_room',{code}); navigate('/lobby'); };
  const copyCode = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(()=>setCopied(false),2000); };

  const currentPlayer = gameState?.players[gameState?.currentIdx];

  return (
    <>
      <div className="page-bg" />
      <div className="page dice-page">
        {/* Header */}
        <div className="snake-header">
          <button className="btn btn-ghost" style={{padding:'8px 14px',fontSize:'0.82rem'}} onClick={handleLeave}>← Lobby</button>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontFamily:'Orbitron',fontSize:'0.9rem',color:'var(--gold)'}}>🎲 DICE RACING</span>
            <div className="game-room-code" onClick={copyCode} style={{cursor:'pointer'}}>
              <span style={{fontSize:'0.65rem',color:'var(--text-muted)'}}>ROOM</span>
              <span style={{fontFamily:'Orbitron',fontSize:'0.85rem',letterSpacing:'0.1em'}}>{code}</span>
              <span style={{fontSize:'0.7rem',color:'var(--text-muted)'}}>{copied?'✓':'⎘'}</span>
            </div>
          </div>
          <div style={{width:80}}/>
        </div>

        <div className="dice-layout">
          {/* MAIN area */}
          <div className="dice-main">
            {status === 'waiting' && (
              <div className="card" style={{padding:32,textAlign:'center',maxWidth:460,margin:'0 auto'}}>
                <div style={{fontSize:'3rem',marginBottom:12}}>🎲</div>
                <div style={{fontFamily:'Orbitron',fontSize:'1.2rem',marginBottom:8,color:'var(--gold)'}}>Dice Racing</div>
                <div style={{color:'var(--text-muted)',fontSize:'0.9rem',marginBottom:24}}>
                  First to reach square 100 wins!<br/>
                  Watch out for special tiles along the way.
                </div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center',marginBottom:24}}>
                  {(room?.players||[]).map(p=>(
                    <div key={p.username} style={{padding:'6px 14px',borderRadius:50,fontSize:'0.82rem',fontWeight:600,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)'}}>
                      {p.username}
                    </div>
                  ))}
                </div>
                {isHost && (room?.players||[]).length >= 2 ? (
                  <button className="btn btn-primary btn-lg" onClick={handleStart}>🎲 Start Race!</button>
                ) : isHost ? (
                  <div style={{color:'var(--text-muted)',fontSize:'0.85rem'}}>Need at least 2 players to start</div>
                ) : (
                  <div style={{color:'var(--text-muted)',fontSize:'0.85rem'}}>Waiting for host to start the race…</div>
                )}
                <div style={{marginTop:16,fontSize:'0.8rem',color:'var(--text-muted)'}}>
                  Share code <span style={{color:'var(--primary)',fontFamily:'Orbitron',letterSpacing:'0.1em'}}>{code}</span> to invite friends
                </div>
              </div>
            )}

            {(status === 'playing' || status === 'finished') && gameState && (
              <>
                {/* Race Track */}
                <div className="card" style={{padding:20,marginBottom:16}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                    <span style={{fontFamily:'Orbitron',fontSize:'0.75rem',letterSpacing:'0.1em',color:'var(--text-muted)',textTransform:'uppercase'}}>Race Track</span>
                    <span style={{fontSize:'0.8rem',color:'var(--text-muted)'}}>First to 100 wins!</span>
                  </div>
                  <RaceTrack players={gameState.players} />
                </div>

                {/* Dice + Turn area */}
                {status === 'playing' && (
                  <div className="card dice-roll-area">
                    <div className="dice-turn-info">
                      {currentPlayer && (
                        <div style={{fontSize:'0.9rem',marginBottom:4}}>
                          {currentPlayer.username===player?.username
                            ? <span style={{color:'var(--gold)',fontWeight:700}}>🎯 Your Turn!</span>
                            : <span style={{color:'var(--text-muted)'}}>⏳ {currentPlayer.username}'s turn</span>
                          }
                        </div>
                      )}
                      {myTurn && (
                        <div className="turn-timer-bar">
                          <div className="turn-timer-fill" style={{width:`${(timeLeft/25)*100}%`,background:timeLeft<=5?'#ff5252':'var(--gold)'}} />
                          <span className="turn-timer-text" style={{color:timeLeft<=5?'#ff5252':undefined}}>{timeLeft}s</span>
                        </div>
                      )}
                    </div>

                    <DiceDisplay value={lastRoll} rolling={rolling} />

                    {myTurn && (
                      <button
                        className="btn btn-primary btn-lg roll-btn"
                        onClick={handleRoll}
                        disabled={rolling}
                      >
                        {rolling ? '🎲 Rolling…' : '🎲 Roll Dice!'}
                      </button>
                    )}
                    {!myTurn && status==='playing' && (
                      <div style={{textAlign:'center',color:'var(--text-muted)',fontSize:'0.85rem',marginTop:8}}>
                        Waiting for {currentPlayer?.username}…
                      </div>
                    )}

                    {lastEffect && (
                      <div className="dice-effect-badge" style={{
                        background: lastEffect.type==='trap'?'rgba(255,82,82,.15)':
                                    lastEffect.type==='boost'?'rgba(76,175,80,.15)':
                                    'rgba(108,99,255,.15)',
                        borderColor: lastEffect.type==='trap'?'rgba(255,82,82,.3)':
                                     lastEffect.type==='boost'?'rgba(76,175,80,.3)':
                                     'rgba(108,99,255,.3)',
                        color: lastEffect.type==='trap'?'#ff5252':
                               lastEffect.type==='boost'?'#4caf50':
                               'var(--primary)',
                      }}>
                        {lastEffect.emoji} {lastEffect.label}
                      </div>
                    )}
                  </div>
                )}

                {/* Special tiles legend */}
                <div className="card" style={{padding:16,marginTop:12}}>
                  <div style={{fontFamily:'Orbitron',fontSize:'0.7rem',letterSpacing:'0.1em',color:'var(--text-muted)',textTransform:'uppercase',marginBottom:10}}>Special Tiles</div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {Object.entries(SPECIAL_TILES).map(([pos,t])=>(
                      <div key={pos} style={{padding:'3px 8px',borderRadius:4,fontSize:'0.72rem',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}}>
                        <span style={{color:'var(--text-muted)'}}>{pos} </span>{t.emoji}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Game Over */}
            {status === 'finished' && gameOver && (
              <div className="modal-overlay">
                <div className="card modal">
                  <div className="modal-result" style={{color: gameOver.winner===player?.username?'var(--gold)':'var(--secondary)'}}>
                    {gameOver.winner===player?.username ? '🏆 You Win!' : `${gameOver.winner} Wins the Race!`}
                  </div>
                  <div className="modal-subtitle">Final Standings</div>
                  <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:24}}>
                    {(gameState?.players||[]).slice().sort((a,b)=>b.position-a.position).map((p,i)=>(
                      <div key={p.username} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',borderRadius:10,background:'rgba(255,255,255,0.04)',border:`1px solid ${i===0?'rgba(255,215,0,0.3)':'transparent'}`}}>
                        <span style={{fontWeight:700}}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':'  '} {p.username}</span>
                        <span style={{fontFamily:'Orbitron',fontSize:'0.85rem',color:p.color}}>{p.position}/100</span>
                      </div>
                    ))}
                  </div>
                  <button className="btn btn-primary btn-lg" onClick={handleLeave}>Return to Lobby</button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: log + chat */}
          <div className="dice-sidebar">
            {gameState?.log?.length > 0 && (
              <div className="card" style={{padding:14,marginBottom:12}}>
                <div style={{fontFamily:'Orbitron',fontSize:'0.7rem',letterSpacing:'0.1em',color:'var(--text-muted)',textTransform:'uppercase',marginBottom:10}}>Event Log</div>
                <div style={{maxHeight:180,overflowY:'auto',display:'flex',flexDirection:'column',gap:6}}>
                  {(gameState.log||[]).map((entry,i)=>(
                    <div key={i} style={{fontSize:'0.78rem',padding:'5px 8px',borderRadius:6,background:'rgba(255,255,255,0.03)',borderLeft:`3px solid ${entry.to>=100?'var(--gold)':entry.tile?.type==='trap'?'#ff5252':entry.tile?.type==='boost'?'#4caf50':'rgba(108,99,255,0.5)'}`}}>
                      <span style={{fontWeight:600}}>{entry.username}</span>
                      <span style={{color:'var(--text-muted)'}}> rolled </span>
                      <span style={{color:'var(--accent)',fontWeight:600}}>{entry.roll}</span>
                      <span style={{color:'var(--text-muted)'}}> → {entry.to}</span>
                      {entry.tile && <span style={{marginLeft:4}}>{entry.tile.emoji}</span>}
                      {entry.to>=100 && <span style={{marginLeft:4}}>🏁</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Chat
              messages={room?.chat||[]}
              myUsername={player?.username}
              onSend={msg=>socket.emit('send_chat',{code,message:msg})}
              disabled={!room}
            />
          </div>
        </div>
      </div>
    </>
  );
}
