import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE } from '../config';

export default function Leaderboard() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/leaderboard`)
      .then(r => r.json())
      .then(data => { setPlayers(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const rankMedal = (i) => {
    if (i === 0) return '🥇';
    if (i === 1) return '🥈';
    if (i === 2) return '🥉';
    return null;
  };

  const rankClass = (i) => {
    if (i === 0) return 'rank-1';
    if (i === 1) return 'rank-2';
    if (i === 2) return 'rank-3';
    return '';
  };

  const winRateClass = (wr) => {
    if (wr >= 60) return 'good';
    if (wr >= 40) return 'avg';
    return 'low';
  };

  return (
    <>
      <div className="page-bg" />
      <div className="page leaderboard-page">
        <div className="leaderboard-header">
          <h1 className="leaderboard-title">🏆 Leaderboard</h1>
          <Link to="/" className="btn btn-ghost" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
            ← Home
          </Link>
        </div>

        <div className="lb-table-wrap card" style={{ padding: '8px' }}>
          {loading ? (
            <div className="lb-empty">Loading rankings…</div>
          ) : players.length === 0 ? (
            <div className="lb-empty">
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🎮</div>
              <div>No ranked players yet.</div>
              <div style={{ fontSize: '0.82rem', marginTop: 4 }}>Play some games to appear here!</div>
            </div>
          ) : (
            <table className="lb-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>ELO</th>
                  <th>W</th>
                  <th>D</th>
                  <th>L</th>
                  <th>Games</th>
                  <th>Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => (
                  <tr key={p.username}>
                    <td>
                      <span className={`lb-rank ${rankClass(i)}`}>
                        {rankMedal(i) || `#${i + 1}`}
                      </span>
                    </td>
                    <td className="lb-username">{p.username}</td>
                    <td className="lb-elo">{p.elo_rating}</td>
                    <td style={{ color: '#4caf50', fontWeight: 600 }}>{p.wins}</td>
                    <td style={{ color: 'var(--gold)' }}>{p.draws}</td>
                    <td style={{ color: 'var(--secondary)' }}>{p.losses}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{p.total_games}</td>
                    <td>
                      <span className={`lb-winrate ${winRateClass(p.win_rate)}`}>
                        {p.win_rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Link to="/lobby" className="btn btn-primary">
            🎮 Play Now
          </Link>
        </div>
      </div>
    </>
  );
}
