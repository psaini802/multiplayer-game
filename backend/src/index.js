const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = require('./database');
const playerRoutes = require('./routes/players');
const leaderboardRoutes = require('./routes/leaderboard');
const gameRoutes = require('./routes/games');
const setupGameHandler = require('./socket/gameHandler');

const app = express();
const server = http.createServer(app);

// Accept requests from any origin — required for LAN / multi-device play
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());

app.use('/api/players',     playerRoutes(db));
app.use('/api/leaderboard', leaderboardRoutes(db));
app.use('/api/games',       gameRoutes(db));
app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

const rooms   = new Map();
const players = new Map();

setupGameHandler(io, rooms, players, db);

// Helper: print all LAN IPv4 addresses
function getLanIPs() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const iface of Object.values(nets)) {
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) ips.push(alias.address);
    }
  }
  return ips;
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  const ips = getLanIPs();
  console.log('\n🎮  Game server is running!\n');
  console.log(`   Local   → http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`   Network → http://${ip}:${PORT}`));
  console.log('\n   Share the Network URL with other players on the same Wi-Fi.\n');
});
