const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

module.exports = ({ players }) => {
  router.post('/register', async (req, res) => {
    try {
      const { username } = req.body;
      if (!username || username.trim().length < 2 || username.trim().length > 20) {
        return res.status(400).json({ error: 'Username must be 2–20 characters' });
      }
      const clean = username.trim().replace(/[^a-zA-Z0-9_\-]/g, '');
      if (clean.length < 2) {
        return res.status(400).json({ error: 'Use only letters, numbers, _ or -' });
      }

      let player = await players.findOne({ username: clean });
      if (!player) {
        player = await players.insert({
          id: uuidv4(),
          username: clean,
          wins: 0, losses: 0, draws: 0,
          elo_rating: 1000,
          created_at: new Date().toISOString(),
          last_seen: new Date().toISOString()
        });
      } else {
        await players.update({ username: clean }, { $set: { last_seen: new Date().toISOString() } });
        player = await players.findOne({ username: clean });
      }
      res.json(player);
    } catch (err) {
      if (err.errorType === 'uniqueViolated') {
        const player = await players.findOne({ username: req.body.username?.trim() });
        return res.json(player);
      }
      res.status(500).json({ error: 'Server error' });
    }
  });

  router.get('/:username', async (req, res) => {
    const player = await players.findOne({ username: req.params.username });
    if (!player) return res.status(404).json({ error: 'Player not found' });
    res.json(player);
  });

  return router;
};
