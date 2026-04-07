import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { GameProvider, useGame } from './context/GameContext';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import Game from './pages/Game';
import SnakeGame from './pages/SnakeGame';
import DiceGame from './pages/DiceGame';
import PongGame from './pages/PongGame';
import ConnectFourGame from './pages/ConnectFourGame';
import RPSGame from './pages/RPSGame';
import Leaderboard from './pages/Leaderboard';
import Toast from './components/Toast';
import './App.css';

function AppRoutes() {
  const { player, toast, dismissToast } = useGame();

  return (
    <>
      {toast && <Toast toast={toast} onDismiss={dismissToast} />}
      <Routes>
        <Route path="/"               element={<Home />} />
        <Route path="/lobby"          element={player ? <Lobby /> : <Navigate to="/" replace />} />
        <Route path="/game/:code"     element={player ? <Game /> : <Navigate to="/" replace />} />
        <Route path="/snake/:code"    element={player ? <SnakeGame /> : <Navigate to="/" replace />} />
        <Route path="/dice/:code"     element={player ? <DiceGame /> : <Navigate to="/" replace />} />
        <Route path="/pong/:code"     element={player ? <PongGame /> : <Navigate to="/" replace />} />
        <Route path="/c4/:code"       element={player ? <ConnectFourGame /> : <Navigate to="/" replace />} />
        <Route path="/rps/:code"      element={player ? <RPSGame /> : <Navigate to="/" replace />} />
        <Route path="/leaderboard"    element={<Leaderboard />} />
        <Route path="*"               element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <GameProvider>
      <Router>
        <AppRoutes />
      </Router>
    </GameProvider>
  );
}
