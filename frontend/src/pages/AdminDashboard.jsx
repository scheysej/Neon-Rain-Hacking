import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import FileSystemExplorer from '../components/FileSystemExplorer';

export default function AdminDashboard({ user }) {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionDetails, setSessionDetails] = useState(null);
  const [logs, setLogs] = useState([]);
  const [pushFilePath, setPushFilePath] = useState('');
  const [pushFileContents, setPushFileContents] = useState('');
  const [lockPath, setLockPath] = useState('');
  const [message, setMessage] = useState('');
  const [terminalOutput, setTerminalOutput] = useState([]);
  const [adminSocket, setAdminSocket] = useState(null);
  const [viewMode, setViewMode] = useState('single'); // 'single' or 'all'
  const [allTerminalOutputs, setAllTerminalOutputs] = useState({}); // sessionId -> output array
  const [typingStates, setTypingStates] = useState({}); // sessionId -> current typing text
  const [roundStatus, setRoundStatus] = useState({ total: 0, waiting: 0, started: 0, allStarted: false });
  const [showFileExplorer, setShowFileExplorer] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadSessions();
    loadRoundStatus();
    const interval = setInterval(() => {
      loadSessions();
      loadRoundStatus();
    }, 2000);
    
    // Connect to admin socket
    const sock = io('http://localhost:3010/admin', {
      transports: ['websocket', 'polling']
    });
    sock.on('connect', () => {
      console.log('Admin socket connected');
      setAdminSocket(sock);
    });
    sock.on('disconnect', () => {
      console.log('Admin socket disconnected');
    });
    sock.on('connect_error', (err) => {
      console.error('Admin socket connection error:', err);
    });
    
    return () => {
      clearInterval(interval);
      sock.disconnect();
    };
  }, []);

  useEffect(() => {
    if (selectedSession && viewMode === 'single') {
      loadSessionDetails();
      loadLogs();
      // Subscribe to terminal stream
      if (adminSocket) {
        adminSocket.emit('subscribe_session', { sessionId: selectedSession.id });
        setTerminalOutput([]);
      }
      
      // Set up auto-refresh for logs and details
      const refreshInterval = setInterval(() => {
        loadSessionDetails();
        loadLogs();
      }, 1000);
      
      return () => {
        clearInterval(refreshInterval);
        // Unsubscribe when session changes
        if (adminSocket) {
          adminSocket.emit('unsubscribe_session', { sessionId: selectedSession.id });
        }
      };
    }
  }, [selectedSession, adminSocket, viewMode]);
  
  // Subscribe to all sessions when in 'all' view mode
  useEffect(() => {
    if (viewMode === 'all' && adminSocket && sessions.length > 0) {
      // Subscribe to all active sessions
      sessions.forEach(session => {
        adminSocket.emit('subscribe_session', { sessionId: session.id });
        // Initialize empty output array for each session
        setAllTerminalOutputs(prev => ({
          ...prev,
          [session.id]: prev[session.id] || []
        }));
      });
      
      return () => {
        // Unsubscribe from all sessions when switching views
        sessions.forEach(session => {
          adminSocket.emit('unsubscribe_session', { sessionId: session.id });
        });
      };
    }
  }, [viewMode, adminSocket, sessions]);
  
  // Load initial terminal history when logs are loaded
  useEffect(() => {
    if (selectedSession && logs.length > 0 && terminalOutput.length === 0) {
      const recentLogs = logs.slice(-20).reverse();
      const initialOutput = recentLogs.flatMap(log => {
        const output = [];
        if (log.command) {
          output.push({ type: 'command', content: log.command, sessionId: selectedSession.id });
        }
        if (log.output) {
          try {
            const parsed = JSON.parse(log.output);
            if (parsed.output) {
              output.push({ type: 'stdout', content: parsed.output, sessionId: selectedSession.id });
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
        return output;
      });
      if (initialOutput.length > 0) {
        setTerminalOutput(initialOutput);
      }
    }
  }, [logs, selectedSession]);
  
  useEffect(() => {
    if (!adminSocket) return;
    
    const handleTerminalOutput = (data) => {
      if (viewMode === 'single' && selectedSession && data.sessionId === selectedSession.id) {
        setTerminalOutput(prev => {
          // Keep last 500 lines to prevent memory issues
          const newOutput = [...prev, data];
          return newOutput.slice(-500);
        });
        // Auto-scroll to bottom
        setTimeout(() => {
          const viewer = document.getElementById('terminal-viewer');
          if (viewer) {
            viewer.scrollTop = viewer.scrollHeight;
          }
        }, 10);
      } else if (viewMode === 'all' && data.sessionId) {
        // Update the specific session's output
        setAllTerminalOutputs(prev => {
          const sessionOutput = prev[data.sessionId] || [];
          const newOutput = [...sessionOutput, data];
          return {
            ...prev,
            [data.sessionId]: newOutput.slice(-500) // Keep last 500 lines
          };
        });
        // Auto-scroll for the specific session's viewer
        setTimeout(() => {
          const viewer = document.getElementById(`terminal-viewer-${data.sessionId}`);
          if (viewer) {
            viewer.scrollTop = viewer.scrollHeight;
          }
        }, 10);
      }
    };
    
    const handleTerminalCommand = (data) => {
      if (viewMode === 'single' && selectedSession && data.sessionId === selectedSession.id) {
        setTerminalOutput(prev => {
          const newOutput = [...prev, {
            type: 'command',
            content: data.command,
            sessionId: data.sessionId,
            timestamp: data.timestamp
          }];
          return newOutput.slice(-500);
        });
        // Clear typing state when command is submitted
        setTypingStates(prev => ({ ...prev, [data.sessionId]: '' }));
      } else if (viewMode === 'all' && data.sessionId) {
        setAllTerminalOutputs(prev => {
          const sessionOutput = prev[data.sessionId] || [];
          const newOutput = [...sessionOutput, {
            type: 'command',
            content: data.command,
            sessionId: data.sessionId,
            timestamp: data.timestamp
          }];
          return {
            ...prev,
            [data.sessionId]: newOutput.slice(-500)
          };
        });
        // Clear typing state when command is submitted
        setTypingStates(prev => ({ ...prev, [data.sessionId]: '' }));
      }
    };
    
    const handleTerminalTyping = (data) => {
      if (data && data.sessionId) {
        setTypingStates(prev => ({
          ...prev,
          [data.sessionId]: data.typing || ''
        }));
      }
    };
    
    adminSocket.on('terminal_output', handleTerminalOutput);
    adminSocket.on('terminal_command', handleTerminalCommand);
    adminSocket.on('terminal_typing', handleTerminalTyping);
    
    return () => {
      adminSocket.off('terminal_output', handleTerminalOutput);
      adminSocket.off('terminal_command', handleTerminalCommand);
      adminSocket.off('terminal_typing', handleTerminalTyping);
    };
  }, [adminSocket, selectedSession, viewMode]);

  const loadSessions = async () => {
    try {
      const res = await fetch('/api/admin/sessions', { credentials: 'include' });
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  const loadRoundStatus = async () => {
    try {
      const res = await fetch('/api/admin/round/status', { credentials: 'include' });
      const data = await res.json();
      setRoundStatus(data);
    } catch (err) {
      console.error('Failed to load round status:', err);
    }
  };

  const handleStartRound = async () => {
    try {
      const res = await fetch('/api/admin/round/start', {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        await loadRoundStatus();
        await loadSessions();
      }
    } catch (err) {
      console.error('Failed to start round:', err);
      alert('Failed to start round');
    }
  };

  const handleEndRound = async () => {
    try {
      const res = await fetch('/api/admin/round/end', {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        await loadRoundStatus();
        await loadSessions();
      }
    } catch (err) {
      console.error('Failed to end round:', err);
      alert('Failed to end round');
    }
  };

  const loadSessionDetails = async () => {
    if (!selectedSession) return;
    try {
      const res = await fetch(`/api/admin/session/${selectedSession.id}`, { credentials: 'include' });
      const data = await res.json();
      setSessionDetails(data.session);
    } catch (err) {
      console.error('Failed to load session details:', err);
    }
  };

  const loadLogs = async () => {
    if (!selectedSession) return;
    try {
      const res = await fetch(`/api/admin/session/${selectedSession.id}/logs`, { credentials: 'include' });
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err) {
      console.error('Failed to load logs:', err);
    }
  };

  const handlePushFile = async () => {
    if (!pushFilePath || !pushFileContents) return;
    
    if (viewMode === 'all') {
      // Push to all sessions
      try {
        const res = await fetch('/api/admin/bulk/push-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ path: pushFilePath, contents: pushFileContents })
        });
        if (res.ok) {
          setPushFilePath('');
          setPushFileContents('');
          loadSessions();
        }
      } catch (err) {
        console.error('Failed to push file to all:', err);
      }
    } else {
      // Push to single session
      if (!selectedSession) return;
      try {
        const res = await fetch(`/api/admin/session/${selectedSession.id}/push-file`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ path: pushFilePath, contents: pushFileContents })
        });
        if (res.ok) {
          setPushFilePath('');
          setPushFileContents('');
          loadSessionDetails();
        }
      } catch (err) {
        console.error('Failed to push file:', err);
      }
    }
  };

  const handleLock = async (locked) => {
    if (!lockPath) return;
    
    if (viewMode === 'all') {
      // Lock/unlock for all sessions
      try {
        const res = await fetch('/api/admin/bulk/lock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ path: lockPath, locked })
        });
        if (res.ok) {
          setLockPath('');
          loadSessions();
        }
      } catch (err) {
        console.error('Failed to lock/unlock all:', err);
      }
    } else {
      // Lock/unlock for single session
      if (!selectedSession) return;
      try {
        const res = await fetch(`/api/admin/session/${selectedSession.id}/lock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ path: lockPath, locked })
        });
        if (res.ok) {
          setLockPath('');
          loadSessionDetails();
        }
      } catch (err) {
        console.error('Failed to lock/unlock:', err);
      }
    }
  };

  const handleSendMessage = async () => {
    if (!message) return;
    
    if (viewMode === 'all') {
      // Send to all sessions
      try {
        const res = await fetch('/api/admin/bulk/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ message })
        });
        if (res.ok) {
          setMessage('');
        }
      } catch (err) {
        console.error('Failed to send message to all:', err);
      }
    } else {
      // Send to single session
      if (!selectedSession) return;
      try {
        const res = await fetch(`/api/admin/session/${selectedSession.id}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ message })
        });
        if (res.ok) {
          setMessage('');
        }
      } catch (err) {
        console.error('Failed to send message:', err);
      }
    }
  };

  const handleFreeze = async (frozen) => {
    if (viewMode === 'all') {
      // Freeze/unfreeze all sessions
      try {
        const res = await fetch('/api/admin/bulk/freeze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ frozen })
        });
        if (res.ok) {
          loadSessions();
        }
      } catch (err) {
        console.error('Failed to freeze/unfreeze all:', err);
      }
    } else {
      // Freeze/unfreeze single session
      if (!selectedSession) return;
      try {
        const res = await fetch(`/api/admin/session/${selectedSession.id}/freeze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ frozen })
        });
        if (res.ok) {
          loadSessionDetails();
        }
      } catch (err) {
        console.error('Failed to freeze/unfreeze:', err);
      }
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    navigate('/login');
  };

  return (
    <div className="h-screen bg-black text-cyan-400 font-mono p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600">
            IMMORTECH ADMIN DASHBOARD
          </h1>
          <div className="flex gap-4 items-center">
            {/* Round Control */}
            <div className="bg-gray-900 border border-yellow-500/30 rounded-lg p-3">
              <div className="text-sm text-yellow-400 mb-2">
                Round Status: {roundStatus.waiting} waiting, {roundStatus.started} started
              </div>
              <div className="flex gap-2">
                {!roundStatus.globalRoundStarted && roundStatus.total > 0 && (
                  <button
                    onClick={handleStartRound}
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded text-white text-sm"
                  >
                    Start Round
                  </button>
                )}
                {roundStatus.globalRoundStarted && (
                  <button
                    onClick={handleEndRound}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white text-sm"
                  >
                    End Round
                  </button>
                )}
              </div>
            </div>
            {/* File Explorer Toggle */}
            <button
              onClick={() => setShowFileExplorer(!showFileExplorer)}
              className={`px-4 py-2 rounded ${
                showFileExplorer
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {showFileExplorer ? 'Hide' : 'Show'} File Explorer
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('single')}
                className={`px-4 py-2 rounded ${
                  viewMode === 'single'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                Single View
              </button>
              <button
                onClick={() => setViewMode('all')}
                className={`px-4 py-2 rounded ${
                  viewMode === 'all'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                All Terminals
              </button>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white"
            >
              Logout
            </button>
          </div>
        </div>

        {viewMode === 'all' ? (
          /* All Terminals View */
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-cyan-400 mb-4">All Active Terminals</h2>
            
            {/* Bulk Actions Panel */}
            <div className="bg-gray-900 border border-cyan-500/30 rounded-lg p-4 mb-4">
              <h3 className="text-lg font-bold text-cyan-400 mb-4">Bulk Actions</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Send Message to All */}
                <div className="space-y-2">
                  <label className="text-sm text-gray-400">Send Message to All</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Message..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSendMessage();
                        }
                      }}
                      className="flex-1 bg-black border border-cyan-500/50 rounded px-3 py-2 text-cyan-300 text-sm"
                    />
                    <button
                      onClick={handleSendMessage}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-white text-sm"
                    >
                      Send
                    </button>
                  </div>
                </div>

                {/* Push File to All */}
                <div className="space-y-2">
                  <label className="text-sm text-gray-400">Push File to All</label>
                  <input
                    type="text"
                    placeholder="/path/to/file"
                    value={pushFilePath}
                    onChange={(e) => setPushFilePath(e.target.value)}
                    className="w-full bg-black border border-cyan-500/50 rounded px-3 py-2 text-cyan-300 text-sm mb-2"
                  />
                  <textarea
                    placeholder="File contents..."
                    value={pushFileContents}
                    onChange={(e) => setPushFileContents(e.target.value)}
                    className="w-full bg-black border border-cyan-500/50 rounded px-3 py-2 text-cyan-300 text-sm h-20 mb-2"
                  />
                  <button
                    onClick={handlePushFile}
                    className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded text-white text-sm"
                  >
                    Push File
                  </button>
                </div>

                {/* Freeze/Unfreeze All */}
                <div className="space-y-2">
                  <label className="text-sm text-gray-400">Freeze Control</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleFreeze(true)}
                      className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white text-sm"
                    >
                      Freeze All
                    </button>
                    <button
                      onClick={() => handleFreeze(false)}
                      className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white text-sm"
                    >
                      Unfreeze All
                    </button>
                  </div>
                </div>

                {/* Lock/Unlock Path for All */}
                <div className="space-y-2">
                  <label className="text-sm text-gray-400">Lock/Unlock Path</label>
                  <input
                    type="text"
                    placeholder="/path/to/lock"
                    value={lockPath}
                    onChange={(e) => setLockPath(e.target.value)}
                    className="w-full bg-black border border-cyan-500/50 rounded px-3 py-2 text-cyan-300 text-sm mb-2"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleLock(true)}
                      className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white text-sm"
                    >
                      Lock All
                    </button>
                    <button
                      onClick={() => handleLock(false)}
                      className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white text-sm"
                    >
                      Unlock All
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sessions.map(session => {
                const sessionOutput = allTerminalOutputs[session.id] || [];
                return (
                  <div key={session.id} className="bg-gray-900 border border-cyan-500/30 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-lg font-bold text-cyan-400">{session.username}</h3>
                      <span className="text-xs text-gray-500">{session.currentPath}</span>
                    </div>
                    <div 
                      id={`terminal-viewer-${session.id}`}
                      className="bg-black rounded p-3 h-64 overflow-y-auto text-xs font-mono"
                      style={{ scrollBehavior: 'smooth' }}
                    >
                      {sessionOutput.length === 0 && !(typingStates[session.id] || '') ? (
                        <div className="text-gray-500">Waiting for terminal activity...</div>
                      ) : (
                        <>
                          {sessionOutput.map((output, i) => {
                          let colorClass = 'text-cyan-400';
                          if (output.type === 'error') colorClass = 'text-red-400';
                          else if (output.type === 'ai') colorClass = 'text-yellow-400';
                          else if (output.type === 'system') colorClass = 'text-red-400';
                          else if (output.type === 'command') colorClass = 'text-green-400';
                          
                          return (
                            <div key={i} className={`mb-1 ${colorClass}`}>
                              {output.type === 'command' ? (
                                <span className="text-green-400">$ {output.content}</span>
                              ) : output.type === 'clear' ? (
                                <div className="text-gray-500">[Terminal cleared]</div>
                              ) : output.type === 'prompt' ? (
                                <span className="text-cyan-400">{output.content}</span>
                              ) : (
                                <pre className="whitespace-pre-wrap font-mono">{output.content}</pre>
                              )}
                            </div>
                          );
                        })}
                          {typingStates[session.id] && typingStates[session.id].length > 0 && (
                            <div className="text-gray-500 italic">
                              <span className="text-green-400">$ {typingStates[session.id]}</span>
                              <span className="animate-pulse">_</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              {sessions.length === 0 && (
                <div className="col-span-full text-center text-gray-500 py-8">
                  No active sessions
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-6">
              {/* File System Explorer */}
              {showFileExplorer && (
                <div className="bg-gray-900 border border-yellow-500/30 rounded-lg p-4">
                  <h2 className="text-xl font-bold mb-4 text-yellow-400">File System Explorer</h2>
                  {selectedSession ? (
                    <div className="h-96">
                      <FileSystemExplorer
                        sessionId={selectedSession.id}
                        onFileOperation={(op, path, value) => {
                          console.log('File operation:', op, path, value);
                          loadSessionDetails();
                        }}
                      />
                    </div>
                  ) : (
                    <div className="text-gray-500 text-center py-8">
                      Select a session to view filesystem
                    </div>
                  )}
                </div>
              )}
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Sessions List */}
              <div className="lg:col-span-1">
              <div className="bg-gray-900 border border-cyan-500/30 rounded-lg p-4">
                <h2 className="text-xl font-bold mb-4 text-cyan-400">Active Sessions</h2>
              <div className="space-y-2">
                {sessions.map(session => (
                  <div
                    key={session.id}
                    onClick={() => setSelectedSession(session)}
                    className={`p-3 rounded cursor-pointer border transition ${
                      selectedSession?.id === session.id
                        ? 'bg-cyan-500/20 border-cyan-500'
                        : 'bg-gray-800 border-gray-700 hover:border-cyan-500/50'
                    }`}
                  >
                    <div className="font-bold">{session.username}</div>
                    <div className="text-sm text-gray-400">{session.currentPath}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(session.lastActivity).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
                {sessions.length === 0 && (
                  <div className="text-gray-500 text-center py-4">No active sessions</div>
                )}
              </div>
            </div>
          </div>

          {/* Session Details & Controls */}
          <div className="lg:col-span-2 space-y-6">
            {selectedSession ? (
              <>
                {/* Session Info */}
                <div className="bg-gray-900 border border-cyan-500/30 rounded-lg p-4">
                  <h2 className="text-xl font-bold mb-4 text-cyan-400">Session Details</h2>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Username:</span> {selectedSession.username}
                    </div>
                    <div>
                      <span className="text-gray-500">Current Path:</span> {sessionDetails?.currentPath || selectedSession.currentPath}
                    </div>
                    <div>
                      <span className="text-gray-500">AI Status:</span> {sessionDetails?.aiState?.status || 'idle'}
                    </div>
                    <div>
                      <span className="text-gray-500">AI Level:</span> {sessionDetails?.aiState?.level || 0}
                    </div>
                    <div>
                      <span className="text-gray-500">Frozen:</span> {sessionDetails?.frozen ? 'Yes' : 'No'}
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => handleFreeze(!sessionDetails?.frozen)}
                      className={`px-4 py-2 rounded ${
                        sessionDetails?.frozen
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-red-600 hover:bg-red-700'
                      } text-white`}
                    >
                      {sessionDetails?.frozen ? 'Unfreeze' : 'Freeze'}
                    </button>
                  </div>
                </div>

                {/* Push File */}
                <div className="bg-gray-900 border border-cyan-500/30 rounded-lg p-4">
                  <h2 className="text-xl font-bold mb-4 text-cyan-400">Push File</h2>
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="/path/to/file.txt"
                      value={pushFilePath}
                      onChange={(e) => setPushFilePath(e.target.value)}
                      className="w-full bg-black border border-cyan-500/50 rounded px-3 py-2 text-cyan-300"
                    />
                    <textarea
                      placeholder="File contents..."
                      value={pushFileContents}
                      onChange={(e) => setPushFileContents(e.target.value)}
                      className="w-full bg-black border border-cyan-500/50 rounded px-3 py-2 text-cyan-300 h-32"
                    />
                    <button
                      onClick={handlePushFile}
                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded text-white"
                    >
                      Push File
                    </button>
                  </div>
                </div>

                {/* Lock/Unlock */}
                <div className="bg-gray-900 border border-cyan-500/30 rounded-lg p-4">
                  <h2 className="text-xl font-bold mb-4 text-cyan-400">Lock/Unlock Path</h2>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="/path/to/lock"
                      value={lockPath}
                      onChange={(e) => setLockPath(e.target.value)}
                      className="flex-1 bg-black border border-cyan-500/50 rounded px-3 py-2 text-cyan-300"
                    />
                    <button
                      onClick={() => handleLock(true)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white"
                    >
                      Lock
                    </button>
                    <button
                      onClick={() => handleLock(false)}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white"
                    >
                      Unlock
                    </button>
                  </div>
                </div>

                {/* Send Message */}
                <div className="bg-gray-900 border border-cyan-500/30 rounded-lg p-4">
                  <h2 className="text-xl font-bold mb-4 text-cyan-400">Send Message</h2>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Message to send..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSendMessage();
                        }
                      }}
                      className="flex-1 bg-black border border-cyan-500/50 rounded px-3 py-2 text-cyan-300"
                    />
                    <button
                      onClick={handleSendMessage}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-white"
                    >
                      Send
                    </button>
                  </div>
                </div>

                {/* Live Terminal View */}
                <div className="bg-gray-900 border border-cyan-500/30 rounded-lg p-4">
                  <h2 className="text-xl font-bold mb-4 text-cyan-400">Live Terminal View</h2>
                  <div 
                    id="terminal-viewer"
                    className="bg-black rounded p-3 h-96 overflow-y-auto text-sm font-mono"
                    style={{ scrollBehavior: 'smooth' }}
                  >
                    {terminalOutput.length === 0 && !(typingStates[selectedSession?.id] || '') ? (
                      <div className="text-gray-500">Waiting for terminal activity...</div>
                    ) : (
                      <>
                        {terminalOutput.map((output, i) => {
                        let colorClass = 'text-cyan-400';
                        if (output.type === 'error') colorClass = 'text-red-400';
                        else if (output.type === 'ai') colorClass = 'text-yellow-400';
                        else if (output.type === 'system') colorClass = 'text-red-400';
                        else if (output.type === 'command') colorClass = 'text-green-400';
                        
                        return (
                          <div key={i} className={`mb-1 ${colorClass}`}>
                            {output.type === 'command' ? (
                              <span className="text-green-400">$ {output.content}</span>
                            ) : output.type === 'clear' ? (
                              <div className="text-gray-500">[Terminal cleared]</div>
                            ) : output.type === 'prompt' ? (
                              <span className="text-cyan-400">{output.content}</span>
                            ) : (
                              <pre className="whitespace-pre-wrap font-mono">{output.content}</pre>
                            )}
                          </div>
                        );
                      })}
                        {selectedSession && typingStates[selectedSession.id] && typingStates[selectedSession.id].length > 0 && (
                          <div className="text-gray-500 italic">
                            <span className="text-green-400">$ {typingStates[selectedSession.id]}</span>
                            <span className="animate-pulse">_</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Command Logs */}
                <div className="bg-gray-900 border border-cyan-500/30 rounded-lg p-4">
                  <h2 className="text-xl font-bold mb-4 text-cyan-400">Command Logs</h2>
                  <div className="bg-black rounded p-3 h-64 overflow-auto text-sm">
                    {logs.slice().reverse().map((log, i) => (
                      <div key={i} className="mb-2 text-gray-400">
                        <span className="text-cyan-400">{log.command}</span>
                        {log.output && (
                          <div className="ml-4 text-gray-500 text-xs mt-1">
                            {JSON.parse(log.output).output?.substring(0, 100)}
                          </div>
                        )}
                      </div>
                    ))}
                    {logs.length === 0 && (
                      <div className="text-gray-500">No logs yet</div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-gray-900 border border-cyan-500/30 rounded-lg p-8 text-center text-gray-500">
                Select a session to view details
              </div>
            )}
          </div>
        </div>
          </div>
          </>
        )}
        
        {/* Group File Explorer */}
        {viewMode === 'all' && showFileExplorer && (
          <div className="bg-gray-900 border border-yellow-500/30 rounded-lg p-4 mt-6">
            <h2 className="text-xl font-bold mb-4 text-yellow-400">Group File System Explorer</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sessions.map(session => (
                <div key={session.id} className="bg-gray-800 border border-yellow-500/20 rounded p-3">
                  <h3 className="text-sm font-bold text-yellow-400 mb-2">{session.username}</h3>
                  <div className="h-64">
                    <FileSystemExplorer
                      sessionId={session.id}
                      onFileOperation={(op, path, value) => {
                        console.log('File operation:', op, path, value);
                        loadSessions();
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
