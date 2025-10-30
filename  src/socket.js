// src/socket.js
import { io } from 'socket.io-client';

// 1. Use an environment variable for the server URL.
//    Vite uses `import.meta.env.VITE_...`
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

console.log(`Connecting to server at: ${SERVER_URL}`);

export const socket = io(SERVER_URL, {
  // 2. autoConnect: false is a good practice.
  //    It allows you to add listeners before the connection is made.
  autoConnect: false,
});
