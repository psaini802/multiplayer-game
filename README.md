# 🎮 TicTacToe — Real-Time Multiplayer

A full-stack real-time multiplayer Tic Tac Toe game built with **React**, **Node.js**, and **Socket.io**.

## Features

| Feature | Description |
|---|---|
| 🔴 Real-time gameplay | Moves sync instantly via Socket.io |
| 🏠 Room system | Create rooms, share 6-char invite code |
| 👁 Spectator mode | Watch any ongoing game |
| 🔄 Rematch | Both players can request a rematch (symbols swap) |
| 💬 Live chat | In-game chat between players & spectators |
| 📊 ELO ranking | K=32 ELO system, updated after every match |
| 🏆 Leaderboard | Top 50 players by ELO rating |
| 💾 Persistence | Game history + player stats stored in NeDB |
| 🔌 Reconnect | 30-second reconnect window on disconnect |

## Tech Stack

- **Frontend**: React 18, React Router v6, Socket.io Client, Vite
- **Backend**: Node.js, Express, Socket.io, NeDB (pure-JS embedded DB)
- **Styling**: Custom CSS (dark neon theme, Orbitron + Inter fonts)

## Quick Start

### 1. Start the backend

```bash
cd backend
npm install        # already done
npm run dev        # hot-reload via nodemon
# or: npm start
```

Server starts at **http://localhost:3001**

### 2. Start the frontend

```bash
cd frontend
npm install        # already done
npm run dev
```

App opens at **http://localhost:5173**

### 3. Play!

1. Open two browser windows/tabs at `http://localhost:5173`
2. Enter different usernames in each
3. In one window: click **Create Room**
4. In the other: click the room from the lobby (or paste the code)
5. Start playing!

## Project Structure

```
multiplayer-game/
├── backend/
│   ├── src/
│   │   ├── index.js              # Express + Socket.io server
│   │   ├── database.js           # NeDB datastores
│   │   ├── routes/
│   │   │   ├── players.js        # POST /register, GET /:username
│   │   │   ├── leaderboard.js    # GET /api/leaderboard
│   │   │   └── games.js          # GET /history/:username
│   │   └── socket/
│   │       └── gameHandler.js    # All game logic & Socket.io events
│   └── data/                     # Auto-created: players.db, games.db
├── frontend/
│   └── src/
│       ├── context/GameContext.jsx   # Auth + global state
│       ├── socket.js                 # Socket.io client singleton
│       ├── pages/
│       │   ├── Home.jsx         # Landing / login
│       │   ├── Lobby.jsx        # Room browser
│       │   ├── Game.jsx         # Live game + chat
│       │   └── Leaderboard.jsx  # Rankings table
│       └── components/
│           ├── Board.jsx        # 3×3 grid
│           ├── PlayerCard.jsx   # Player info + ELO
│           ├── Chat.jsx         # Real-time chat panel
│           └── Toast.jsx        # Notification toasts
└── README.md
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/players/register` | Register / login by username |
| `GET` | `/api/players/:username` | Get player stats |
| `GET` | `/api/leaderboard` | Top 50 ranked players |
| `GET` | `/api/games/history/:username` | Last 20 games for a player |
| `GET` | `/api/games/recent` | Last 10 games globally |
| `GET` | `/api/health` | Server health check |

## Socket.io Events

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `register` | `{ username }` | Authenticate socket |
| `create_room` | — | Create and join as host (X) |
| `join_room` | `{ code }` | Join room as O / spectator |
| `make_move` | `{ code, index }` | Place symbol (0–8) |
| `send_chat` | `{ code, message }` | Send chat message |
| `request_rematch` | `{ code }` | Request rematch after game |
| `leave_room` | `{ code }` | Leave current room |

### Server → Client

| Event | Description |
|---|---|
| `registered` | Player data confirmed |
| `room_created` | New room created (you are X) |
| `room_joined` | Joined existing room (you are O) |
| `room_rejoined` | Reconnected to room |
| `joined_as_spectator` | Joined as spectator |
| `game_start` | Both players joined, game begins |
| `move_made` | Opponent made a move |
| `game_over` | Game ended + ELO changes |
| `chat_message` | New chat message |
| `rematch_requested` | Player requested rematch |
| `rematch_started` | Both accepted, new game begins |
| `player_disconnected` | Player lost connection |
| `player_left` | Player left room |
| `rooms_list` | List of open rooms |
