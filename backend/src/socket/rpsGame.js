// Pure logic for Rock Paper Scissors — best of 5 (first to 3 wins)

const WIN_ROUNDS   = 3;
const TURN_SECONDS = 10;
const MAX_ROUNDS   = 5;

const EMOJIS = { rock: '🪨', paper: '📄', scissors: '✂️' };

// What beats what
const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

function createRPSState(players) {
  return {
    players: [
      { username: players[0].username, score: 0, choice: null, ready: false },
      { username: players[1].username, score: 0, choice: null, ready: false },
    ],
    round: 1,
    maxRounds: MAX_ROUNDS,
    winRounds: WIN_ROUNDS,
    roundResult: null,
    winner: null,
    timeLeft: TURN_SECONDS,
    status: 'choosing', // choosing | revealing
  };
}

// Call when both players have chosen (or timed out)
function resolveRound(state) {
  const [p0, p1] = state.players;
  const c0 = p0.choice || 'rock'; // default on timeout
  const c1 = p1.choice || 'rock';

  let roundWinner = null;
  if (c0 !== c1) {
    if (BEATS[c0] === c1) { p0.score++; roundWinner = p0.username; }
    else                   { p1.score++; roundWinner = p1.username; }
  }

  state.roundResult = {
    round: state.round,
    choices: { [p0.username]: c0, [p1.username]: c1 },
    winner: roundWinner,
  };
  state.status = 'revealing';

  // Check match winner
  const match = state.players.find(p => p.score >= WIN_ROUNDS);
  if (match || state.round >= MAX_ROUNDS) {
    const mw = state.players[0].score > state.players[1].score ? state.players[0]
             : state.players[1].score > state.players[0].score ? state.players[1]
             : null;
    state.winner = mw?.username || null;
    return { over: true, winner: state.winner };
  }
  return { over: false, roundWinner };
}

function nextRound(state) {
  state.round++;
  state.players.forEach(p => { p.choice = null; p.ready = false; });
  state.roundResult = null;
  state.status = 'choosing';
  state.timeLeft = TURN_SECONDS;
}

module.exports = { createRPSState, resolveRound, nextRound, EMOJIS, WIN_ROUNDS, TURN_SECONDS };
