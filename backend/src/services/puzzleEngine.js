/**
 * Puzzle Engine
 * Manages puzzle triggers, validation, and effects
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { VFSEngine } from './vfsEngine.js';
import db from '../db/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const puzzlesDir = path.join(__dirname, '../../../content/puzzles');
let puzzles = [];

// Load puzzles from JSON files
function loadPuzzles() {
  puzzles = [];
  if (!fs.existsSync(puzzlesDir)) {
    fs.mkdirSync(puzzlesDir, { recursive: true });
    return;
  }
  
  const files = fs.readdirSync(puzzlesDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const puzzle = JSON.parse(fs.readFileSync(path.join(puzzlesDir, file), 'utf-8'));
      puzzles.push(puzzle);
    } catch (err) {
      console.warn(`Failed to load puzzle ${file}:`, err.message);
    }
  }
}

// Load puzzles on startup
loadPuzzles();

class PuzzleEngine {
  /**
   * Check if a trigger condition is met
   */
  async checkTrigger(session, type, path) {
    for (const puzzle of puzzles) {
      if (session.puzzleState[puzzle.id]?.solved) continue;
      
      const triggers = puzzle.triggers || [];
      for (const trigger of triggers) {
        if (trigger.type === type && trigger.path === path) {
          await this.handleTrigger(session, puzzle);
        }
      }
    }
  }

  /**
   * Check decrypt attempt
   */
  async checkDecrypt(session, filePath, key) {
    for (const puzzle of puzzles) {
      if (puzzle.solved) continue;
      
      const triggers = puzzle.triggers || [];
      for (const trigger of triggers) {
        if (trigger.type === 'decrypt' && trigger.path === filePath) {
          const isValid = this.validateSolution(session, puzzle, { key, filePath });
          
          if (isValid) {
            await this.onSuccess(session, puzzle);
          } else {
            await this.onFailure(session, puzzle);
          }
        }
      }
    }
  }

  /**
   * Handle trigger event
   */
  async handleTrigger(session, puzzle) {
    // Some puzzles just trigger on open, no validation needed
    if (puzzle.autoSolve) {
      await this.onSuccess(session, puzzle);
    }
  }

  /**
   * Validate puzzle solution
   */
  validateSolution(session, puzzle, context) {
    if (!puzzle.validate) return true;
    
    // Simple string matching
    if (typeof puzzle.validate === 'string') {
      if (puzzle.validate.startsWith('key:')) {
        const expectedKey = puzzle.validate.substring(4).trim();
        return String(context.key) === expectedKey;
      }
      if (puzzle.validate.startsWith('file_contains:')) {
        const expectedText = puzzle.validate.substring(14).trim();
        try {
          const file = VFSEngine.readFile(session, context.filePath);
          return file.contents.includes(expectedText);
        } catch {
          return false;
        }
      }
    }
    
    // Function-based validation (simple sandbox)
    if (typeof puzzle.validate === 'object' && puzzle.validate.type === 'function') {
      try {
        // For security, only allow simple checks
        const func = new Function('session', 'context', puzzle.validate.code);
        return func(session, context);
      } catch (err) {
        console.error('Puzzle validation error:', err);
        return false;
      }
    }
    
    return false;
  }

  /**
   * Execute success effects
   */
  async onSuccess(session, puzzle) {
    if (!session.puzzleState) {
      session.puzzleState = {};
    }
    session.puzzleState[puzzle.id] = { solved: true, timestamp: new Date() };
    
    // Log event
    db.prepare(`
      INSERT INTO puzzle_events (session_id, puzzle_id, event_type, details)
      VALUES (?, ?, ?, ?)
    `).run(session.id, puzzle.id, 'solved', JSON.stringify({}));
    
    // Execute effects
    const effects = puzzle.onSuccess || [];
    for (const effect of effects) {
      await this.executeEffect(session, effect);
    }
  }

  /**
   * Execute failure effects
   */
  async onFailure(session, puzzle) {
    // Log event
    db.prepare(`
      INSERT INTO puzzle_events (session_id, puzzle_id, event_type, details)
      VALUES (?, ?, ?, ?)
    `).run(session.id, puzzle.id, 'failed', JSON.stringify({}));
    
    // Execute effects
    const effects = puzzle.onFail || [];
    for (const effect of effects) {
      await this.executeEffect(session, effect);
    }
  }

  /**
   * Execute an effect
   */
  async executeEffect(session, effect) {
    switch (effect.action) {
      case 'addFile':
        VFSEngine.addFile(session, effect.target, effect.contents, effect.meta || {});
        break;
      
      case 'decrypt':
        const node = VFSEngine.getNode(session.fs, effect.target);
        if (node && node.meta?.encrypted) {
          node.meta.encrypted = false;
          node.meta.decrypted = true;
        }
        break;
      
      case 'unlock':
        VFSEngine.setLock(session, effect.target, false);
        break;
      
      case 'lock':
        VFSEngine.setLock(session, effect.target, true);
        break;
      
      case 'raiseAlert':
        if (!session.aiState) {
          session.aiState = { level: 0, status: 'idle' };
        }
        session.aiState.level = Math.min(session.aiState.level + (effect.level || 1), 10);
        if (session.aiState.status === 'idle') {
          session.aiState.status = 'probing';
        }
        break;
    }
  }

  /**
   * Get all puzzles
   */
  getPuzzles() {
    return puzzles;
  }

  /**
   * Reload puzzles
   */
  reload() {
    loadPuzzles();
  }
}

export default new PuzzleEngine();
