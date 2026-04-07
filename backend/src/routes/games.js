const express = require('express');
const router = express.Router();

module.exports = ({ games }) => {
  router.get('/history/:username', async (req, res) => {
    try {
      const u = req.params.username;
      const rows = await games.find({ $or: [{ player_x: u }, { player_o: u }] })
        .sort({ created_at: -1 }).limit(20);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  router.get('/recent', async (req, res) => {
    try {
      const rows = await games.find({}).sort({ created_at: -1 }).limit(10);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
};
