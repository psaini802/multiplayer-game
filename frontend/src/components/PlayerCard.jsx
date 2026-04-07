export default function PlayerCard({ player, active, eloChange, finalStats }) {
  if (!player) return null;
  const sym = player.symbol?.toLowerCase();
  const displayElo = finalStats?.elo_rating ?? player.elo;

  return (
    <div className={`player-card ${active ? `active-turn symbol-${sym}` : ''}`}>
      <div className={`player-card-symbol ${sym}`}>{player.symbol}</div>
      <div className="player-card-name">{player.username}</div>
      <div className="player-card-elo">
        {displayElo} <span>ELO</span>
      </div>
      {eloChange !== undefined && eloChange !== null && (
        <div className={`elo-change ${eloChange >= 0 ? 'positive' : 'negative'}`}>
          {eloChange >= 0 ? '+' : ''}{eloChange}
        </div>
      )}
    </div>
  );
}
