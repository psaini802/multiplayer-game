import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import socket from '../socket';
import Board from '../components/Board';
import Chat from '../components/Chat';
import PlayerCard from '../components/PlayerCard';

export default function Game() {
  const { code } = useParams();
  const { player, setPlayer, showToast } = useGame();
  const navigate = useNavigate();

  const [room, setRoom] = useState(null);
  const [mySymbol, setMySymbol] = useState(null);
  const [isSpectator, setIsSpectator] = useState(false);
  const [gameOver, setGameOver] = useState(null);   // { winner, winLine, eloChanges, playerStats }
  const [rematchRequests, setRematchRequests] = useState([]);
  const [disconnected, setDisconnected] = useState(null);
  const [copied, setCopied] = useState(false);
  const hasJoinedRef = useRef(false);

  const copyCode = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  useEffect(() => {
    const onRoomCreated = ({ code: c, symbol, room: r }) => {
      setMySymbol(symbol);
      setRoom(r);
    };
    const onRoomJoined = ({ symbol, room: r }) => {
      setMySymbol(symbol);
      setRoom(r);
    };
    const onRoomRejoined = ({ symbol, room: r, isSpectator: spec }) => {
      if (spec) {
        setIsSpectator(true);
      } else {
        setMySymbol(symbol);
      }
      setRoom(r);
      if (r.status === 'finished') {
        // Restore game over state on reconnect
        setGameOver({ winner: r.winner, winLine: r.winLine, eloChanges: {}, playerStats: {} });
      }
    };
    const onSpectator = ({ room: r }) => {
      setIsSpectator(true);
      setRoom(r);
      showToast('Joined as spectator 👁', 'warning');
    };
    const onGameStart = (r) => {
      setRoom(r);
      setGameOver(null);
      setRematchRequests([]);
      setDisconnected(null);
      showToast('Game started! Good luck 🎮', 'success');
    };
    const onMoveMade = ({ board, currentTurn }) => {
      setRoom(prev => prev ? { ...prev, board, currentTurn } : prev);
    };
    const onGameOver = (data) => {
      setRoom(prev => prev ? { ...prev, board: data.board, winner: data.winner, winLine: data.winLine, status: 'finished' } : prev);
      setGameOver(data);
      if (data.playerStats?.[player.username]) {
        const updated = data.playerStats[player.username];
        setPlayer(updated);
        localStorage.setItem('ttt_player', JSON.stringify(updated));
      }
    };
    const onChatMessage = (msg) => {
      setRoom(prev => {
        if (!prev) return prev;
        return { ...prev, chat: [...(prev.chat || []), msg].slice(-50) };
      });
    };
    const onRematchRequested = ({ username, requests }) => {
      setRematchRequests(requests || [username]);
      if (username !== player.username) showToast(`${username} wants a rematch!`, 'info');
    };
    const onRematchStarted = (r) => {
      setRoom(r);
      setMySymbol(r.players.find(p => p.username === player.username)?.symbol || mySymbol);
      setGameOver(null);
      setRematchRequests([]);
      setDisconnected(null);
      showToast('Rematch started! Symbols swapped 🔄', 'success');
    };
    const onPlayerDisconnected = ({ username }) => {
      setDisconnected(username);
      showToast(`${username} disconnected — 30s to reconnect`, 'warning');
    };
    const onPlayerLeft = ({ username }) => {
      showToast(`${username} left the game`, 'error');
      setTimeout(() => navigate('/lobby'), 3000);
    };
    const onRoomUpdated = (r) => {
      setRoom(r);
      if (r.status === 'waiting') setDisconnected(null);
    };
    const onError = ({ message }) => {
      if (message === 'Not registered') {
        // Socket reconnected with a new ID before register was processed — retry once registered
        socket.once('registered', () => socket.emit('join_room', { code }));
        return;
      }
      showToast(message, 'error');
      if (message === 'Room not found') setTimeout(() => navigate('/lobby'), 2000);
    };

    socket.on('room_created', onRoomCreated);
    socket.on('room_joined', onRoomJoined);
    socket.on('room_rejoined', onRoomRejoined);
    socket.on('joined_as_spectator', onSpectator);
    socket.on('game_start', onGameStart);
    socket.on('move_made', onMoveMade);
    socket.on('game_over', onGameOver);
    socket.on('chat_message', onChatMessage);
    socket.on('rematch_requested', onRematchRequested);
    socket.on('rematch_started', onRematchStarted);
    socket.on('player_disconnected', onPlayerDisconnected);
    socket.on('player_left', onPlayerLeft);
    socket.on('room_updated', onRoomUpdated);
    socket.on('error', onError);

    // Only join once per real mount (guards against React Strict Mode double-invoke)
    if (!hasJoinedRef.current) {
      hasJoinedRef.current = true;
      socket.emit('join_room', { code });
    }

    return () => {
      socket.off('room_created', onRoomCreated);
      socket.off('room_joined', onRoomJoined);
      socket.off('room_rejoined', onRoomRejoined);
      socket.off('joined_as_spectator', onSpectator);
      socket.off('game_start', onGameStart);
      socket.off('move_made', onMoveMade);
      socket.off('game_over', onGameOver);
      socket.off('chat_message', onChatMessage);
      socket.off('rematch_requested', onRematchRequested);
      socket.off('rematch_started', onRematchStarted);
      socket.off('player_disconnected', onPlayerDisconnected);
      socket.off('player_left', onPlayerLeft);
      socket.off('room_updated', onRoomUpdated);
      socket.off('error', onError);
      // leave_room is only sent via handleLeave() or beforeunload;
      // the server's disconnect handler cleans up rooms on socket drop.
    };
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  // Notify server when user navigates away via browser controls
  useEffect(() => {
    hasJoinedRef.current = false; // reset so join fires when code changes
    const onUnload = () => socket.emit('leave_room', { code });
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [code]);

  const handleMove = useCallback((index) => {
    if (!room || room.status !== 'playing') return;
    if (isSpectator) return;
    socket.emit('make_move', { code, index });
  }, [room, code, isSpectator]);

  const handleRematch = () => {
    socket.emit('request_rematch', { code });
  };

  const handleLeave = () => {
    socket.emit('leave_room', { code });
    navigate('/lobby');
  };

  const playerX = room?.players.find(p => p.symbol === 'X');
  const playerO = room?.players.find(p => p.symbol === 'O');
  const myTurn = room?.status === 'playing' && room?.currentTurn === mySymbol && !isSpectator;

  const getStatusText = () => {
    if (!room) return 'Connecting…';
    if (room.status === 'waiting') return isSpectator ? 'Spectating — waiting for players' : 'Waiting for opponent…';
    if (room.status === 'finished') return 'Game over';
    if (isSpectator) return `Spectating — ${room.currentTurn}'s turn`;
    return myTurn ? 'Your turn!' : `Opponent's turn (${room.currentTurn})`;
  };

  const statusClass = () => {
    if (!room || room.status === 'waiting') return isSpectator ? 'spectator' : 'waiting';
    if (room.status === 'finished') return 'their-turn';
    if (isSpectator) return 'spectator';
    return myTurn ? 'your-turn' : 'their-turn';
  };

  const getResultLabel = () => {
    if (!gameOver) return '';
    const { winner } = gameOver;
    if (isSpectator) return winner === 'draw' ? 'Draw!' : `${room?.players.find(p => p.symbol === winner)?.username} Wins!`;
    if (winner === 'draw') return "It's a Draw!";
    const iWon = (winner === mySymbol);
    return iWon ? '🏆 You Win!' : '😢 You Lose';
  };

  const getResultClass = () => {
    if (!gameOver) return '';
    if (gameOver.winner === 'draw') return 'draw';
    if (isSpectator) return 'win';
    return gameOver.winner === mySymbol ? 'win' : 'lose';
  };

  return (
    <>
      <div className="page-bg" />
      <div className="page game-page">
        {/* Header */}
        <div className="game-header">
          <button className="btn btn-ghost" style={{ padding: '8px 16px', fontSize: '0.82rem' }} onClick={handleLeave}>
            ← Lobby
          </button>
          <div className="game-room-code" onClick={copyCode} title="Click to copy">
            <div className="room-code-label">Room</div>
            <span>{code}</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{copied ? '✓ Copied' : '⎘'}</span>
          </div>
          {isSpectator && <span className="badge badge-spectator">👁 Spectator</span>}
          {!isSpectator && room && <div style={{ width: 80 }} />}
        </div>

        {/* Mobile player bar */}
        {room?.players.length === 2 && (
          <div className="game-mobile-players" style={{ maxWidth: 900, margin: '0 auto 16px', width: '100%' }}>
            {[playerX, playerO].map(p => p && (
              <div key={p.username} className={`player-card ${room.currentTurn === p.symbol && room.status === 'playing' ? `active-turn symbol-${p.symbol.toLowerCase()}` : ''}`}>
                <div className={`player-card-symbol ${p.symbol.toLowerCase()}`}>{p.symbol}</div>
                <div>
                  <div className="player-card-name">{p.username}</div>
                  <div className="player-card-elo">{p.elo} <span>ELO</span></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Main layout */}
        <div className="game-layout">
          {/* Left player card (X) */}
          <div>
            {playerX ? (
              <PlayerCard
                player={playerX}
                active={room?.currentTurn === 'X' && room?.status === 'playing'}
                eloChange={gameOver?.eloChanges?.[playerX.username]}
                finalStats={gameOver?.playerStats?.[playerX.username]}
              />
            ) : (
              <div className="player-card" style={{ opacity: .4 }}>
                <div className="player-card-symbol x">X</div>
                <div className="player-card-name" style={{ color: 'var(--text-muted)' }}>Waiting…</div>
              </div>
            )}
          </div>

          {/* Center: board + status */}
          <div className="game-center">
            <div className={`game-status ${statusClass()}`}>{getStatusText()}</div>

            {disconnected && (
              <div style={{ fontSize: '0.82rem', color: 'var(--gold)', padding: '6px 16px', background: 'rgba(255,215,0,.08)', borderRadius: 8, border: '1px solid rgba(255,215,0,.2)' }}>
                ⚠ {disconnected} disconnected — waiting to reconnect (30s)
              </div>
            )}

            <Board
              board={room?.board || Array(9).fill(null)}
              onMove={handleMove}
              currentTurn={room?.currentTurn}
              mySymbol={mySymbol}
              winLine={room?.winLine || []}
              disabled={!myTurn || !!gameOver || room?.status !== 'playing'}
            />

            {/* Chat below board on mobile */}
            <div style={{ width: '100%', display: 'none' }} className="mobile-chat">
              <Chat
                messages={room?.chat || []}
                myUsername={player?.username}
                onSend={(msg) => socket.emit('send_chat', { code, message: msg })}
                disabled={!room}
              />
            </div>
          </div>

          {/* Right: chat */}
          <Chat
            messages={room?.chat || []}
            myUsername={player?.username}
            onSend={(msg) => socket.emit('send_chat', { code, message: msg })}
            disabled={!room}
          />
        </div>

        {/* Game Over Modal */}
        {gameOver && (
          <div className="modal-overlay">
            <div className="card modal">
              <div className={`modal-result ${getResultClass()}`}>{getResultLabel()}</div>
              <div className="modal-subtitle">
                {gameOver.winner === 'draw'
                  ? 'No one could claim victory this time.'
                  : `${room?.players.find(p => p.symbol === gameOver.winner)?.username} played the winning move.`}
              </div>

              {Object.keys(gameOver.eloChanges || {}).length > 0 && (
                <div className="modal-elo-row">
                  {room?.players.map(p => {
                    const delta = gameOver.eloChanges?.[p.username] ?? 0;
                    const newElo = gameOver.playerStats?.[p.username]?.elo_rating ?? p.elo;
                    return (
                      <div key={p.username} className="modal-elo-item">
                        <div className="modal-elo-name">{p.username} ({p.symbol})</div>
                        <div className="modal-elo-value">{newElo}</div>
                        <div className={`modal-elo-delta ${delta >= 0 ? 'pos' : 'neg'}`}>
                          {delta >= 0 ? '+' : ''}{delta} ELO
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="modal-actions">
                {!isSpectator && (
                  <>
                    <button
                      className="btn btn-primary"
                      onClick={handleRematch}
                      disabled={rematchRequests.includes(player?.username)}
                    >
                      {rematchRequests.includes(player?.username) ? '⏳ Waiting for opponent…' : '🔄 Rematch'}
                    </button>
                    {rematchRequests.length > 0 && !rematchRequests.includes(player?.username) && (
                      <div className="rematch-indicator">
                        <span>{rematchRequests[0]}</span> wants a rematch!
                      </div>
                    )}
                  </>
                )}
                <button className="btn btn-ghost" onClick={handleLeave}>
                  Return to Lobby
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
