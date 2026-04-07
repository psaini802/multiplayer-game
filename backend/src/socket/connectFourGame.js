// Pure logic for Connect Four

const ROWS = 6, COLS = 7;
const WIN_LENGTH = 4;
const DIRS = [[0,1],[1,0],[1,1],[1,-1]];

const TOKENS = { 0: 'R', 1: 'Y' };
const COLORS = { R: '#6c63ff', Y: '#ffd700' };

function createC4State(players) {
  return {
    board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    currentTurn: 'R',
    players: {
      R: { username: players[0].username, color: COLORS.R },
      Y: { username: players[1].username, color: COLORS.Y },
    },
    winner: null,
    winCells: [],
    rows: ROWS,
    cols: COLS,
  };
}

// Drop a token in col; returns { row } or null if full
function dropToken(board, col, token) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (!board[r][col]) {
      board[r][col] = token;
      return r;
    }
  }
  return null;
}

// Returns winning cells [[r,c],...] or null
function findWin(board, token) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== token) continue;
      for (const [dr, dc] of DIRS) {
        const cells = [];
        for (let i = 0; i < WIN_LENGTH; i++) {
          const nr = r + dr * i, nc = c + dc * i;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc] !== token) break;
          cells.push([nr, nc]);
        }
        if (cells.length === WIN_LENGTH) return cells;
      }
    }
  }
  return null;
}

function isFull(board) {
  return board[0].every(c => c !== null);
}

module.exports = { createC4State, dropToken, findWin, isFull, ROWS, COLS, TOKENS, COLORS };
