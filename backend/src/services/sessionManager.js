/**
 * Session Manager
 * Manages player sessions, filesystems, and state
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../db/database.js';
import { VFSEngine } from './vfsEngine.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load campaign seed
const seedPath = path.join(__dirname, '../../../content/filesystems/campaign_seed.json');
let campaignSeed = { root: { type: 'dir', children: {} } };

if (fs.existsSync(seedPath)) {
  try {
    campaignSeed = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
  } catch (err) {
    console.warn('Failed to load campaign seed, using empty filesystem');
  }
}

class SessionManager {
  constructor() {
    this.sessions = new Map(); // sessionId -> session object
    this.globalRoundStarted = false; // Global round status
  }

  /**
   * Create a new session for a user
   */
  createSession(userId, username) {
    const sessionId = uuidv4();
    const filesystem = VFSEngine.cloneFS(campaignSeed);
    
    // Assign user to one of 4 access points (based on userId mod 4)
    // userAccessPoint will be 0, 1, 2, or 3 (for access_point_1 through access_point_4)
    const userAccessPoint = (userId % 4);
    const accessPointNum = userAccessPoint + 1; // 1-4 for directory names
    const initialUnlockedPaths = [
      '/',
      '/server_room',
      `/server_room/access_point_${accessPointNum}`
    ];
    
    const session = {
      id: sessionId,
      userId,
      username,
      fs: filesystem,
      currentPath: `/server_room/access_point_${accessPointNum}`,
      commandHistory: [],
      puzzleState: {},
      aiState: { level: 0, status: 'idle', challenge: null },
      frozen: false,
      waitingRoom: true,
      roundStarted: false,
      unlockedPaths: new Set(initialUnlockedPaths),
      createdAt: new Date(),
      lastActivity: new Date()
    };
    
    this.sessions.set(sessionId, session);
    
    // Persist to database
    db.prepare(`
      INSERT INTO sessions (id, user_id, filesystem, current_path)
      VALUES (?, ?, ?, ?)
    `).run(sessionId, userId, JSON.stringify(filesystem), session.currentPath);
    
    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions
   */
  getAllSessions() {
    return Array.from(this.sessions.values()).map(s => ({
      id: s.id,
      username: s.username,
      currentPath: s.currentPath,
      lastActivity: s.lastActivity,
      frozen: s.frozen,
      waitingRoom: s.waitingRoom,
      roundStarted: s.roundStarted
    }));
  }

  /**
   * Start round for all sessions (system bypass)
   */
  startRound() {
    this.globalRoundStarted = true;
    let count = 0;
    this.sessions.forEach(session => {
      session.waitingRoom = false;
      session.roundStarted = true;
      this.persistSession(session.id);
      count++;
    });
    return count;
  }

  /**
   * End round for all sessions
   */
  endRound() {
    this.globalRoundStarted = false;
    let count = 0;
    this.sessions.forEach(session => {
      session.waitingRoom = true;
      session.roundStarted = false;
      this.persistSession(session.id);
      count++;
    });
    return count;
  }

  /**
   * Get global round status
   */
  getGlobalRoundStatus() {
    return this.globalRoundStarted;
  }

  /**
   * Get sessions by user ID
   */
  getSessionsByUser(userId) {
    return Array.from(this.sessions.values())
      .filter(s => s.userId === userId)
      .map(s => ({
        id: s.id,
        username: s.username,
        currentPath: s.currentPath,
        lastActivity: s.lastActivity,
        frozen: s.frozen,
        userId: s.userId
      }));
  }

  /**
   * Update session activity
   */
  updateActivity(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
  }

  /**
   * Log command
   */
  logCommand(sessionId, command, output) {
    db.prepare(`
      INSERT INTO command_logs (session_id, command, output)
      VALUES (?, ?, ?)
    `).run(sessionId, command, JSON.stringify(output));
    
    const session = this.sessions.get(sessionId);
    if (session) {
      session.commandHistory.push({ command, output, timestamp: new Date() });
      if (session.commandHistory.length > 100) {
        session.commandHistory.shift();
      }
    }
  }

  /**
   * Get command logs
   */
  getLogs(sessionId, limit = 50) {
    return db.prepare(`
      SELECT * FROM command_logs
      WHERE session_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(sessionId, limit);
  }

  /**
   * Persist filesystem changes
   */
  persistSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      db.prepare(`
        UPDATE sessions
        SET filesystem = ?, current_path = ?, last_activity = ?
        WHERE id = ?
      `).run(
        JSON.stringify(session.fs),
        session.currentPath,
        session.lastActivity.toISOString(),
        sessionId
      );
    }
  }

  /**
   * Destroy session
   */
  destroySession(sessionId) {
    this.persistSession(sessionId);
    this.sessions.delete(sessionId);
  }
}

export default new SessionManager();
