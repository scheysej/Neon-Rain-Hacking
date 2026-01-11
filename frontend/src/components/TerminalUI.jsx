import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import io from 'socket.io-client';

export default function TerminalUI({ sessionId, user, setUser }) {
  const navigate = useNavigate();
  const terminalRef = useRef(null);
  const terminal = useRef(null);
  const fitAddon = useRef(null);
  const socket = useRef(null);
  const [connected, setConnected] = useState(false);
  const currentLine = useRef('');

  useEffect(() => {
    // Initialize terminal
    const term = new XTerm({
      theme: {
        background: '#000000',
        foreground: '#00ffff',
        cursor: '#00ffff',
        selection: '#00ffff33'
      },
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
      fontSize: 14,
      cursorBlink: true,
      cursorStyle: 'block'
    });

    fitAddon.current = new FitAddon();
    term.loadAddon(fitAddon.current);
    term.open(terminalRef.current);
    fitAddon.current.fit();

    terminal.current = term;

    // Connect to socket
    const sock = io('http://localhost:3010', {
      transports: ['websocket']
    });

    sock.on('connect', () => {
      setConnected(true);
      sock.emit('join_session', { sessionId });
    });

    sock.on('logout', async () => {
      // Clear user session and redirect
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      } catch (err) {
        console.error('Logout error:', err);
      }
      // Clear user state first
      if (setUser) {
        setUser(null);
      }
      // Disconnect socket
      if (socket.current) {
        socket.current.disconnect();
        socket.current = null;
      }
      // Navigate to login with replace to prevent back navigation
      setTimeout(() => {
        window.location.href = '/login';
      }, 100);
    });

    sock.on('disconnect', () => {
      setConnected(false);
    });

    sock.on('output', (data) => {
      if (data.type === 'clear') {
        term.clear();
      } else if (data.type === 'prompt') {
        term.write('\r\n' + data.content);
      } else {
        const reset = '\x1b[0m';
        const style = data.type === 'error' ? '\x1b[31m' : 
                     data.type === 'ai' ? '\x1b[33m' : 
                     data.type === 'system' ? '\x1b[31m' : ''; // Red for system messages
        // Split by newlines and write each line separately to avoid formatting issues
        const lines = data.content.split('\n');
        lines.forEach((line, index) => {
          if (line || index < lines.length - 1) { // Write line even if empty (except last)
            term.writeln(style + line + reset);
          }
        });
      }
    });

    sock.on('system_message', (data) => {
      term.writeln(`\r\n\x1b[31m[SYSTEM] ${data.message}\x1b[0m`);
      // Prompt will be sent separately via output event, but if path is provided, use it
      if (data.path) {
        term.write(`${data.path} $ `);
      }
    });

    sock.on('error', (data) => {
      term.writeln(`\r\n\x1b[31m[ERROR] ${data.message}\x1b[0m`);
    });

    socket.current = sock;

    // Handle terminal input
    term.onData((data) => {
      if (data === '\r' || data === '\n') {
        // Enter pressed
        const command = currentLine.current.trim();
        if (command) {
          // The command is already visible in the terminal (user typed it)
          // Just move to new line and send
          term.write('\r\n');
          sock.emit('command', { command });
          // Broadcast that command was submitted (clears the typing indicator)
          sock.emit('typing_update', { sessionId, typing: '', isCommand: true });
          currentLine.current = '';
        } else {
          // Just newline if no command
          term.write('\r\n');
          sock.emit('typing_update', { sessionId, typing: '', isCommand: false });
        }
      } else if (data === '\x7f' || data === '\b') {
        // Backspace
        if (currentLine.current.length > 0) {
          currentLine.current = currentLine.current.slice(0, -1);
          term.write('\b \b');
          // Broadcast updated typing state
          sock.emit('typing_update', { sessionId, typing: currentLine.current });
        } else {
          sock.emit('typing_update', { sessionId, typing: '' });
        }
      } else if (data === '\x03') {
        // Ctrl+C
        term.write('^C\r\n');
        currentLine.current = '';
        sock.emit('typing_update', { sessionId, typing: '', isCommand: false });
      } else if (data >= ' ') {
        // Printable character
        currentLine.current += data;
        term.write(data);
        // Broadcast typing in real-time
        sock.emit('typing_update', { sessionId, typing: currentLine.current });
      }
    });

    // Handle window resize
    const handleResize = () => {
      fitAddon.current?.fit();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      sock.disconnect();
      term.dispose();
    };
  }, [sessionId]);

  return (
    <div className="w-full h-full bg-black">
      <div ref={terminalRef} className="w-full h-full" />
    </div>
  );
}
