// src/App.jsx
import React, { useState, useEffect } from 'react';
import { socket } from './socket';

function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    function onConnect() {
      console.log('✅ Connected to server!');
      setIsConnected(true);
    }

    function onDisconnect() {
      console.log('❌ Disconnected from server.');
      setIsConnected(false);
    }

    function onMessageEvent(value) {
      setMessages((previous) => [...previous, value]);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('message', onMessageEvent);

    // This connects the socket
    socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('message', onMessageEvent);
      socket.disconnect();
    };
  }, []);

  const sendMessage = (e) => {
    e.preventDefault();
    if (inputValue) {
      socket.emit('clientMessage', inputValue);
      setInputValue('');
    }
  };

  return (
    <div>
      <h1>Socket.IO Game Client</h1>
      <p>Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
      
      <div style={{ border: '1px solid #ccc', height: '300px', overflowY: 'scroll', padding: '10px', marginBottom: '10px' }}>
        {messages.map((msg, index) => (
          <div key={index}>{msg}</div>
        ))}
      </div>

      <form onSubmit={sendMessage}>
        <input 
          type="text" 
          value={inputValue} 
          onChange={(e) => setInputValue(e.target.value)} 
          placeholder="Type a message..."
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

export default App;
