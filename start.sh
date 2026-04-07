#!/usr/bin/env bash
# Start backend and frontend, both exposed on all network interfaces

LAN_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)
[ -z "$LAN_IP" ] && LAN_IP="<your-ip>"

echo ""
echo "🎮  Starting Multiplayer Game Arcade..."
echo ""
echo "  ┌─────────────────────────────────────────────────┐"
echo "  │  Frontend  → http://localhost:5173              │"
echo "  │  Frontend  → http://$LAN_IP:5173  (LAN)  │"
echo "  │  Backend   → http://localhost:3001              │"
echo "  │  Backend   → http://$LAN_IP:3001  (LAN)  │"
echo "  └─────────────────────────────────────────────────┘"
echo ""
echo "  Other players on your Wi-Fi: open http://$LAN_IP:5173"
echo ""

# Start backend
(cd backend && npm run dev) &
BACKEND_PID=$!

sleep 1

# Start frontend (host:0.0.0.0 is already set in vite.config.js)
(cd frontend && npm run dev) &
FRONTEND_PID=$!

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo ''; echo 'Servers stopped.'" EXIT
wait
