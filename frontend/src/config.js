// Dynamically resolves the backend URL from wherever the frontend is served.
// Works on localhost, LAN IP (e.g. 192.168.x.x), or any hostname.
const host = window.location.hostname;
export const API_BASE   = `http://${host}:3001`;
export const SOCKET_URL = `http://${host}:3001`;
