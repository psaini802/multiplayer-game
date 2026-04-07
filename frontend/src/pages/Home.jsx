import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { API_BASE } from '../config';

const LOGO_PATTERN = [1, 0, 1, 0, 1, 0, 1, 0, 1]; // 1=X, 0=O

export default function Home() {
  const { player, login, showToast } = useGame();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ players: '—', games: '—' });

  useEffect(() => {
    if (player) navigate('/lobby', { replace: true });
  }, [player, navigate]);

  useEffect(() => {
    fetch(`${API_BASE}/api/leaderboard`)
      .then(r => r.json())
      .then(data => setStats({ players: data.length, games: data.reduce((s, p) => s + p.total_games, 0) }))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    try {
      await login(username.trim());
      navigate('/lobby');
    } catch (err) {
      showToast(err.message || 'Failed to join', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="page-bg" />
      <div className="page home">
        <div className="home-content card" style={{ padding: '48px 40px' }}>
          <div className="home-logo">
            {LOGO_PATTERN.map((v, i) => (
              <div key={i} className={`logo-cell ${v === 1 ? 'filled-x' : 'filled-o'}`} />
            ))}
          </div>

          <h1 className="home-title">TIC TAC TOE</h1>
          <p className="home-subtitle">Real-time multiplayer · ELO ranked</p>

          <form className="home-form" onSubmit={handleSubmit}>
            <input
              className="input"
              placeholder="Enter your username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              maxLength={20}
              autoFocus
              spellCheck={false}
            />
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading || !username.trim()}
            >
              {loading ? 'Connecting…' : 'Play Now'}
            </button>
          </form>

          <div className="home-divider" style={{ marginTop: 24, marginBottom: 24 }}>
            <span>or</span>
          </div>

          <Link to="/leaderboard" className="btn btn-ghost" style={{ width: '100%' }}>
            🏆 View Leaderboard
          </Link>

          <div className="home-stats">
            <div className="home-stat">
              <div className="home-stat-value">{stats.players}</div>
              <div className="home-stat-label">Players</div>
            </div>
            <div className="home-stat">
              <div className="home-stat-value">{stats.games}</div>
              <div className="home-stat-label">Games Played</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
