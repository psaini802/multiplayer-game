# Multiplayer Arcade AI Prompt Pack

Use this complete prompt pack to recreate the same multiplayer game platform end-to-end.

## 1) Master Prompt (Start)

```text
Create a full-stack web multiplayer game platform for an AI coding challenge.

Requirements:
- Frontend: React + Vite + React Router + Socket.io client
- Backend: Node.js + Express + Socket.io
- Persistence: embedded DB for players/games history (prefer pure JS, no native build deps)
- Core features:
  - username registration/login
  - room create/join via invite code
  - spectators
  - in-game chat
  - rematch support (where relevant)
  - leaderboard + player history API
  - ELO rating system and persistent stats (wins/losses/draws)
  - reconnect handling for socket id changes
- Make architecture clean and extensible for multiple game types.
- Provide full runnable code and startup instructions.
```

## 2) Fix Native DB Install Issue

```text
better-sqlite3 install fails in sandbox/native build.
Replace database layer with a pure-JS embedded database (e.g. nedb-promises) and refactor all DB reads/writes accordingly.
Keep same app behavior and persistent storage.
```

## 3) Add Game 1 (Tic Tac Toe baseline)

```text
Implement multiplayer Tic Tac Toe with:
- real-time board sync over Socket.io
- turn enforcement
- win/draw detection
- game result persistence
- ELO updates
- rematch flow
- chat in room
- spectator mode
```

## 4) Add Arena Snake

```text
Add a new game type: Arena Snake (2-4 players).
Requirements:
- server-authoritative game loop
- canvas rendering on frontend
- direction input from clients
- food spawn, growth, collision logic
- scoring and winner
- room/game state serialization
- integrate into lobby tabs and routes
```

## 5) Add Dice Racing

```text
Add a new game type: Multiplayer Dice Racing (2-4 players).
Requirements:
- turn-based play
- dice roll events
- special tiles/effects
- turn timer with auto-roll on timeout
- winner detection and persistence
- integrate into lobby tabs, routes, and shared room system
```

## 6) Fix React Strict Mode Room Deletion Bug

```text
Creating room sometimes shows "Room not found" in dev.
Investigate React Strict Mode double-invoked effects and prevent accidental leave_room during mount/cleanup.
Ensure join_room emits once per real mount and cleanup is safe.
```

## 7) Fix "Not registered" on Reconnect

```text
After join, sometimes socket shows "Not registered".
Implement robust reconnect registration:
- re-register on every socket connect/reconnect
- retry join_room once registered event is received
- keep UX seamless across refresh/reconnect
```

## 8) Enable LAN / Multi-Browser Play

```text
Make app runnable from other devices on same Wi-Fi:
- frontend and backend bind to 0.0.0.0
- dynamic API/socket host based on window.location.hostname
- permissive CORS for dev LAN use
- show LAN URLs in startup logs/script
```

## 9) Add More Games (Pong, Connect Four, RPS)

```text
Add 3 more polished multiplayer games:
1) Pong (real-time, 2 players)
2) Connect Four (2 players)
3) Rock Paper Scissors (best-of-5)

For each:
- backend game logic module
- frontend game page/component
- socket events for gameplay
- lobby integration (tabs + room creation/join routing)
- result handling and persistence
- visually polished UI
```

## 10) Fix Chat Prop Crash

```text
Chat component crashes with "Cannot read properties of undefined (reading 'length')".
Audit props passed to Chat across all pages and make prop contract consistent (messages, myUsername, onSend, disabled).
```

## 11) Fix Connect Four Turn + RPS Selection UI

```text
Fix Connect Four where both players see "your turn".
Ensure token mapping is consistent between room player symbols and connect-four game tokens.

Fix RPS where selected option is not visibly shown after click.
Preserve chosen visual state while preventing re-selection.
```

## 12) One-Shot Mega Prompt

```text
Build a full-stack multiplayer web arcade for an AI coding challenge.

Stack:
- Frontend: React + Vite + React Router + Socket.io client
- Backend: Node.js + Express + Socket.io
- Data: pure-JS embedded persistent DB (avoid native deps)

Core platform:
- username registration/login
- create/join room with short invite code
- spectators
- in-room chat
- reconnect-safe identity/session behavior
- persistent leaderboard and player game history APIs
- ELO rating with wins/losses/draws persistence
- clean architecture to support multiple game types

Implement these games:
1) Tic Tac Toe (2 players)
2) Arena Snake (2-4 players, server-authoritative loop, canvas frontend)
3) Dice Racing (2-4 players, turn timer, auto-roll, special tiles)
4) Pong (2 players, real-time, server-authoritative physics)
5) Connect Four (2 players, proper turn logic and win detection)
6) Rock Paper Scissors (best-of-5, hidden choice until reveal)

Required quality:
- robust socket reconnect handling (re-register on connect)
- avoid Strict Mode room lifecycle bugs
- game-specific events and state serialization
- lobby tabs for all games with routing to correct pages
- polished UI and overlays for waiting/playing/finished states
- LAN play enabled (0.0.0.0 bind, dynamic host URLs, CORS for dev)

Known pitfalls to avoid:
- do not mismatch per-game tokens (e.g. X/O vs R/Y)
- keep shared component prop contracts consistent
- keep server authoritative for real-time/turn validation

Deliverables:
- complete backend + frontend code
- startup script to run both services
- README with setup, run, and LAN instructions
```

