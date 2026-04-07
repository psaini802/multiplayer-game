const express = require('express');
const router = express.Router();

module.exports = ({ players }) => {
  router.get('/', async (req, res) => {
    try {
      const all = await players.find({
        $where: function () { return (this.wins + this.losses + this.draws) > 0; }
      }).sort({ elo_rating: -1, wins: -1 }).limit(50);

      const result = all.map(p => {
        const total = p.wins + p.losses + p.draws;
        return {
          username: p.username,
          wins: p.wins,
          losses: p.losses,
          draws: p.draws,
          elo_rating: p.elo_rating,
          total_games: total,
          win_rate: total > 0 ? Math.round(p.wins * 100 / total * 10) / 10 : 0
        };
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
};
