import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import socket from '../socket';
import { API_BASE } from '../config';

const GameContext = createContext(null);

export function GameProvider({ children }) {
  const [player, setPlayer] = useState(() => {
    try {
      const saved = localStorage.getItem('ttt_player');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const login = useCallback(async (username) => {
    const res = await fetch(`${API_BASE}/api/players/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to register');

    setPlayer(data);
    localStorage.setItem('ttt_player', JSON.stringify(data));
    // The useEffect below handles connect + register once player state is set
    return data;
  }, []);

  const logout = useCallback(() => {
    setPlayer(null);
    localStorage.removeItem('ttt_player');
    socket.disconnect();
  }, []);

  // Register (or re-register after reconnect) whenever the socket connects
  useEffect(() => {
    if (!player) return;

    // Called on every (re)connection so the server always has this socket.id mapped
    const doRegister = () => socket.emit('register', { username: player.username });

    const onRegistered = (updated) => {
      setPlayer(updated);
      localStorage.setItem('ttt_player', JSON.stringify(updated));
    };

    socket.on('connect',    doRegister);   // handles reconnects automatically
    socket.on('registered', onRegistered);

    if (!socket.connected) {
      socket.connect(); // 'connect' event will fire doRegister when ready
    } else {
      doRegister();     // already connected — register right now
    }

    return () => {
      socket.off('connect',    doRegister);
      socket.off('registered', onRegistered);
    };
  }, [player?.username]);

  return (
    <GameContext.Provider value={{ player, setPlayer, login, logout, toast, showToast, dismissToast }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
