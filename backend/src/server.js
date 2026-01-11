import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import session from 'express-session';
import bcrypt from 'bcrypt';
import db from './db/database.js';
import sessionManager from './services/sessionManager.js';
import { CommandParser } from './services/commandParser.js';
import { VFSEngine } from './services/vfsEngine.js';
import aiEngine from './services/aiEngine.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true
}));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'neon-rain-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// Auth middleware
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session.userId || req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

// Auth routes
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;
  
  res.json({ 
    success: true, 
    user: { id: user.id, username: user.username, role: user.role } 
  });
});

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
      .run(username, hash, 'player');
    
    req.session.userId = result.lastInsertRowid;
    req.session.username = username;
    req.session.role = 'player';
    
    res.json({ 
      success: true, 
      user: { id: result.lastInsertRowid, username, role: 'player' } 
    });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ 
    user: { 
      id: req.session.userId, 
      username: req.session.username, 
      role: req.session.role 
    } 
  });
});

// Session routes
app.post('/api/session/create', requireAuth, (req, res) => {
  // Check if user already has an active session
  const existingSessions = sessionManager.getSessionsByUser(req.session.userId);
  
  // If user has an active session, reuse it instead of creating a new one
  if (existingSessions.length > 0) {
    // Use the most recent session
    const latestSession = existingSessions.sort((a, b) => 
      new Date(b.lastActivity) - new Date(a.lastActivity)
    )[0];
    const session = sessionManager.getSession(latestSession.id);
    
    // Check global round status - if round is started, ensure session reflects it
    if (session && sessionManager.getGlobalRoundStatus()) {
      session.waitingRoom = false;
      session.roundStarted = true;
      sessionManager.persistSession(latestSession.id);
    }
    
    return res.json({ 
      sessionId: latestSession.id,
      roundStarted: sessionManager.getGlobalRoundStatus()
    });
  }
  
  // Create new session if none exists
  const session = sessionManager.createSession(req.session.userId, req.session.username);
  
  // If round is already started globally, set session accordingly
  if (sessionManager.getGlobalRoundStatus()) {
    session.waitingRoom = false;
    session.roundStarted = true;
    sessionManager.persistSession(session.id);
  }
  
  res.json({ 
    sessionId: session.id,
    roundStarted: sessionManager.getGlobalRoundStatus()
  });
});

// Admin routes
app.get('/api/admin/sessions', requireAdmin, (req, res) => {
  const sessions = sessionManager.getAllSessions();
  res.json({ sessions });
});

app.get('/api/admin/session/:id', requireAdmin, (req, res) => {
  const session = sessionManager.getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json({ 
    session: {
      id: session.id,
      username: session.username,
      currentPath: session.currentPath,
      aiState: session.aiState,
      frozen: session.frozen,
      waitingRoom: session.waitingRoom,
      roundStarted: session.roundStarted
    }
  });
});

app.get('/api/admin/session/:id/filesystem', requireAdmin, (req, res) => {
  const session = sessionManager.getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json({ filesystem: session.fs });
});

app.get('/api/admin/session/:id/logs', requireAdmin, (req, res) => {
  const logs = sessionManager.getLogs(req.params.id, 100);
  res.json({ logs });
});

app.post('/api/admin/session/:id/push-file', requireAdmin, (req, res) => {
  const { path, contents, meta } = req.body;
  const session = sessionManager.getSession(req.params.id);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  try {
    VFSEngine.addFile(session, path, contents, meta || {});
    sessionManager.persistSession(req.params.id);
    
    // Notify player via socket - ambiguous system message
    io.to(req.params.id).emit('system_message', {
      type: 'file_added',
      path,
      message: `[SYSTEM] File ${path} has been added.`
    });
    
    // Broadcast to admins
    broadcastToAdmins(req.params.id, 'terminal_output', {
      type: 'system',
      content: `[SYSTEM] File ${path} has been added.\n`
    });
    
    setTimeout(() => {
      io.to(req.params.id).emit('output', {
        type: 'prompt',
        content: `${session.currentPath} $ `
      });
      broadcastToAdmins(req.params.id, 'terminal_output', {
        type: 'prompt',
        content: `${session.currentPath} $ `
      });
    }, 100);
    
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/session/:id/lock', requireAdmin, (req, res) => {
  const { path, locked } = req.body;
  const session = sessionManager.getSession(req.params.id);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  try {
    VFSEngine.setLock(session, path, locked !== false);
    sessionManager.persistSession(req.params.id);
    
    io.to(req.params.id).emit('system_message', {
      type: 'lock_changed',
      path,
      locked: locked !== false,
      message: `${path} has been ${locked !== false ? 'locked' : 'unlocked'}.`
    });
    
    // Send prompt after system message
    setTimeout(() => {
      io.to(req.params.id).emit('output', {
        type: 'prompt',
        content: `${session.currentPath} $ `
      });
      broadcastToAdmins(req.params.id, 'terminal_output', {
        type: 'prompt',
        content: `${session.currentPath} $ `
      });
    }, 100);
    
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/session/:id/message', requireAdmin, (req, res) => {
  const { message } = req.body;
  const session = sessionManager.getSession(req.params.id);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  io.to(req.params.id).emit('system_message', {
    type: 'admin_message',
    message,
    timestamp: new Date().toISOString()
  });
  // Also broadcast to admin viewers
  broadcastToAdmins(req.params.id, 'terminal_output', {
    type: 'system',
    content: `[SYSTEM] ${message}\n`
  });
  
  // Send prompt after system message so player can continue typing
  setTimeout(() => {
    io.to(req.params.id).emit('output', {
      type: 'prompt',
      content: `${session.currentPath} $ `
    });
    broadcastToAdmins(req.params.id, 'terminal_output', {
      type: 'prompt',
      content: `${session.currentPath} $ `
    });
  }, 100);
  
  res.json({ success: true });
});

// Bulk admin actions
app.post('/api/admin/bulk/message', requireAdmin, (req, res) => {
  const { message } = req.body;
  const sessions = sessionManager.getAllSessions();
  
  sessions.forEach(session => {
    const sessionObj = sessionManager.getSession(session.id);
    if (sessionObj) {
      io.to(session.id).emit('system_message', {
        type: 'admin_message',
        message,
        timestamp: new Date().toISOString()
      });
      broadcastToAdmins(session.id, 'terminal_output', {
        type: 'system',
        content: `[SYSTEM] ${message}\n`
      });
      
      // Send prompt after system message so player can continue typing
      setTimeout(() => {
        io.to(session.id).emit('output', {
          type: 'prompt',
          content: `${sessionObj.currentPath} $ `
        });
        broadcastToAdmins(session.id, 'terminal_output', {
          type: 'prompt',
          content: `${sessionObj.currentPath} $ `
        });
      }, 100);
    }
  });
  
  res.json({ success: true, count: sessions.length });
});

app.post('/api/admin/bulk/push-file', requireAdmin, (req, res) => {
  const { path, contents, meta } = req.body;
  const sessions = sessionManager.getAllSessions();
  const results = [];
  
  sessions.forEach(session => {
    try {
      const sessionObj = sessionManager.getSession(session.id);
      if (sessionObj) {
        VFSEngine.writeFile(sessionObj, path, contents, meta);
        sessionManager.persistSession(session.id);
        
        // Notify player via socket - ambiguous system message
        io.to(session.id).emit('system_message', {
          type: 'file_added',
          path,
          message: `[SYSTEM] File ${path} has been added.`
        });
        
        broadcastToAdmins(session.id, 'terminal_output', {
          type: 'system',
          content: `[SYSTEM] File ${path} has been added.\n`
        });
        
        setTimeout(() => {
          io.to(session.id).emit('output', {
            type: 'prompt',
            content: `${sessionObj.currentPath} $ `
          });
          broadcastToAdmins(session.id, 'terminal_output', {
            type: 'prompt',
            content: `${sessionObj.currentPath} $ `
          });
        }, 100);
        
        results.push({ sessionId: session.id, success: true });
      }
    } catch (err) {
      results.push({ sessionId: session.id, success: false, error: err.message });
    }
  });
  
  res.json({ success: true, results, count: results.length });
});

app.post('/api/admin/bulk/freeze', requireAdmin, (req, res) => {
  const { frozen } = req.body;
  const sessions = sessionManager.getAllSessions();
  
  sessions.forEach(session => {
    const sessionObj = sessionManager.getSession(session.id);
    if (sessionObj) {
      sessionObj.frozen = frozen;
      sessionManager.persistSession(session.id);
    }
  });
  
  res.json({ success: true, frozen, count: sessions.length });
});

app.post('/api/admin/bulk/lock', requireAdmin, (req, res) => {
  const { path, locked } = req.body;
  const sessions = sessionManager.getAllSessions();
  const results = [];
  
  sessions.forEach(session => {
    try {
      const sessionObj = sessionManager.getSession(session.id);
      if (sessionObj) {
        VFSEngine.setLock(sessionObj, path, locked !== false);
        sessionManager.persistSession(session.id);
        
        io.to(session.id).emit('system_message', {
          type: 'lock_changed',
          path,
          locked: locked !== false,
          message: `${path} has been ${locked !== false ? 'locked' : 'unlocked'}.`
        });
        
        // Send prompt after system message
        setTimeout(() => {
          io.to(session.id).emit('output', {
            type: 'prompt',
            content: `${sessionObj.currentPath} $ `
          });
          broadcastToAdmins(session.id, 'terminal_output', {
            type: 'prompt',
            content: `${sessionObj.currentPath} $ `
          });
        }, 100);
        
        results.push({ sessionId: session.id, success: true });
      }
    } catch (err) {
      results.push({ sessionId: session.id, success: false, error: err.message });
    }
  });
  
  res.json({ success: true, results, count: results.length });
});

app.post('/api/admin/session/:id/freeze', requireAdmin, (req, res) => {
  const { frozen } = req.body;
  const session = sessionManager.getSession(req.params.id);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  session.frozen = frozen !== false;
  res.json({ success: true, frozen: session.frozen });
});

app.post('/api/admin/session/:id/ai', requireAdmin, (req, res) => {
  const { level, status } = req.body;
  const session = sessionManager.getSession(req.params.id);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  aiEngine.setState(session, level, status);
  res.json({ success: true, aiState: session.aiState });
});

// File operations endpoints
app.post('/api/admin/session/:id/delete', requireAdmin, async (req, res) => {
  const { path } = req.body;
  const session = sessionManager.getSession(req.params.id);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  try {
    await VFSEngine.delete(session, path);
    sessionManager.persistSession(req.params.id);
    
    // Check if paths were unlocked
    if (session.meta?.recentlyUnlockedSessions) {
      const unlockedSessions = session.meta.recentlyUnlockedSessions;
      const unlockedPaths = session.meta.recentlyUnlockedPaths || [];
      
      // Notify each unlocked session
      unlockedSessions.forEach(unlockedSessionId => {
        io.to(unlockedSessionId).emit('system_message', {
          type: 'paths_unlocked',
          paths: unlockedPaths,
          message: `[SYSTEM] New pathways have been unlocked.`
        });
      });
      
      delete session.meta.recentlyUnlockedSessions;
      delete session.meta.recentlyUnlockedPaths;
    }
    
    // Ambiguous system message
    io.to(req.params.id).emit('system_message', {
      type: 'file_deleted',
      path,
      message: `[SYSTEM] File ${path} has been deleted.`
    });
    
    broadcastToAdmins(req.params.id, 'terminal_output', {
      type: 'system',
      content: `[SYSTEM] File ${path} has been deleted.\n`
    });
    
    setTimeout(() => {
      io.to(req.params.id).emit('output', {
        type: 'prompt',
        content: `${session.currentPath} $ `
      });
      broadcastToAdmins(req.params.id, 'terminal_output', {
        type: 'prompt',
        content: `${session.currentPath} $ `
      });
    }, 100);
    
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/session/:id/rename', requireAdmin, (req, res) => {
  const { path, newName } = req.body;
  const session = sessionManager.getSession(req.params.id);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  try {
    const newPath = VFSEngine.rename(session, path, newName);
    sessionManager.persistSession(req.params.id);
    
    // Ambiguous system message
    io.to(req.params.id).emit('system_message', {
      type: 'file_renamed',
      path,
      newPath,
      message: `[SYSTEM] File ${path} has been renamed to ${newName}.`
    });
    
    broadcastToAdmins(req.params.id, 'terminal_output', {
      type: 'system',
      content: `[SYSTEM] File ${path} has been renamed to ${newName}.\n`
    });
    
    setTimeout(() => {
      io.to(req.params.id).emit('output', {
        type: 'prompt',
        content: `${session.currentPath} $ `
      });
      broadcastToAdmins(req.params.id, 'terminal_output', {
        type: 'prompt',
        content: `${session.currentPath} $ `
      });
    }, 100);
    
    res.json({ success: true, newPath });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/session/:id/move', requireAdmin, (req, res) => {
  const { sourcePath, targetPath } = req.body;
  const session = sessionManager.getSession(req.params.id);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  try {
    const newPath = VFSEngine.move(session, sourcePath, targetPath);
    sessionManager.persistSession(req.params.id);
    
    // Ambiguous system message
    io.to(req.params.id).emit('system_message', {
      type: 'file_moved',
      sourcePath,
      targetPath,
      newPath,
      message: `[SYSTEM] File ${sourcePath} has been moved to ${targetPath}.`
    });
    
    broadcastToAdmins(req.params.id, 'terminal_output', {
      type: 'system',
      content: `[SYSTEM] File ${sourcePath} has been moved to ${targetPath}.\n`
    });
    
    setTimeout(() => {
      io.to(req.params.id).emit('output', {
        type: 'prompt',
        content: `${session.currentPath} $ `
      });
      broadcastToAdmins(req.params.id, 'terminal_output', {
        type: 'prompt',
        content: `${session.currentPath} $ `
      });
    }, 100);
    
    res.json({ success: true, newPath });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Round control endpoints
app.post('/api/admin/round/start', requireAdmin, (req, res) => {
  const count = sessionManager.startRound();
  
  // Notify all sessions
  const sessions = sessionManager.getAllSessions();
  sessions.forEach(session => {
    const sessionObj = sessionManager.getSession(session.id);
    if (sessionObj) {
      io.to(session.id).emit('round_started', {
        message: '[SYSTEM] System bypass complete. Access granted.'
      });
      
      io.to(session.id).emit('output', {
        type: 'system',
        content: '\n[SYSTEM] System bypass complete. Access granted.\n'
      });
      
      setTimeout(() => {
        io.to(session.id).emit('output', {
          type: 'prompt',
          content: `${sessionObj.currentPath} $ `
        });
      }, 100);
    }
  });
  
  res.json({ success: true, count });
});

app.post('/api/admin/round/end', requireAdmin, (req, res) => {
  const count = sessionManager.endRound();
  
  // Notify all sessions
  const sessions = sessionManager.getAllSessions();
  sessions.forEach(session => {
    const sessionObj = sessionManager.getSession(session.id);
    if (sessionObj) {
      io.to(session.id).emit('round_ended', {
        message: '[SYSTEM] Round ended. Returning to waiting room.'
      });
      
      io.to(session.id).emit('output', {
        type: 'system',
        content: '\n[SYSTEM] Round ended. Returning to waiting room.\n'
      });
    }
  });
  
  res.json({ success: true, count });
});

app.get('/api/admin/round/status', requireAdmin, (req, res) => {
  const sessions = sessionManager.getAllSessions();
  const waitingCount = sessions.filter(s => s.waitingRoom).length;
  const startedCount = sessions.filter(s => s.roundStarted).length;
  const globalRoundStarted = sessionManager.getGlobalRoundStatus();
  
  res.json({
    total: sessions.length,
    waiting: waitingCount,
    started: startedCount,
    allStarted: waitingCount === 0 && sessions.length > 0,
    globalRoundStarted
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
    socket.on('join_session', async ({ sessionId }) => {
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return;
    }
    
    // Check global round status and sync session
    if (sessionManager.getGlobalRoundStatus()) {
      session.waitingRoom = false;
      session.roundStarted = true;
      sessionManager.persistSession(sessionId);
      socket.emit('round_started', { message: '[SYSTEM] Round is active.' });
    }
    
    socket.join(sessionId);
    socket.sessionId = sessionId;
    socket.session = session;
    
    // Handle typing updates from players
    socket.on('typing_update', ({ sessionId: updateSessionId, typing, isCommand }) => {
      if (updateSessionId === sessionId) {
        // Broadcast to admin viewers
        broadcastToAdmins(sessionId, 'terminal_typing', {
          typing: isCommand ? '' : typing, // Clear typing when command is submitted
          sessionId: sessionId
        });
      }
    });
    
    // Send welcome message
    socket.emit('output', {
      type: 'system',
      content: `\n[SYSTEM] Connected to session ${sessionId.substring(0, 8)}...\n`
    });
      // Broadcast to admins
      broadcastToAdmins(sessionId, 'terminal_output', {
        type: 'system',
        content: `\n[SYSTEM] Connected to session ${sessionId.substring(0, 8)}...\n`
      });
    
    // Send current directory prompt
    setTimeout(() => {
      socket.emit('output', {
        type: 'prompt',
        content: `${session.currentPath} $ `
      });
      // Broadcast to admins
      broadcastToAdmins(sessionId, 'terminal_output', {
        type: 'prompt',
        content: `${session.currentPath} $ `
      });
    }, 100);
  });
  
  socket.on('command', async ({ command }) => {
    if (!socket.session) {
      socket.emit('error', { message: 'Not connected to a session' });
      return;
    }
    
    const session = socket.session;
    
    if (session.frozen) {
      socket.emit('output', {
        type: 'error',
        content: '[SYSTEM] Terminal is frozen by administrator.\n'
      });
      // Broadcast to admins
      broadcastToAdmins(session.id, 'terminal_output', {
        type: 'error',
        content: '[SYSTEM] Terminal is frozen by administrator.\n'
      });
      return;
    }
    
    // Broadcast command to admins FIRST (before output)
    broadcastToAdmins(session.id, 'terminal_command', {
      command,
      timestamp: new Date().toISOString()
    });
    
    // Parse and execute command
    const parsed = CommandParser.parse(command);
    const result = await CommandParser.execute(session, parsed);
    
    // Check if paths were unlocked (for rm/delete commands)
    if (parsed && (parsed.command === 'rm' || parsed.command === 'delete') && session.meta?.recentlyUnlockedSessions) {
      const unlockedSessions = session.meta.recentlyUnlockedSessions;
      const unlockedPaths = session.meta.recentlyUnlockedPaths || [];
      
      // Notify each unlocked session
      unlockedSessions.forEach(unlockedSessionId => {
        io.to(unlockedSessionId).emit('system_message', {
          type: 'paths_unlocked',
          paths: unlockedPaths,
          message: `[SYSTEM] New pathways have been unlocked.`
        });
        
        io.to(unlockedSessionId).emit('output', {
          type: 'system',
          content: `[SYSTEM] New pathways have been unlocked.\n`
        });
        
        broadcastToAdmins(unlockedSessionId, 'terminal_output', {
          type: 'system',
          content: `[SYSTEM] New pathways have been unlocked for session ${unlockedSessionId.substring(0, 8)}...\n`
        });
      });
      
      // Clear the meta
      delete session.meta.recentlyUnlockedSessions;
      delete session.meta.recentlyUnlockedPaths;
    }
    
    // Log command
    sessionManager.logCommand(session.id, command, result);
    sessionManager.updateActivity(session.id);
    
    // Send output to player
    if (result.clear) {
      socket.emit('clear');
      // Also broadcast to admins
      broadcastToAdmins(session.id, 'terminal_output', {
        type: 'clear'
      });
    } else {
      socket.emit('output', {
        type: result.error ? 'error' : 'stdout',
        content: result.output
      });
      // Broadcast to admins
      broadcastToAdmins(session.id, 'terminal_output', {
        type: result.error ? 'error' : 'stdout',
        content: result.output
      });
    }
    
    // Check for AI messages (only on actual sudo hack commands, not just "hack")
    if (parsed && parsed.command === 'sudo' && parsed.args[0] === 'hack') {
      const aiMsg = await aiEngine.trigger(session, 'suspicious_command', { command });
      if (aiMsg) {
        socket.emit('output', {
          type: 'ai',
          content: aiMsg.message + '\n'
        });
        // Broadcast to admins
        broadcastToAdmins(session.id, 'terminal_output', {
          type: 'ai',
          content: aiMsg.message + '\n'
        });
        
        // If trace reached 100%, logout after 5 seconds
        if (aiMsg.shouldLogout) {
          setTimeout(() => {
            socket.emit('output', {
              type: 'system',
              content: '\n[SYSTEM] Connection terminated by security protocol.\n'
            });
            broadcastToAdmins(session.id, 'terminal_output', {
              type: 'system',
              content: '\n[SYSTEM] Connection terminated by security protocol.\n'
            });
            socket.emit('logout', { reason: 'trace_complete' });
            setTimeout(() => {
              socket.disconnect(true);
            }, 1000);
          }, 5000);
        }
      }
    }
    
    // Send prompt
    socket.emit('output', {
      type: 'prompt',
      content: `${session.currentPath} $ `
    });
    // Broadcast prompt to admins
    broadcastToAdmins(session.id, 'terminal_output', {
      type: 'prompt',
      content: `${session.currentPath} $ `
    });
    
    // Notify admin of activity
    io.to('admin').emit('session_activity', {
      sessionId: session.id,
      command,
      timestamp: new Date().toISOString()
    });
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (socket.session) {
      sessionManager.persistSession(socket.session.id);
    }
  });
});

// Helper function to broadcast to admin viewers
function broadcastToAdmins(sessionId, event, data) {
  const adminNamespace = io.of('/admin');
  adminNamespace.to(`session:${sessionId}`).emit(event, { ...data, sessionId });
}

// Admin socket namespace
io.of('/admin').on('connection', (socket) => {
  console.log('Admin connected:', socket.id);
  socket.join('admin');
  
  socket.on('subscribe_session', ({ sessionId }) => {
    console.log('Admin subscribing to session:', sessionId);
    socket.join(`session:${sessionId}`);
  });
  
  socket.on('unsubscribe_session', ({ sessionId }) => {
    console.log('Admin unsubscribing from session:', sessionId);
    socket.leave(`session:${sessionId}`);
  });
});

const PORT = process.env.PORT || 3010;
httpServer.listen(PORT, () => {
  console.log(`🚀 Neon Rain backend server running on port ${PORT}`);
  console.log(`📁 Database: ${db.name}`);
});
