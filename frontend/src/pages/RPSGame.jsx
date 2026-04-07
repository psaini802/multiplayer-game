import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import socket from '../socket';
import { useGame } from '../context/GameContext';
import Chat from '../components/Chat';

const CHOICES = [
  { id: 'rock',     emoji: '🪨', label: 'Rock' },
  { id: 'paper',    emoji: '📄', label: 'Paper' },
  { id: 'scissors', emoji: '✂️', label: 'Scissors' },
];

const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

function outcomeLabel(myChoice, oppChoice) {
  if (!myChoice || !oppChoice) return '';
  if (myChoice === oppChoice) return 'Draw!';
  return BEATS[myChoice] === oppChoice ? 'You Win!' : 'You Lose!';
}

export default function RPSGame() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { player, showToast } = useGame();
  const hasJoined = useRef(false);

  const [status, setStatus]     = useState('waiting');
  const [gameState, setGS]      = useState(null);
  const [myChoice, setMyChoice] = useState(null);
  const [timeLeft, setTimeLeft] = useState(10);
  const [players, setPlayers]   = useState([]);
  const [chat, setChat]         = useState([]);
  const [oppChosen, setOppChosen] = useState(false);
  const [roundResult, setRoundResult] = useState(null); // null | { choices, winner }
  const [matchWinner, setMatchWinner] = useState(null);
  const [revealKey, setRevealKey] = useState(0); // force re-animation

  const myData = gameState?.players?.find(p => p.username === player?.username);
  const oppData = gameState?.players?.find(p => p.username !== player?.username);

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
      setPlayers(room.players);
      setChat(room.chat || []);
      if (room.gameState) { setGS(room.gameState); setStatus(room.status); }
    }

    function onGameStart(room) {
      setStatus('playing');
      setPlayers(room.players);
      if (room.gameState) { setGS(room.gameState); setTimeLeft(room.gameState.timeLeft); }
    }

    function onRPSTimer({ timeLeft: t }) { setTimeLeft(t); }

    function onStatus({ chosen }) {
      const opp = chosen.find(c => c.username !== player?.username);
      setOppChosen(opp?.hasChosen || false);
    }

    function onChose({ username }) {
      if (username === player?.username) setMyChoice(prev => prev); // keep local state
    }

    function onRoundResult({ gameState: gs, result }) {
      setGS({ ...gs });
      setRoundResult(result);
      setRevealKey(k => k + 1);
      setMyChoice(null);
      setOppChosen(false);
    }

    function onNextRound({ gameState: gs }) {
      setGS({ ...gs });
      setRoundResult(null);
      setTimeLeft(gs.timeLeft);
    }

    function onRPSOver({ winner: w }) {
      setMatchWinner(w);
      setStatus('finished');
    }

    function onPlayerJoined(room) { setPlayers(room.players); }
    function onRejoined({ symbol, room }) { onJoined({ symbol, room }); }
    function onChat(msg) { setChat(prev => [...prev.slice(-99), msg]); }

    socket.on('error',            onError);
    socket.on('room_joined',      onJoined);
    socket.on('room_rejoined',    onRejoined);
    socket.on('game_start',       onGameStart);
    socket.on('player_joined',    onPlayerJoined);
    socket.on('rps_timer',        onRPSTimer);
    socket.on('rps_status',       onStatus);
    socket.on('rps_chose',        onChose);
    socket.on('rps_round_result', onRoundResult);
    socket.on('rps_next_round',   onNextRound);
    socket.on('rps_over',         onRPSOver);
    socket.on('chat_message',     onChat);

    if (!hasJoined.current) {
      hasJoined.current = true;
      socket.emit('join_room', { code });
    }

    const onBeforeUnload = () => socket.emit('leave_room', { code });
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      socket.off('error',            onError);
      socket.off('room_joined',      onJoined);
      socket.off('room_rejoined',    onRejoined);
      socket.off('game_start',       onGameStart);
      socket.off('player_joined',    onPlayerJoined);
      socket.off('rps_timer',        onRPSTimer);
      socket.off('rps_status',       onStatus);
      socket.off('rps_chose',        onChose);
      socket.off('rps_round_result', onRoundResult);
      socket.off('rps_next_round',   onNextRound);
      socket.off('rps_over',         onRPSOver);
      socket.off('chat_message',     onChat);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [code, player, navigate, showToast]);

  const handleChoose = (choice) => {
    if (myChoice || gameState?.status !== 'choosing' || status !== 'playing') return;
    setMyChoice(choice);
    socket.emit('rps_choose', { code, choice });
  };

  const handleLeave = () => {
    socket.emit('leave_room', { code });
    navigate('/lobby');
  };

  const sendChat = (msg) => socket.emit('send_chat', { code, message: msg });

  const myRoundChoice  = roundResult?.choices?.[player?.username];
  const oppRoundChoice = roundResult?.choices?.[oppData?.username];
  const roundOutcome   = outcomeLabel(myRoundChoice, oppRoundChoice);

  const timerPct = (timeLeft / 10) * 100;
  const timerColor = timeLeft <= 3 ? '#ff4444' : timeLeft <= 6 ? '#ffd700' : '#6c63ff';

  return (
    <div className="rps-page">
      {/* Score board */}
      {gameState && (
        <div className="rps-scoreboard">
          <div className="rps-score-card">
            <span className="rps-score-name">{myData?.username || '...'}</span>
            <span className="rps-score-num">{myData?.score ?? 0}</span>
          </div>
          <div className="rps-round-info">
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Round {gameState.round} / {gameState.maxRounds}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              First to {gameState.winRounds} wins
            </span>
          </div>
          <div className="rps-score-card">
            <span className="rps-score-num">{oppData?.score ?? 0}</span>
            <span className="rps-score-name">{oppData?.username || '...'}</span>
          </div>
        </div>
      )}

      {/* Timer */}
      {status === 'playing' && gameState?.status === 'choosing' && !roundResult && (
        <div className="rps-timer-wrap">
          <div className="rps-timer-bar" style={{ width: `${timerPct}%`, background: timerColor }} />
          <span className="rps-timer-label" style={{ color: timerColor }}>{timeLeft}s</span>
        </div>
      )}

      {/* Main area */}
      <div className="rps-arena">
        {/* Reveal after round */}
        {roundResult && (
          <div className="rps-reveal" key={revealKey}>
            <div className="rps-reveal-side">
              <div className="rps-reveal-emoji">{CHOICES.find(c => c.id === myRoundChoice)?.emoji || '?'}</div>
              <div className="rps-reveal-name">{myData?.username}</div>
              <div className="rps-reveal-choice">{myRoundChoice}</div>
            </div>
            <div className="rps-reveal-outcome" style={{
              color: roundOutcome === 'You Win!' ? 'var(--primary)'
                   : roundOutcome === 'You Lose!' ? 'var(--danger)' : 'var(--gold)'
            }}>
              {roundOutcome}
            </div>
            <div className="rps-reveal-side">
              <div className="rps-reveal-emoji">{CHOICES.find(c => c.id === oppRoundChoice)?.emoji || '?'}</div>
              <div className="rps-reveal-name">{oppData?.username}</div>
              <div className="rps-reveal-choice">{oppRoundChoice}</div>
            </div>
          </div>
        )}

        {/* Choice buttons */}
        {status === 'playing' && !roundResult && (
          <div className="rps-choices">
            {CHOICES.map(ch => (
              <button
                key={ch.id}
                className={`rps-choice-btn ${myChoice === ch.id ? 'chosen' : ''} ${myChoice && myChoice !== ch.id ? 'unchosen' : ''}`}
                onClick={() => handleChoose(ch.id)}
              >
                <span className="rps-choice-emoji">{ch.emoji}</span>
                <span className="rps-choice-label">{ch.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Status text */}
        {status === 'playing' && !roundResult && (
          <div className="rps-status-text">
            {myChoice
              ? <span style={{ color: 'var(--primary)' }}>✓ Locked in! Waiting for opponent{oppChosen ? ' (they chose!)' : '...'}</span>
              : oppChosen
              ? <span style={{ color: 'var(--gold)' }}>Opponent has chosen — pick yours!</span>
              : <span style={{ color: 'var(--text-muted)' }}>Pick your move!</span>
            }
          </div>
        )}
      </div>

      {/* Waiting overlay */}
      {status === 'waiting' && (
        <div className="game-overlay">
          <div className="game-overlay-card">
            <div style={{ fontSize: '3rem' }}>✂️</div>
            <h2>Rock Paper Scissors</h2>
            <p>Room Code: <strong style={{ color: 'var(--primary)' }}>{code}</strong></p>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Best of 5 — first to 3 wins!</p>
            <p style={{ color: 'var(--text-muted)' }}>Waiting for opponent...</p>
          </div>
        </div>
      )}

      {/* Match over overlay */}
      {status === 'finished' && (
        <div className="game-overlay">
          <div className="game-overlay-card">
            <div style={{ fontSize: '3.5rem' }}>
              {matchWinner === player?.username ? '🏆' : matchWinner ? '💀' : '🤝'}
            </div>
            <h2 style={{ color: matchWinner === player?.username ? 'var(--primary)' : matchWinner ? 'var(--danger)' : 'var(--gold)' }}>
              {matchWinner === player?.username ? 'You Win the Match!' : matchWinner ? `${matchWinner} Wins!` : "It's a Draw!"}
            </h2>
            {gameState && (
              <div className="rps-final-scores">
                {gameState.players.map(p => (
                  <div key={p.username} style={{ color: p.username === matchWinner ? 'var(--primary)' : 'var(--text-muted)' }}>
                    {p.username}: <strong>{p.score}</strong> rounds
                  </div>
                ))}
              </div>
            )}
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
