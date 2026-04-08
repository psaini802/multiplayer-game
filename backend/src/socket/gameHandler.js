const { v4: uuidv4 } = require('uuid');
const { createSnakeState, tickSnake, TICK_MS: SNAKE_TICK }       = require('./snakeGame');
const { createDiceState, processDiceRoll, TURN_SECONDS: DICE_SECS } = require('./diceGame');
const { createPongState, tickPong, TICK_MS: PONG_TICK }           = require('./pongGame');
const { createC4State, dropToken, findWin, isFull }               = require('./connectFourGame');
const { createRPSState, resolveRound, nextRound, TURN_SECONDS: RPS_SECS } = require('./rpsGame');
const { createShooterState, tickShooter, publicState: shooterPublic, TICK_MS: SHOOTER_TICK } = require('./shooterGame');
const { createSpaceState,  tickSpace,   publicSpaceState, TICK_MS: SPACE_TICK }             = require('./spaceGame');

// ── TicTacToe helpers ─────────────────────────────────────────────────────
const WIN_CONDITIONS = [
  [0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]
];
function checkTTT(board) {
  for (const [a,b,c] of WIN_CONDITIONS) {
    if (board[a] && board[a]===board[b] && board[a]===board[c])
      return { winner: board[a], line: [a,b,c] };
  }
  return board.every(c=>c!==null) ? { winner:'draw', line:[] } : null;
}

// ── ELO ───────────────────────────────────────────────────────────────────
function calcElo(wElo, lElo, isDraw=false) {
  const K=32, exp=1/(1+Math.pow(10,(lElo-wElo)/400));
  return isDraw
    ? { winnerDelta: Math.round(K*(0.5-exp)), loserDelta: Math.round(K*(0.5-(1-exp))) }
    : { winnerDelta: Math.round(K*(1-exp)),   loserDelta: Math.round(K*(0-(1-exp))) };
}

// ── Room helpers ──────────────────────────────────────────────────────────
const MAX_PLAYERS = { tictactoe:2, snake:4, dice:4, pong:2, connectfour:2, rps:2, shooter:4, space:4, car:4 };
// Games that auto-start when max players reached (no manual start button)
const AUTO_START = new Set(['tictactoe','pong','connectfour','rps']);

function genCode() {
  const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length:6},()=>c[Math.floor(Math.random()*c.length)]).join('');
}

function serializeRoom(room) {
  const base = {
    id: room.id, code: room.code, gameType: room.gameType,
    players: room.players.map(p=>({username:p.username,symbol:p.symbol,elo:p.elo})),
    spectators: room.spectators.map(s=>({username:s.username})),
    status: room.status, winner: room.winner,
    chat: room.chat.slice(-30),
  };
  if (room.gameType==='tictactoe') return {
    ...base,
    board: room.board, currentTurn: room.currentTurn,
    winLine: room.winLine||[], rematchRequests: Array.from(room.rematchRequests||[]),
  };
  return { ...base, gameState: room.gameState||null };
}

// ── DB helpers ────────────────────────────────────────────────────────────
async function upsertPlayer(playersDb, username) {
  let p = await playersDb.findOne({ username });
  if (!p) {
    p = await playersDb.insert({
      id:uuidv4(), username, wins:0, losses:0, draws:0, elo_rating:1000,
      created_at: new Date().toISOString(), last_seen: new Date().toISOString(),
    });
  } else {
    await playersDb.update({username},{$set:{last_seen:new Date().toISOString()}});
    p = await playersDb.findOne({username});
  }
  return p;
}

async function saveGameResult(db, room, winnerUsername) {
  const { players: playersDb, games: gamesDb } = db;
  const pX = room.players.find(p=>p.symbol==='X') || room.players[0];
  const pO = room.players.find(p=>p.symbol==='O') || room.players[1];
  if (!pX || !pO) return {};

  const pxDb = await playersDb.findOne({username:pX.username});
  const poDb = await playersDb.findOne({username:pO.username});
  let eloChanges = {};

  if (winnerUsername && winnerUsername!=='draw') {
    const isXWinner = winnerUsername===pX.username;
    const wDb = isXWinner ? pxDb : poDb;
    const lDb = isXWinner ? poDb : pxDb;
    const {winnerDelta,loserDelta} = calcElo(wDb.elo_rating, lDb.elo_rating);
    eloChanges = { [wDb.username]: winnerDelta, [lDb.username]: loserDelta };
    await playersDb.update({username:wDb.username},{$inc:{wins:1,elo_rating:winnerDelta}});
    await playersDb.update({username:lDb.username},{$inc:{losses:1,elo_rating:loserDelta}});
  } else {
    const {winnerDelta,loserDelta} = calcElo(pxDb.elo_rating, poDb.elo_rating, true);
    eloChanges = { [pX.username]: winnerDelta, [pO.username]: loserDelta };
    await playersDb.update({username:pX.username},{$inc:{draws:1,elo_rating:winnerDelta}});
    await playersDb.update({username:pO.username},{$inc:{draws:1,elo_rating:loserDelta}});
  }
  for (const u of [pX.username, pO.username]) {
    const p = await playersDb.findOne({username:u});
    if (p && p.elo_rating < 100) await playersDb.update({username:u},{$set:{elo_rating:100}});
  }

  await gamesDb.insert({
    id:uuidv4(), room_id:room.id, game_type:room.gameType,
    player_x:pX.username, player_o:pO.username, winner:winnerUsername,
    board_state: room.board||null, moves_history: room.movesHistory||[],
    duration_seconds: room.startTime ? Math.floor((Date.now()-room.startTime)/1000) : 0,
    created_at: new Date().toISOString(),
  });

  const updatedPx = await playersDb.findOne({username:pX.username});
  const updatedPo = await playersDb.findOne({username:pO.username});
  return { eloChanges, playerStats:{ [pX.username]:updatedPx, [pO.username]:updatedPo } };
}

// ─────────────────────────────────────────────────────────────────────────
module.exports = (io, rooms, players, db) => {
  const { players:playersDb } = db;

  // ── SNAKE: Game loop ──────────────────────────────────────────────────
  function startSnakeLoop(code) {
    const room = rooms.get(code);
    if (!room || room.gameLoop) return;

    let count = 3;
    io.to(code).emit('snake_countdown', { count });

    const cdTimer = setInterval(() => {
      count--;
      if (count > 0) {
        io.to(code).emit('snake_countdown', { count });
      } else {
        clearInterval(cdTimer);
        const r = rooms.get(code);
        if (!r) return;
        r.status = 'playing';
        r.startTime = Date.now();
        r.gameState = createSnakeState(r.players);
        io.to(code).emit('snake_start', serializeRoom(r));

        r.gameLoop = setInterval(async () => {
          const rm = rooms.get(code);
          if (!rm) { clearInterval(rm?.gameLoop); return; }

          const result = tickSnake(rm.gameState);
          if (result.over) {
            rm.status = 'finished'; rm.winner = result.winner;
            clearInterval(rm.gameLoop); delete rm.gameLoop;
            try {
              const scores = Object.entries(rm.gameState.snakes)
                .map(([u,s])=>({username:u,score:s.score,color:s.color}))
                .sort((a,b)=>b.score-a.score);
              await saveGameResult(db, rm, result.winner);
              io.to(code).emit('snake_over', { winner:result.winner, scores, state:rm.gameState });
            } catch(e) {
              io.to(code).emit('snake_over', { winner:result.winner, scores:[], state:rm.gameState });
            }
          } else {
            io.to(code).emit('snake_tick', rm.gameState);
          }
        }, SNAKE_TICK);
      }
    }, 1000);
  }

  // ── PONG: Game loop ───────────────────────────────────────────────────
  function startPongLoop(code) {
    const room = rooms.get(code);
    if (!room || room.pongLoop) return;

    room.status = 'playing';
    room.startTime = Date.now();

    room.pongLoop = setInterval(async () => {
      const rm = rooms.get(code);
      if (!rm || !rm.gameState) { return; }

      const result = tickPong(rm.gameState);
      io.to(code).emit('pong_tick', rm.gameState);

      if (result.over) {
        rm.status = 'finished'; rm.winner = result.winner;
        clearInterval(rm.pongLoop); delete rm.pongLoop;
        try {
          await saveGameResult(db, rm, result.winner);
        } catch(e) {}
        io.to(code).emit('pong_over', { winner: result.winner, scores: rm.gameState.scores });
      }
    }, PONG_TICK);
  }

  // ── DICE: Turn timer ──────────────────────────────────────────────────
  function startDiceTurnTimer(code) {
    const room = rooms.get(code);
    if (!room || !room.gameState) return;
    if (room.turnTimer) { clearInterval(room.turnTimer); delete room.turnTimer; }

    room.gameState.turnTimeLeft = DICE_SECS;
    room.turnTimer = setInterval(() => {
      const r = rooms.get(code);
      if (!r || r.status !== 'playing') { clearInterval(r?.turnTimer); return; }
      r.gameState.turnTimeLeft--;
      io.to(code).emit('dice_timer', { timeLeft: r.gameState.turnTimeLeft });
      if (r.gameState.turnTimeLeft <= 0) {
        const curPlayer = r.gameState.players[r.gameState.currentIdx];
        if (curPlayer) performDiceRoll(code, curPlayer.username, true);
      }
    }, 1000);
  }

  function performDiceRoll(code, username, isAuto=false) {
    const room = rooms.get(code);
    if (!room || room.status!=='playing' || room.gameType!=='dice') return;
    const result = processDiceRoll(room.gameState, username);
    if (!result) return;
    if (room.turnTimer) { clearInterval(room.turnTimer); delete room.turnTimer; }
    io.to(code).emit('dice_rolled', { ...result, isAuto, gameState: room.gameState });
    if (result.winner) {
      room.status = 'finished'; room.winner = result.winner;
      saveGameResult(db, room, result.winner).catch(()=>{});
      io.to(code).emit('dice_over', { winner: result.winner, gameState: room.gameState });
    } else {
      startDiceTurnTimer(code);
    }
  }

  // ── RPS: Turn timer ───────────────────────────────────────────────────
  function startRPSTimer(code) {
    const room = rooms.get(code);
    if (!room || !room.gameState) return;
    if (room.rpsTimer) { clearInterval(room.rpsTimer); delete room.rpsTimer; }

    room.gameState.timeLeft = RPS_SECS;
    room.rpsTimer = setInterval(() => {
      const r = rooms.get(code);
      if (!r || r.status !== 'playing' || !r.gameState) { clearInterval(r?.rpsTimer); return; }
      if (r.gameState.status !== 'choosing') return;

      r.gameState.timeLeft--;
      io.to(code).emit('rps_timer', { timeLeft: r.gameState.timeLeft });

      if (r.gameState.timeLeft <= 0) {
        clearInterval(r.rpsTimer); delete r.rpsTimer;
        resolveAndBroadcastRPS(code);
      }
    }, 1000);
  }

  function resolveAndBroadcastRPS(code) {
    const room = rooms.get(code);
    if (!room || !room.gameState) return;
    const result = resolveRound(room.gameState);
    io.to(code).emit('rps_round_result', { gameState: room.gameState, result });
    if (result.over) {
      room.status = 'finished'; room.winner = result.winner;
      saveGameResult(db, room, result.winner).catch(()=>{});
      setTimeout(() => io.to(code).emit('rps_over', { winner: result.winner, gameState: room.gameState }), 2500);
    } else {
      setTimeout(() => {
        const r = rooms.get(code);
        if (!r || r.status !== 'playing') return;
        nextRound(r.gameState);
        io.to(code).emit('rps_next_round', { gameState: r.gameState });
        startRPSTimer(code);
      }, 3000);
    }
  }

  // ── SHOOTER: Game loop ────────────────────────────────────────────────
  function startShooterLoop(code) {
    const room = rooms.get(code);
    if (!room || room.shooterLoop) return;

    room.status = 'playing';
    room.startTime = Date.now();
    room.gameState = createShooterState(room.players);

    let count = 3;
    io.to(code).emit('shooter_countdown', { count });
    const cdTimer = setInterval(() => {
      count--;
      if (count > 0) {
        io.to(code).emit('shooter_countdown', { count });
      } else {
        clearInterval(cdTimer);
        const r = rooms.get(code);
        if (!r) return;
        io.to(code).emit('shooter_start', serializeRoom(r));

        r.shooterLoop = setInterval(async () => {
          const rm = rooms.get(code);
          if (!rm || !rm.gameState) return;

          const result = tickShooter(rm.gameState);
          io.to(code).emit('shooter_tick', shooterPublic(rm.gameState));

          if (result.kills?.length) {
            io.to(code).emit('shooter_kills', result.kills);
          }

          if (result.over) {
            rm.status = 'finished'; rm.winner = result.winner;
            clearInterval(rm.shooterLoop); delete rm.shooterLoop;
            try { await saveGameResult(db, rm, result.winner); } catch(e) {}
            io.to(code).emit('shooter_over', {
              winner: result.winner,
              scores: Object.values(shooterPublic(rm.gameState).players)
                .map(p => ({ username: p.username, score: p.score, color: p.color }))
                .sort((a, b) => b.score - a.score),
            });
          }
        }, SHOOTER_TICK);
      }
    }, 1000);
  }

  // ── SPACE SHOOTER: Game loop ──────────────────────────────────────────
  function startSpaceLoop(code) {
    const room = rooms.get(code);
    if (!room || room.spaceLoop) return;

    room.status   = 'playing';
    room.startTime = Date.now();
    room.gameState = createSpaceState(room.players);

    let count = 3;
    io.to(code).emit('space_countdown', { count });
    const cdTimer = setInterval(() => {
      count--;
      if (count > 0) {
        io.to(code).emit('space_countdown', { count });
      } else {
        clearInterval(cdTimer);
        const r = rooms.get(code);
        if (!r) return;
        io.to(code).emit('space_start', serializeRoom(r));

        r.spaceLoop = setInterval(async () => {
          const rm = rooms.get(code);
          if (!rm || !rm.gameState) return;

          const result = tickSpace(rm.gameState);
          io.to(code).emit('space_tick', publicSpaceState(rm.gameState));

          if (result.over) {
            rm.status = 'finished'; rm.winner = result.winner;
            clearInterval(rm.spaceLoop); delete rm.spaceLoop;
            try { await saveGameResult(db, rm, result.winner); } catch(e) {}
            const pList = Object.values(publicSpaceState(rm.gameState).players);
            io.to(code).emit('space_over', {
              winner: result.winner,
              reason: result.reason,
              scores: [...pList].sort((a, b) => b.kills - a.kills)
                .map(p => ({ username: p.username, kills: p.kills, deaths: p.deaths, color: p.color })),
            });
          }
        }, SPACE_TICK);
      }
    }, 1000);
  }

  // ─────────────────────────────────────────────────────────────────────
  io.on('connection', socket => {
    console.log(`[+] ${socket.id}`);

    // ── REGISTER ─────────────────────────────────────────────────────
    socket.on('register', async ({ username }) => {
      try {
        const p = await upsertPlayer(playersDb, username);
        players.set(socket.id, { ...p, socketId: socket.id });
        socket.emit('registered', p);
      } catch(e) { console.error('register:', e); }
    });

    // ── ROOM LIST ─────────────────────────────────────────────────────
    socket.on('get_rooms', () => {
      const list = [];
      rooms.forEach((r, code) => {
        if (r.status==='waiting') {
          list.push({
            code, gameType: r.gameType,
            host: r.players[0]?.username,
            playerCount: r.players.length,
            maxPlayers: MAX_PLAYERS[r.gameType]||2,
            spectatorCount: r.spectators.length,
          });
        }
      });
      socket.emit('rooms_list', list);
    });

    // ── CREATE ROOM ───────────────────────────────────────────────────
    socket.on('create_room', ({ gameType='tictactoe' }={}) => {
      const player = players.get(socket.id);
      if (!player) return socket.emit('error',{message:'Not registered'});

      let code = genCode();
      while (rooms.has(code)) code = genCode();

      const room = {
        id: uuidv4(), code, gameType,
        players: [{ socketId:socket.id, username:player.username, symbol:'X', elo:player.elo_rating }],
        spectators: [], status: 'waiting', winner: null,
        chat: [], rematchRequests: new Set(),
      };

      if (gameType==='tictactoe') {
        room.board = Array(9).fill(null);
        room.currentTurn = 'X'; room.winLine = []; room.movesHistory = []; room.startTime = null;
      }

      rooms.set(code, room);
      socket.join(code);
      socket.emit('room_created', { code, symbol:'X', gameType, room: serializeRoom(room) });
      io.emit('rooms_updated');
    });

    // ── JOIN ROOM ─────────────────────────────────────────────────────
    socket.on('join_room', ({ code }) => {
      const player = players.get(socket.id);
      if (!player) return socket.emit('error',{message:'Not registered'});

      const upperCode = (code||'').toUpperCase();
      const room = rooms.get(upperCode);
      if (!room) return socket.emit('error',{message:'Room not found'});

      // Reconnect as existing player
      const existing = room.players.find(p=>p.username===player.username);
      if (existing) {
        existing.socketId = socket.id;
        socket.join(upperCode);
        socket.emit('room_rejoined', { code:upperCode, symbol:existing.symbol, gameType:room.gameType, room:serializeRoom(room) });
        return;
      }

      // Reconnect as spectator
      const exSpec = room.spectators.find(s=>s.username===player.username);
      if (exSpec) {
        exSpec.socketId = socket.id;
        socket.join(upperCode);
        socket.emit('room_rejoined', { code:upperCode, gameType:room.gameType, isSpectator:true, room:serializeRoom(room) });
        return;
      }

      const maxP = MAX_PLAYERS[room.gameType]||2;

      if (room.players.length < maxP && room.status==='waiting') {
        const symbol = ['X','O','P3','P4'][room.players.length]||'P';
        room.players.push({ socketId:socket.id, username:player.username, symbol, elo:player.elo_rating });
        socket.join(upperCode);

        // Auto-start if 2-player game fills up
        if (AUTO_START.has(room.gameType) && room.players.length === maxP) {
          room.status = 'playing';
          room.startTime = Date.now();

          if (room.gameType === 'pong') {
            room.gameState = createPongState(room.players);
            socket.emit('room_joined', { code:upperCode, symbol, gameType:room.gameType, room:serializeRoom(room) });
            io.to(upperCode).emit('game_start', serializeRoom(room));
            startPongLoop(upperCode);
          } else if (room.gameType === 'connectfour') {
            room.gameState = createC4State(room.players);
            socket.emit('room_joined', { code:upperCode, symbol, gameType:room.gameType, room:serializeRoom(room) });
            io.to(upperCode).emit('game_start', serializeRoom(room));
          } else if (room.gameType === 'rps') {
            room.gameState = createRPSState(room.players);
            socket.emit('room_joined', { code:upperCode, symbol, gameType:room.gameType, room:serializeRoom(room) });
            io.to(upperCode).emit('game_start', serializeRoom(room));
            startRPSTimer(upperCode);
          } else {
            // tictactoe
            socket.emit('room_joined', { code:upperCode, symbol, gameType:room.gameType, room:serializeRoom(room) });
            io.to(upperCode).emit('game_start', serializeRoom(room));
          }
        } else {
          socket.emit('room_joined', { code:upperCode, symbol, gameType:room.gameType, room:serializeRoom(room) });
          io.to(upperCode).emit('player_joined', serializeRoom(room));
        }
        io.emit('rooms_updated');
        return;
      }

      // Spectator
      room.spectators.push({ socketId:socket.id, username:player.username });
      socket.join(upperCode);
      socket.emit('joined_as_spectator', { code:upperCode, gameType:room.gameType, room:serializeRoom(room) });
      io.to(upperCode).emit('room_updated', serializeRoom(room));
    });

    // ── START GAME (Snake / Dice — manual start) ──────────────────────
    socket.on('start_game', ({ code }) => {
      const room = rooms.get((code||'').toUpperCase());
      if (!room || room.status!=='waiting') return;
      const player = players.get(socket.id);
      if (!player || room.players[0]?.username!==player.username)
        return socket.emit('error',{message:'Only the host can start'});
      if (room.players.length < 2)
        return socket.emit('error',{message:'Need at least 2 players'});

      if (room.gameType==='snake') {
        startSnakeLoop(room.code);
      } else if (room.gameType==='dice') {
        room.status = 'playing'; room.startTime = Date.now();
        room.gameState = createDiceState(room.players);
        io.to(room.code).emit('dice_start', serializeRoom(room));
        startDiceTurnTimer(room.code);
        io.emit('rooms_updated');
      } else if (room.gameType==='shooter') {
        startShooterLoop(room.code);
        io.emit('rooms_updated');
      } else if (room.gameType==='space') {
        startSpaceLoop(room.code);
        io.emit('rooms_updated');
      }
    });

    // ── TICTACTOE: make move ──────────────────────────────────────────
    socket.on('make_move', async ({ code, index }) => {
      const room = rooms.get((code||'').toUpperCase());
      if (!room || room.gameType!=='tictactoe' || room.status!=='playing') return;
      const player = room.players.find(p=>p.socketId===socket.id);
      if (!player) return;
      if (player.symbol!==room.currentTurn) return socket.emit('error',{message:'Not your turn'});
      if (room.board[index]!==null) return socket.emit('error',{message:'Cell taken'});

      room.board[index] = player.symbol;
      room.movesHistory.push({ symbol:player.symbol, index, ts:Date.now() });

      const result = checkTTT(room.board);
      if (result) {
        room.status='finished'; room.winner=result.winner; room.winLine=result.line;
        try {
          const r = await saveGameResult(db, room, result.winner);
          io.to(room.code).emit('game_over', { board:room.board, winner:result.winner, winLine:result.line, ...r });
        } catch(e) {
          io.to(room.code).emit('game_over', { board:room.board, winner:result.winner, winLine:result.line });
        }
      } else {
        room.currentTurn = room.currentTurn==='X'?'O':'X';
        io.to(room.code).emit('move_made', { board:room.board, index, symbol:player.symbol, currentTurn:room.currentTurn });
      }
    });

    // ── TICTACTOE: rematch ────────────────────────────────────────────
    socket.on('request_rematch', ({ code }) => {
      const room = rooms.get((code||'').toUpperCase());
      if (!room || room.status!=='finished' || room.gameType!=='tictactoe') return;
      const player = players.get(socket.id);
      if (!player) return;
      room.rematchRequests.add(player.username);
      io.to(room.code).emit('rematch_requested',{ username:player.username, requests:Array.from(room.rematchRequests) });
      if (room.rematchRequests.size>=2) {
        room.players.forEach(p=>{p.symbol=p.symbol==='X'?'O':'X';});
        room.board=Array(9).fill(null); room.currentTurn='X';
        room.status='playing'; room.winner=null; room.winLine=[];
        room.movesHistory=[]; room.startTime=Date.now(); room.rematchRequests.clear();
        io.to(room.code).emit('rematch_started', serializeRoom(room));
      }
    });

    // ── SNAKE: direction ──────────────────────────────────────────────
    socket.on('snake_direction', ({ code, direction }) => {
      const room = rooms.get((code||'').toUpperCase());
      if (!room || room.gameType!=='snake' || room.status!=='playing' || !room.gameState) return;
      const player = players.get(socket.id);
      if (!player) return;
      const snake = room.gameState.snakes[player.username];
      if (snake && snake.alive) snake.nextDir = direction;
    });

    // ── DICE: roll ────────────────────────────────────────────────────
    socket.on('roll_dice', ({ code }) => {
      const player = players.get(socket.id);
      if (!player) return;
      performDiceRoll((code||'').toUpperCase(), player.username);
    });

    // ── PONG: paddle input ────────────────────────────────────────────
    socket.on('pong_paddle', ({ code, dy }) => {
      const room = rooms.get((code||'').toUpperCase());
      if (!room || room.gameType!=='pong' || room.status!=='playing' || !room.gameState) return;
      const player = players.get(socket.id);
      if (!player) return;
      const { paddles } = room.gameState;
      if (paddles.left.username  === player.username) paddles.left.dy  = dy;
      if (paddles.right.username === player.username) paddles.right.dy = dy;
    });

    // ── SHOOTER: player input ─────────────────────────────────────────
    socket.on('shooter_input', ({ code, keys, angle, shoot }) => {
      const room = rooms.get((code||'').toUpperCase());
      if (!room || room.gameType!=='shooter' || room.status!=='playing' || !room.gameState) return;
      const player = players.get(socket.id);
      if (!player) return;
      const p = room.gameState.players[player.username];
      if (!p || !p.alive) return;
      if (keys)  p.keys  = { ...keys, _shoot: p.keys._shoot };
      if (typeof angle === 'number') p.angle = angle;
      if (shoot) p.keys._shoot = true;  // latch until tick consumes it
    });

    // ── SPACE SHOOTER: player input ───────────────────────────────────
    socket.on('space_input', ({ code, keys }) => {
      const room = rooms.get((code||'').toUpperCase());
      if (!room || room.gameType!=='space' || room.status!=='playing' || !room.gameState) return;
      const player = players.get(socket.id);
      if (!player) return;
      const p = room.gameState.players[player.username];
      if (!p || !p.alive) return;
      p.keys = keys || {};
    });

    // ── CONNECT FOUR: drop token ──────────────────────────────────────
    socket.on('c4_drop', ({ code, col }) => {
      const room = rooms.get((code||'').toUpperCase());
      if (!room || room.gameType!=='connectfour' || room.status!=='playing' || !room.gameState) return;
      const player = room.players.find(p=>p.socketId===socket.id);
      if (!player) return;
      const gs = room.gameState;
      // Resolve the C4 token ('R'/'Y') for this player by username
      const myToken = Object.keys(gs.players).find(t => gs.players[t].username === player.username);
      if (!myToken) return;
      if (gs.currentTurn !== myToken) return socket.emit('error',{message:'Not your turn'});

      const row = dropToken(gs.board, col, myToken);
      if (row === null) return socket.emit('error',{message:'Column is full'});

      const winCells = findWin(gs.board, myToken);
      if (winCells) {
        gs.winner = player.username; gs.winCells = winCells;
        room.status = 'finished'; room.winner = player.username;
        io.to(room.code).emit('c4_update', { gameState: gs, col, row, token: myToken });
        saveGameResult(db, room, player.username).catch(()=>{});
        io.to(room.code).emit('c4_over', { winner: player.username, winCells, gameState: gs });
      } else if (isFull(gs.board)) {
        gs.winner = 'draw';
        room.status = 'finished'; room.winner = 'draw';
        io.to(room.code).emit('c4_update', { gameState: gs, col, row, token: myToken });
        saveGameResult(db, room, 'draw').catch(()=>{});
        io.to(room.code).emit('c4_over', { winner: 'draw', winCells: [], gameState: gs });
      } else {
        gs.currentTurn = gs.currentTurn === 'R' ? 'Y' : 'R';
        io.to(room.code).emit('c4_update', { gameState: gs, col, row, token: myToken });
      }
    });

    // ── ROCK PAPER SCISSORS: choose ───────────────────────────────────
    socket.on('rps_choose', ({ code, choice }) => {
      const VALID = ['rock','paper','scissors'];
      if (!VALID.includes(choice)) return;
      const room = rooms.get((code||'').toUpperCase());
      if (!room || room.gameType!=='rps' || room.status!=='playing' || !room.gameState) return;
      if (room.gameState.status !== 'choosing') return;
      const player = players.get(socket.id);
      if (!player) return;
      const ps = room.gameState.players.find(p=>p.username===player.username);
      if (!ps || ps.choice) return; // already chose
      ps.choice = choice;

      // Echo back to that player only (keep hidden from opponent)
      socket.emit('rps_chose', { username: player.username });
      io.to(room.code).emit('rps_status', {
        chosen: room.gameState.players.map(p=>({ username:p.username, hasChosen: !!p.choice }))
      });

      // Both chosen → resolve immediately
      if (room.gameState.players.every(p=>p.choice)) {
        if (room.rpsTimer) { clearInterval(room.rpsTimer); delete room.rpsTimer; }
        resolveAndBroadcastRPS(room.code);
      }
    });

    // ── CHAT ─────────────────────────────────────────────────────────
    socket.on('send_chat', ({ code, message }) => {
      const player = players.get(socket.id);
      if (!player || !message?.trim()) return;
      const room = rooms.get((code||'').toUpperCase());
      if (!room) return;
      const msg = { username:player.username, message:message.trim().substring(0,200), timestamp:Date.now() };
      room.chat.push(msg);
      if (room.chat.length>100) room.chat.shift();
      io.to(room.code).emit('chat_message', msg);
    });

    // ── DISCOVER ROOM ─────────────────────────────────────────────────
    socket.on('discover_room', ({ code }) => {
      const room = rooms.get((code||'').toUpperCase());
      if (!room) return socket.emit('error',{message:'Room not found'});
      socket.emit('room_discovered', { code: room.code, gameType: room.gameType });
    });

    // ── LEAVE ROOM ────────────────────────────────────────────────────
    socket.on('leave_room', ({ code }) => handleLeave(socket, (code||'').toUpperCase()));

    // ── DISCONNECT ────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`[-] ${socket.id}`);
      rooms.forEach((room, code) => {
        const idx = room.players.findIndex(p=>p.socketId===socket.id);
        if (idx!==-1) {
          if (room.status==='playing') {
            const left = room.players[idx];
            io.to(code).emit('player_disconnected',{username:left.username});
            setTimeout(() => {
              const r = rooms.get(code);
              if (!r) return;
              const still = r.players.findIndex(p=>p.username===left.username && p.socketId===socket.id);
              if (still!==-1) {
                r.players.splice(still,1);
                clearRoomLoops(r);
                r.status = r.players.length>0?'waiting':'abandoned';
                if (r.players.length===0) rooms.delete(code);
                else io.to(code).emit('room_updated', serializeRoom(r));
                io.emit('rooms_updated');
              }
            }, 30000);
          } else {
            room.players.splice(idx,1);
            if (room.players.length===0) {
              clearRoomLoops(room);
              rooms.delete(code);
            }
            io.emit('rooms_updated');
          }
        }
        const si = room.spectators.findIndex(s=>s.socketId===socket.id);
        if (si!==-1) room.spectators.splice(si,1);
      });
      players.delete(socket.id);
    });

    function clearRoomLoops(room) {
      if (room.gameLoop)    { clearInterval(room.gameLoop);    delete room.gameLoop; }
      if (room.pongLoop)    { clearInterval(room.pongLoop);    delete room.pongLoop; }
      if (room.shooterLoop) { clearInterval(room.shooterLoop); delete room.shooterLoop; }
      if (room.spaceLoop)   { clearInterval(room.spaceLoop);   delete room.spaceLoop; }
      if (room.carLoop)     { clearInterval(room.carLoop);     delete room.carLoop; }
      if (room.turnTimer)   { clearInterval(room.turnTimer);   delete room.turnTimer; }
      if (room.rpsTimer)    { clearInterval(room.rpsTimer);    delete room.rpsTimer; }
    }

    function handleLeave(socket, code) {
      const room = rooms.get(code);
      if (!room) return;
      const idx = room.players.findIndex(p=>p.socketId===socket.id);
      if (idx!==-1) {
        const leaving = room.players[idx];
        room.players.splice(idx,1);
        socket.leave(code);
        if (room.players.length===0) {
          clearRoomLoops(room);
          rooms.delete(code);
        } else {
          if (room.status==='playing') room.status='waiting';
          io.to(code).emit('player_left',{username:leaving.username});
          io.to(code).emit('room_updated', serializeRoom(room));
        }
        io.emit('rooms_updated');
      }
      const si = room?.spectators?.findIndex(s=>s.socketId===socket.id);
      if (si!==-1) { room.spectators.splice(si,1); socket.leave(code); }
    }
  });
};
