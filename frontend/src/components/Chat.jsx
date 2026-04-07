import { useState, useRef, useEffect } from 'react';

export default function Chat({ messages, myUsername, onSend, disabled }) {
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    const msg = input.trim();
    if (!msg || disabled) return;
    onSend(msg);
    setInput('');
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="chat-container">
      <div className="chat-header">💬 Chat</div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-system" style={{ marginTop: 'auto', paddingTop: 20 }}>
            Say hello to your opponent!
          </div>
        )}
        {messages.map((msg, i) => {
          const isSelf = msg.username === myUsername;
          const isSystem = !msg.username || msg.username === 'system';
          return isSystem ? (
            <div key={i} className="chat-system">{msg.message}</div>
          ) : (
            <div key={i} className="chat-msg">
              <div className={`chat-msg-author ${isSelf ? 'self' : 'other'}`}>
                {msg.username}
                <span style={{ marginLeft: 6, fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                  {formatTime(msg.timestamp)}
                </span>
              </div>
              <div className="chat-msg-text">{msg.message}</div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form className="chat-input-row" onSubmit={handleSend}>
        <input
          className="input"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={disabled ? 'Waiting…' : 'Type a message…'}
          disabled={disabled}
          maxLength={200}
        />
        <button type="submit" className="chat-send-btn" disabled={disabled || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
