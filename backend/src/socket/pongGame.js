// Pure physics for real-time Pong — server-authoritative

const CANVAS   = { W: 600, H: 400 };
const PADDLE   = { W: 12, H: 80, SPEED: 6 };
const BALL_R   = 8;
const WIN_SCORE = 7;
const TICK_MS  = 33;   // ~30 fps

function makeBall(serveDir) {
  return {
    x:  CANVAS.W / 2,
    y:  CANVAS.H / 2,
    vx: 5.5 * (serveDir === 'right' ? 1 : -1),
    vy: (Math.random() * 4 - 2),
  };
}

function createPongState(players) {
  return {
    ball: makeBall('right'),
    paddles: {
      left:  { x: 20,                         y: CANVAS.H/2 - PADDLE.H/2, dy: 0, username: players[0].username },
      right: { x: CANVAS.W - 20 - PADDLE.W,  y: CANVAS.H/2 - PADDLE.H/2, dy: 0, username: players[1].username },
    },
    scores: { left: 0, right: 0 },
    canvas: CANVAS, paddle: PADDLE, ballR: BALL_R, winScore: WIN_SCORE,
  };
}

// Returns { over, winner?, scored? }
function tickPong(state) {
  const { ball, paddles } = state;

  // Move paddles
  for (const p of Object.values(paddles)) {
    p.y = Math.max(0, Math.min(CANVAS.H - PADDLE.H, p.y + p.dy * PADDLE.SPEED));
  }

  // Move ball
  ball.x += ball.vx;
  ball.y += ball.vy;

  // Top / bottom wall
  if (ball.y - BALL_R <= 0)          { ball.y = BALL_R;              ball.vy =  Math.abs(ball.vy); }
  if (ball.y + BALL_R >= CANVAS.H)   { ball.y = CANVAS.H - BALL_R;  ball.vy = -Math.abs(ball.vy); }

  // Left paddle hit
  const lp = paddles.left;
  if (ball.vx < 0 &&
      ball.x - BALL_R <= lp.x + PADDLE.W &&
      ball.x - BALL_R >= lp.x - 3 &&
      ball.y >= lp.y - BALL_R && ball.y <= lp.y + PADDLE.H + BALL_R) {
    ball.x  = lp.x + PADDLE.W + BALL_R;
    const spd = Math.min(Math.abs(ball.vx) * 1.07, 15);
    ball.vx = spd;
    ball.vy = ((ball.y - lp.y) / PADDLE.H - 0.5) * 12;
  }

  // Right paddle hit
  const rp = paddles.right;
  if (ball.vx > 0 &&
      ball.x + BALL_R >= rp.x &&
      ball.x + BALL_R <= rp.x + PADDLE.W + 3 &&
      ball.y >= rp.y - BALL_R && ball.y <= rp.y + PADDLE.H + BALL_R) {
    ball.x  = rp.x - BALL_R;
    const spd = Math.min(Math.abs(ball.vx) * 1.07, 15);
    ball.vx = -spd;
    ball.vy = ((ball.y - rp.y) / PADDLE.H - 0.5) * 12;
  }

  // Scoring
  if (ball.x < -BALL_R) {
    state.scores.right++;
    if (state.scores.right >= WIN_SCORE) return { over: true, winner: paddles.right.username };
    state.ball = makeBall('right');
    return { over: false, scored: 'right' };
  }
  if (ball.x > CANVAS.W + BALL_R) {
    state.scores.left++;
    if (state.scores.left >= WIN_SCORE) return { over: true, winner: paddles.left.username };
    state.ball = makeBall('left');
    return { over: false, scored: 'left' };
  }

  return { over: false };
}

module.exports = { createPongState, tickPong, CANVAS, PADDLE, BALL_R, WIN_SCORE, TICK_MS };
