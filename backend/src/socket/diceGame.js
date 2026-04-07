// Pure logic for Multiplayer Dice Racing — no I/O, no socket references

const SPECIAL_TILES = {
  6:  { type: 'boost', value: 6,   emoji: '🚀', label: 'Rocket! +6'       },
  13: { type: 'trap',  value: -4,  emoji: '💥', label: 'Trap! −4'         },
  20: { type: 'extra',             emoji: '🎲', label: 'Roll Again!'       },
  24: { type: 'jump',  dest: 45,   emoji: '⭐', label: 'Shortcut! → 45'   },
  35: { type: 'trap',  value: -7,  emoji: '🕳', label: 'Pitfall! −7'      },
  40: { type: 'boost', value: 10,  emoji: '🏆', label: 'Halfway +10'      },
  48: { type: 'extra',             emoji: '🎲', label: 'Roll Again!'       },
  52: { type: 'trap',  value: -5,  emoji: '💀', label: 'Disaster! −5'     },
  60: { type: 'boost', value: 8,   emoji: '🚀', label: 'Sprint! +8'       },
  70: { type: 'jump',  dest: 85,   emoji: '⚡', label: 'Lightning! → 85'  },
  75: { type: 'trap',  value: -10, emoji: '😱', label: 'Nightmare! −10'   },
  80: { type: 'extra',             emoji: '🎲', label: 'Roll Again!'       },
  88: { type: 'boost', value: 5,   emoji: '💨', label: 'Final Push! +5'   },
};

const PLAYER_COLORS  = ['#6c63ff', '#ff6b9d', '#00d2ff', '#ffd700'];
const PLAYER_AVATARS = ['🟣', '🔴', '🔵', '🟡'];
const TURN_SECONDS   = 25;

function createDiceState(playerList) {
  return {
    players: playerList.map((p, i) => ({
      username: p.username,
      position: 0,
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      avatar: PLAYER_AVATARS[i % PLAYER_AVATARS.length],
    })),
    currentIdx: 0,
    lastRoll: null,
    lastEffect: null,
    log: [],
    turnTimeLeft: TURN_SECONDS,
  };
}

function rollDice() { return Math.floor(Math.random() * 6) + 1; }

// Returns the roll result or null if it's not this player's turn
function processDiceRoll(state, username) {
  const idx = state.players.findIndex(p => p.username === username);
  if (idx !== state.currentIdx) return null;

  const player = state.players[idx];
  const roll     = rollDice();
  const fromPos  = player.position;
  let   toPos    = Math.min(fromPos + roll, 100);

  state.lastRoll   = roll;
  state.lastEffect = null;

  const tile = SPECIAL_TILES[toPos] || null;
  let canRollAgain = false;

  if (tile) {
    state.lastEffect = tile;
    if (tile.type === 'boost' || tile.type === 'trap') {
      toPos = Math.max(0, Math.min(100, toPos + tile.value));
    } else if (tile.type === 'jump') {
      toPos = tile.dest;
    } else if (tile.type === 'extra') {
      canRollAgain = true;
    }
  }

  player.position = toPos;
  const winner = toPos >= 100 ? username : null;

  const entry = { username, roll, from: fromPos, to: toPos, tile, canRollAgain, winner };
  state.log.unshift(entry);
  if (state.log.length > 20) state.log.pop();

  if (!winner && !canRollAgain) {
    state.currentIdx = (state.currentIdx + 1) % state.players.length;
  }
  state.turnTimeLeft = TURN_SECONDS;

  return entry;
}

module.exports = {
  createDiceState, processDiceRoll, rollDice,
  SPECIAL_TILES, PLAYER_COLORS, PLAYER_AVATARS, TURN_SECONDS,
};
