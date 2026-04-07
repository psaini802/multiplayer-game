// Pure logic for Arena Snake — no I/O, no socket references

const GRID = { W: 30, H: 20 };
const MAX_FOOD = 6;
const TICK_MS = 120;

const PLAYER_COLORS = ['#6c63ff', '#ff6b9d', '#00d2ff', '#ffd700'];

// Starting positions (head first, tail stretches backwards)
const STARTS = [
  { segs: [[2, 2], [1, 2], [0, 2]],         dir: 'right' },
  { segs: [[27, 17], [28, 17], [29, 17]],   dir: 'left'  },
  { segs: [[27, 2], [27, 1], [27, 0]],      dir: 'down'  },
  { segs: [[2, 17], [2, 18], [2, 19]],      dir: 'up'    },
];

const OPP   = { up: 'down', down: 'up', left: 'right', right: 'left' };
const DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function createSnakeState(playerList) {
  const snakes = {};
  playerList.forEach((p, i) => {
    const s = STARTS[i % STARTS.length];
    snakes[p.username] = {
      segments: s.segs.map(seg => [...seg]),
      dir: s.dir,
      nextDir: null,
      alive: true,
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      score: 0,
    };
  });

  const state = { snakes, food: [], tick: 0, grid: { ...GRID } };
  for (let i = 0; i < 3; i++) spawnFood(state);
  return state;
}

function spawnFood(state) {
  if (state.food.length >= MAX_FOOD) return;
  const occupied = new Set();
  for (const s of Object.values(state.snakes)) {
    for (const [x, y] of s.segments) occupied.add(`${x},${y}`);
  }
  for (const [x, y] of state.food) occupied.add(`${x},${y}`);

  for (let i = 0; i < 300; i++) {
    const x = Math.floor(Math.random() * GRID.W);
    const y = Math.floor(Math.random() * GRID.H);
    if (!occupied.has(`${x},${y}`)) { state.food.push([x, y]); return; }
  }
}

// Returns { over: bool, winner: username|null }
function tickSnake(state) {
  state.tick++;
  const { snakes, food } = state;

  // Apply queued direction, compute new heads
  const newHeads = {};
  for (const [u, s] of Object.entries(snakes)) {
    if (!s.alive) continue;
    if (s.nextDir && s.nextDir !== OPP[s.dir]) s.dir = s.nextDir;
    s.nextDir = null;
    const [hx, hy] = s.segments[0];
    const [dx, dy] = DELTA[s.dir];
    newHeads[u] = [hx + dx, hy + dy];
  }

  // Wall collisions
  for (const [u, s] of Object.entries(snakes)) {
    if (!s.alive) continue;
    const [nx, ny] = newHeads[u];
    if (nx < 0 || nx >= GRID.W || ny < 0 || ny >= GRID.H) s.alive = false;
  }

  // Body collisions — only current bodies (tail will vacate, so exclude last seg)
  const bodySet = new Map();
  for (const [u, s] of Object.entries(snakes)) {
    if (!s.alive) continue;
    for (let i = 0; i < s.segments.length - 1; i++) {
      const [x, y] = s.segments[i];
      bodySet.set(`${x},${y}`, u);
    }
  }
  for (const [u, s] of Object.entries(snakes)) {
    if (!s.alive) continue;
    const k = `${newHeads[u][0]},${newHeads[u][1]}`;
    if (bodySet.has(k)) s.alive = false;
  }

  // Head-head collision
  const headMap = {};
  for (const [u, s] of Object.entries(snakes)) {
    if (!s.alive) continue;
    const k = `${newHeads[u][0]},${newHeads[u][1]}`;
    if (headMap[k]) { s.alive = false; snakes[headMap[k]].alive = false; }
    else headMap[k] = u;
  }

  // Move alive snakes, consume food
  for (const [u, s] of Object.entries(snakes)) {
    if (!s.alive) continue;
    const nh = newHeads[u];
    const fi = food.findIndex(f => f[0] === nh[0] && f[1] === nh[1]);
    if (fi !== -1) {
      food.splice(fi, 1);
      s.score++;
      s.segments.unshift(nh);
      spawnFood(state);
    } else {
      s.segments.unshift(nh);
      s.segments.pop();
    }
  }

  // Win detection
  const alive = Object.entries(snakes).filter(([, s]) => s.alive);
  const total = Object.keys(snakes).length;

  if (alive.length === 0) return { over: true, winner: null };
  if (total > 1 && alive.length === 1) return { over: true, winner: alive[0][0] };
  if (total === 1 && alive.length === 0) return { over: true, winner: null };

  return { over: false };
}

module.exports = { createSnakeState, tickSnake, spawnFood, PLAYER_COLORS, TICK_MS };
