// Server-authoritative top-down arena shooter

const CANVAS  = { W: 800, H: 560 };
const PLAYER_R     = 16;
const BULLET_R     = 5;
const SPEED        = 3.8;
const BULLET_SPEED = 12;
const BULLET_DMG   = 25;   // 4 hits to kill
const MAX_HP       = 100;
const BULLET_LIFE  = 60;   // ticks
const SHOOT_CD     = 14;   // ticks between shots (~2 shots/sec at 30fps)
const TICK_MS      = 33;

const SPAWNS = [
  { x: 60,          y: 60 },
  { x: CANVAS.W-60, y: CANVAS.H-60 },
  { x: CANVAS.W-60, y: 60 },
  { x: 60,          y: CANVAS.H-60 },
];
const COLORS = ['#6c63ff', '#ff6b9d', '#00e5ff', '#ffd700'];

// Symmetric arena layout
const OBSTACLES = [
  { x: 200, y: 130, w: 90, h: 18 },
  { x: 510, y: 130, w: 90, h: 18 },
  { x: 391, y:  70, w: 18, h: 90 },
  { x: 200, y: 412, w: 90, h: 18 },
  { x: 510, y: 412, w: 90, h: 18 },
  { x: 391, y: 400, w: 18, h: 90 },
  { x: 310, y: 271, w: 180, h: 18 },  // center wall
  { x:  95, y: 240, w: 18, h: 80 },
  { x: 687, y: 240, w: 18, h: 80 },
];

// ── Collision helpers ──────────────────────────────────────────────────────
function rectCircle(rx, ry, rw, rh, cx, cy, cr) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < cr * cr;
}

function circleCircle(ax, ay, ar, bx, by, br) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy < (ar + br) * (ar + br);
}

// ── State factory ──────────────────────────────────────────────────────────
function createShooterState(roomPlayers) {
  const players = {};
  roomPlayers.forEach((p, i) => {
    players[p.username] = {
      username:      p.username,
      x:             SPAWNS[i % SPAWNS.length].x,
      y:             SPAWNS[i % SPAWNS.length].y,
      angle:         0,
      hp:            MAX_HP,
      alive:         true,
      color:         COLORS[i % COLORS.length],
      score:         0,
      // internal (stripped before broadcast)
      keys:          {},
      shootCooldown: 0,
    };
  });
  return {
    players,
    bullets:      [],
    obstacles:    OBSTACLES,
    canvas:       CANVAS,
    playerR:      PLAYER_R,
    bulletR:      BULLET_R,
    maxHp:        MAX_HP,
    _nextId:      0,
  };
}

// Returns { over, winner?, kills: [{killer,victim}] }
function tickShooter(state) {
  const { players, bullets, obstacles } = state;
  const kills = [];

  // ── Move players ────────────────────────────────────────────────────────
  for (const p of Object.values(players)) {
    if (!p.alive) continue;
    if (p.shootCooldown > 0) p.shootCooldown--;

    const { keys } = p;
    let dx = 0, dy = 0;
    if (keys.w || keys.ArrowUp)    dy -= SPEED;
    if (keys.s || keys.ArrowDown)  dy += SPEED;
    if (keys.a || keys.ArrowLeft)  dx -= SPEED;
    if (keys.d || keys.ArrowRight) dx += SPEED;
    if (dx && dy) { dx *= 0.707; dy *= 0.707; }

    const nx = Math.max(PLAYER_R, Math.min(CANVAS.W - PLAYER_R, p.x + dx));
    const ny = Math.max(PLAYER_R, Math.min(CANVAS.H - PLAYER_R, p.y + dy));

    const blocked = obstacles.some(o => rectCircle(o.x, o.y, o.w, o.h, nx, ny, PLAYER_R));
    if (!blocked) { p.x = nx; p.y = ny; }
    else {
      const bx = Math.max(PLAYER_R, Math.min(CANVAS.W - PLAYER_R, p.x + dx));
      if (!obstacles.some(o => rectCircle(o.x, o.y, o.w, o.h, bx, p.y, PLAYER_R))) p.x = bx;
      const by = Math.max(PLAYER_R, Math.min(CANVAS.H - PLAYER_R, p.y + dy));
      if (!obstacles.some(o => rectCircle(o.x, o.y, o.w, o.h, p.x, by, PLAYER_R))) p.y = by;
    }
  }

  // ── Spawn bullets from shoot flag ────────────────────────────────────────
  for (const p of Object.values(players)) {
    if (!p.alive || !p.keys._shoot || p.shootCooldown > 0) { p.keys._shoot = false; continue; }
    p.keys._shoot = false;
    p.shootCooldown = SHOOT_CD;
    bullets.push({
      id:    state._nextId++,
      x:     p.x + Math.cos(p.angle) * (PLAYER_R + BULLET_R + 2),
      y:     p.y + Math.sin(p.angle) * (PLAYER_R + BULLET_R + 2),
      vx:    Math.cos(p.angle) * BULLET_SPEED,
      vy:    Math.sin(p.angle) * BULLET_SPEED,
      owner: p.username,
      color: p.color,
      life:  BULLET_LIFE,
    });
  }

  // ── Move bullets + collision ─────────────────────────────────────────────
  const live = [];
  for (const b of bullets) {
    b.x += b.vx; b.y += b.vy; b.life--;
    if (b.life <= 0 || b.x < 0 || b.x > CANVAS.W || b.y < 0 || b.y > CANVAS.H) continue;
    if (obstacles.some(o => rectCircle(o.x, o.y, o.w, o.h, b.x, b.y, BULLET_R))) continue;

    let hit = false;
    for (const p of Object.values(players)) {
      if (!p.alive || p.username === b.owner) continue;
      if (circleCircle(b.x, b.y, BULLET_R, p.x, p.y, PLAYER_R)) {
        p.hp -= BULLET_DMG;
        if (p.hp <= 0) {
          p.hp = 0; p.alive = false;
          const killer = players[b.owner];
          if (killer) killer.score++;
          kills.push({ killer: b.owner, victim: p.username });
        }
        hit = true; break;
      }
    }
    if (!hit) live.push(b);
  }
  state.bullets = live;

  // ── Win condition ────────────────────────────────────────────────────────
  const alive = Object.values(players).filter(p => p.alive);
  if (alive.length <= 1) {
    return { over: true, winner: alive[0]?.username || null, kills };
  }
  return { over: false, kills };
}

// Strip internal fields before broadcasting
function publicState(state) {
  const players = {};
  for (const [u, p] of Object.entries(state.players)) {
    players[u] = {
      username: p.username, x: p.x, y: p.y,
      angle: p.angle, hp: p.hp, alive: p.alive,
      color: p.color, score: p.score,
    };
  }
  return { ...state, players };
}

module.exports = { createShooterState, tickShooter, publicState, CANVAS, PLAYER_R, BULLET_R, MAX_HP, TICK_MS, OBSTACLES };
