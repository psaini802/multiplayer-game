// Space Shooter — server-authoritative
// Asteroids-style thrust + rotate physics, wrap-around arena, 2-4 players

const CANVAS      = { W: 800, H: 520 };
const PLAYER_R    = 14;
const BULLET_R    = 3;
const BULLET_SPEED = 10;
const BULLET_LIFE  = 55;   // ticks (~1.8 s)
const SHOOT_CD     = 12;   // min ticks between shots
const MAX_SPEED    = 5.5;
const ACCEL        = 0.22;
const REVERSE_ACC  = 0.10;
const FRICTION     = 0.013; // near-zero drag (space)
const TURN_RATE    = 0.068; // rad/tick
const RESPAWN_TICKS = 90;   // 3 s death screen
const MAX_HP       = 3;
const KILL_TARGET  = 10;    // first to N kills wins
const GAME_SECS    = 180;   // 3-minute fallback
const TICK_MS      = 33;
const N_AST_BASE   = 8;     // asteroids for 2 players; +2 per extra player
const AST_R        = [36, 22, 13]; // sizes

const COLORS  = ['#00e5ff', '#ff4444', '#ffd700', '#c77dff'];
const SPAWNS  = [
  { x: 140, y: 120, angle:  Math.PI / 4 },
  { x: 660, y: 400, angle: -Math.PI * 3 / 4 },
  { x: 660, y: 120, angle:  Math.PI * 3 / 4 },
  { x: 140, y: 400, angle: -Math.PI / 4 },
];

// ── helpers ────────────────────────────────────────────────────────────────
function rng(a, b)  { return a + Math.random() * (b - a); }
function wrap(v, m) { return ((v % m) + m) % m; }

function mkAsteroid(avoidList) {
  let x, y, tries = 0;
  do {
    x = rng(20, CANVAS.W - 20);
    y = rng(20, CANVAS.H - 20);
    tries++;
  } while (tries < 15 && avoidList?.some(a => Math.hypot(x - a.x, y - a.y) < 90));

  const spd = rng(0.3, 1.2);
  const dir = rng(0, Math.PI * 2);
  const r   = AST_R[Math.floor(Math.random() * AST_R.length)];
  const sides = 7 + Math.floor(Math.random() * 5);
  const verts = Array.from({ length: sides }, (_, i) => ({
    a: (i / sides) * Math.PI * 2,
    r: r * rng(0.68, 1.32),
  }));
  return {
    id:  Math.random().toString(36).slice(2),
    x, y,
    vx: Math.cos(dir) * spd,
    vy: Math.sin(dir) * spd,
    r, verts,
  };
}

// ── state factory ──────────────────────────────────────────────────────────
function createSpaceState(roomPlayers) {
  const players = {};
  roomPlayers.forEach((p, i) => {
    const sp = SPAWNS[i % SPAWNS.length];
    players[p.username] = {
      username:      p.username,
      x: sp.x, y: sp.y,
      angle:         sp.angle,
      vx: 0, vy: 0,
      color:         COLORS[i % COLORS.length],
      hp:            MAX_HP,
      kills:         0,
      deaths:        0,
      alive:         true,
      respawnTimer:  0,
      shootCooldown: 0,
      astHitCd:      0,   // cooldown so asteroids don't deal damage every tick
      thrustOn:      false,
      spawnIdx:      i,
      keys:          {},
    };
  });

  const avoid = roomPlayers.map((_, i) => SPAWNS[i % SPAWNS.length]);
  const nAst  = N_AST_BASE + Math.max(0, roomPlayers.length - 2) * 2;
  const asteroids = Array.from({ length: nAst }, () => mkAsteroid(avoid));

  return {
    players,
    bullets:  [],
    asteroids,
    ticksLeft:    Math.floor(GAME_SECS * 1000 / TICK_MS),
    killFeed:     [],
  };
}

// ── physics tick ───────────────────────────────────────────────────────────
// Returns { over, winner? }
function tickSpace(state) {
  const { players, bullets, asteroids } = state;
  state.ticksLeft--;

  const pList = Object.values(players);

  // ── Phase 1: move players ─────────────────────────────────────────────
  for (const p of pList) {
    p.thrustOn = false;

    if (!p.alive) {
      if (p.respawnTimer > 0) {
        p.respawnTimer--;
        if (p.respawnTimer === 0) {
          const sp = SPAWNS[p.spawnIdx % SPAWNS.length];
          p.x = sp.x + rng(-40, 40);
          p.y = sp.y + rng(-40, 40);
          p.vx = 0; p.vy = 0;
          p.angle = sp.angle;
          p.hp = MAX_HP;
          p.alive = true;
          p.astHitCd = 0;
        }
      }
      continue;
    }

    if (p.astHitCd > 0) p.astHitCd--;

    const { keys } = p;
    if (keys.a) p.angle -= TURN_RATE;
    if (keys.d) p.angle += TURN_RATE;
    if (keys.w) {
      p.vx += Math.cos(p.angle) * ACCEL;
      p.vy += Math.sin(p.angle) * ACCEL;
      p.thrustOn = true;
    }
    if (keys.s) {
      p.vx -= Math.cos(p.angle) * REVERSE_ACC;
      p.vy -= Math.sin(p.angle) * REVERSE_ACC;
    }

    const spd = Math.hypot(p.vx, p.vy);
    if (spd > MAX_SPEED) { p.vx = p.vx / spd * MAX_SPEED; p.vy = p.vy / spd * MAX_SPEED; }

    p.vx *= (1 - FRICTION);
    p.vy *= (1 - FRICTION);
    p.x = wrap(p.x + p.vx, CANVAS.W);
    p.y = wrap(p.y + p.vy, CANVAS.H);

    // Shoot
    if (p.shootCooldown > 0) p.shootCooldown--;
    if (keys.space && p.shootCooldown === 0) {
      bullets.push({
        x:     p.x + Math.cos(p.angle) * (PLAYER_R + 4),
        y:     p.y + Math.sin(p.angle) * (PLAYER_R + 4),
        vx:    p.vx + Math.cos(p.angle) * BULLET_SPEED,
        vy:    p.vy + Math.sin(p.angle) * BULLET_SPEED,
        life:  BULLET_LIFE,
        owner: p.username,
        color: p.color,
      });
      p.shootCooldown = SHOOT_CD;
    }
  }

  // ── Phase 2: move bullets + collision ────────────────────────────────
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    // Bullets travel straight — destroyed at edge (no wrap-around)
    b.x += b.vx;
    b.y += b.vy;
    b.life--;
    if (b.life <= 0 || b.x < 0 || b.x > CANVAS.W || b.y < 0 || b.y > CANVAS.H) {
      bullets.splice(i, 1); continue;
    }

    let removed = false;

    // vs players
    for (const p of pList) {
      if (!p.alive || p.username === b.owner) continue;
      if (Math.hypot(b.x - p.x, b.y - p.y) < PLAYER_R + BULLET_R) {
        p.hp--;
        bullets.splice(i, 1); removed = true;
        if (p.hp <= 0) {
          p.alive = false; p.respawnTimer = RESPAWN_TICKS; p.deaths++;
          const shooter = players[b.owner];
          if (shooter) {
            shooter.kills++;
            state.killFeed.unshift({ killer: shooter.username, victim: p.username });
            if (state.killFeed.length > 5) state.killFeed.pop();
          }
        }
        break;
      }
    }
    if (removed) continue;

    // vs asteroids
    for (let j = asteroids.length - 1; j >= 0; j--) {
      const a = asteroids[j];
      if (Math.hypot(b.x - a.x, b.y - a.y) < a.r + BULLET_R) {
        asteroids.splice(j, 1);
        bullets.splice(i, 1); removed = true;
        // respawn asteroid far from players
        asteroids.push(mkAsteroid(pList.map(p2 => ({ x: p2.x, y: p2.y }))));
        break;
      }
    }
  }

  // ── Phase 3: move asteroids ───────────────────────────────────────────
  for (const a of asteroids) {
    a.x = wrap(a.x + a.vx, CANVAS.W);
    a.y = wrap(a.y + a.vy, CANVAS.H);
  }

  // ── Phase 4: player-asteroid collision ───────────────────────────────
  for (const p of pList) {
    if (!p.alive || p.astHitCd > 0) continue;
    for (const a of asteroids) {
      if (Math.hypot(p.x - a.x, p.y - a.y) < PLAYER_R + a.r) {
        p.hp--;
        p.astHitCd = 45; // ~1.5 s grace period
        const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy) || 1;
        p.vx += (dx / d) * 2.5;
        p.vy += (dy / d) * 2.5;
        if (p.hp <= 0) {
          p.alive = false; p.respawnTimer = RESPAWN_TICKS; p.deaths++;
          state.killFeed.unshift({ killer: '☄️ asteroid', victim: p.username });
          if (state.killFeed.length > 5) state.killFeed.pop();
        }
        break;
      }
    }
  }

  // ── Win check ──────────────────────────────────────────────────────────
  const leader = pList.reduce((best, p) => p.kills > (best?.kills ?? -1) ? p : best, null);
  if (leader && leader.kills >= KILL_TARGET) {
    return { over: true, winner: leader.username, reason: 'kills' };
  }
  if (state.ticksLeft <= 0) {
    const sorted = [...pList].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    return { over: true, winner: sorted[0]?.username || null, reason: 'time' };
  }
  return { over: false };
}

// ── strip internal fields ──────────────────────────────────────────────────
function publicSpaceState(state) {
  const players = {};
  for (const [u, p] of Object.entries(state.players)) {
    players[u] = {
      username: p.username, x: p.x, y: p.y,
      angle: p.angle, vx: p.vx, vy: p.vy,
      color: p.color, hp: p.hp, kills: p.kills, deaths: p.deaths,
      alive: p.alive, respawnTimer: p.respawnTimer, thrustOn: p.thrustOn,
    };
  }
  return {
    players,
    bullets:   state.bullets.map(b => ({ x: b.x, y: b.y, color: b.color })),
    asteroids: state.asteroids.map(a => ({ x: a.x, y: a.y, r: a.r, verts: a.verts })),
    ticksLeft: state.ticksLeft,
    killFeed:  state.killFeed,
  };
}

module.exports = {
  createSpaceState, tickSpace, publicSpaceState,
  CANVAS, PLAYER_R, BULLET_R, KILL_TARGET, GAME_SECS, TICK_MS, MAX_HP,
};
