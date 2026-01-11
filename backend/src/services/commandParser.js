/**
 * Command Parser
 * Parses and executes terminal commands
 */

import { VFSEngine } from './vfsEngine.js';
import puzzleEngine from './puzzleEngine.js';
import aiEngine from './aiEngine.js';

export class CommandParser {
  /**
   * Parse command string into tokens
   */
  static parse(cmd) {
    const trimmed = cmd.trim();
    if (!trimmed) return null;
    
    const parts = trimmed.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    // Parse options (--key value)
    const options = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith('--')) {
        const key = args[i].substring(2);
        const value = args[i + 1];
        if (value && !value.startsWith('--')) {
          options[key] = value;
          args.splice(i, 2);
          i--;
        } else {
          options[key] = true;
          args.splice(i, 1);
          i--;
        }
      }
    }
    
    return { command, args, options, raw: trimmed };
  }

  /**
   * Execute command
   */
  static async execute(session, parsed) {
    if (!parsed) return { output: '', error: null };
    
    const { command, args, options } = parsed;
    
    try {
      switch (command) {
        case 'help':
          return this.help();
        
        case 'ls':
          return this.ls(session, args[0]);
        
        case 'cd':
          return this.cd(session, args[0]);
        
        case 'pwd':
          return this.pwd(session);
        
        case 'cat':
        case 'open':
          return await this.cat(session, args[0]);
        
        case 'search':
          return this.search(session, args[0]);
        
        case 'decrypt':
          return await this.decrypt(session, args[0], options.key);
        
        case 'scan':
          return this.scan(session);
        
        case 'sudo':
          if (args[0] === 'hack') {
            return await this.hack(session, args[1]);
          }
          return { output: 'Usage: sudo hack <target>', error: null };
        
        case 'history':
          return this.history(session, args[0] ? parseInt(args[0]) : 20);
        
        case 'rm':
        case 'delete':
          return await this.rm(session, args[0]);
        
        case 'clear':
          return { output: '\x1b[2J\x1b[H', error: null, clear: true };
        
        default:
          return { output: `Command not found: ${command}. Type 'help' for available commands.`, error: null };
      }
    } catch (error) {
      return { output: `Error: ${error.message}`, error: error.message };
    }
  }

  static help() {
    const output = `Available commands:

help              Show this help message
ls [path]         List directory contents
cd [path]         Change directory
pwd               Print working directory
cat <file>        Display file contents
open <file>       Alias for cat
search <pattern>  Search files and contents
decrypt <file> --key <key>  Decrypt encrypted file
scan              Scan system information
sudo hack <target>  Attempt to hack (triggers AI)
history [n]       Show command history
rm <file>         Delete a file
delete <file>     Alias for rm
clear             Clear terminal`;
    return { output, error: null };
  }

  static ls(session, path) {
    const listing = VFSEngine.list(session, path);
    if (listing.length === 0) {
      return { output: '(empty)', error: null };
    }
    const formatted = listing.map(item => {
      return `${item.name}${item.type === 'dir' ? '/' : ''}`;
    }).join('\n');
    return { output: formatted, error: null };
  }

  static cd(session, path) {
    if (!path) {
      session.currentPath = '/';
      return { output: '/', error: null };
    }
    const newPath = VFSEngine.changeDirectory(session, path);
    return { output: newPath, error: null };
  }

  static pwd(session) {
    return { output: session.currentPath, error: null };
  }

  static async cat(session, path) {
    if (!path) {
      return { output: 'Usage: cat <file>', error: null };
    }
    const file = VFSEngine.readFile(session, path);
    
    // Check for puzzle triggers (async, but don't wait for effects)
    puzzleEngine.checkTrigger(session, 'open', path).catch(err => {
      console.error('Puzzle trigger error:', err);
    });
    
    return { output: file.contents, error: null };
  }

  static search(session, pattern) {
    if (!pattern) {
      return { output: 'Usage: search <pattern>', error: null };
    }
    const results = VFSEngine.search(session, pattern);
    if (results.length === 0) {
      return { output: 'No matches found.', error: null };
    }
    const formatted = results.map(r => `  ${r.path} (${r.match})`).join('\n');
    return { output: `Found ${results.length} match(es):\n${formatted}`, error: null };
  }

  static async decrypt(session, path, key) {
    if (!path || !key) {
      return { output: 'Usage: decrypt <file> --key <key>', error: null };
    }
    
    const decrypted = VFSEngine.decrypt(session, path, key);
    
    // Check puzzle validation
    await puzzleEngine.checkDecrypt(session, path, key);
    
    return { output: `File decrypted successfully.\n\n${decrypted}`, error: null };
  }

  static scan(session) {
    const info = [
      '=== SYSTEM SCAN ===',
      `Session: ${session.id.substring(0, 8)}...`,
      `Current Path: ${session.currentPath}`,
      `AI Status: ${session.aiState.status} (Level: ${session.aiState.level})`,
      `Filesystem: ${Object.keys(session.fs.root.children || {}).length} top-level entries`
    ];
    return { output: info.join('\n'), error: null };
  }

  static async hack(session, target) {
    if (!target) {
      return { output: 'Usage: sudo hack <target>', error: null };
    }
    
    // Trigger AI response
    await aiEngine.trigger(session, 'suspicious_command', { command: 'hack', target });
    
    return { 
      output: `Attempting to hack ${target}...\n[WARNING] Security systems alerted!`, 
      error: null 
    };
  }

  static history(session, limit) {
    const history = session.commandHistory.slice(-limit);
    if (history.length === 0) {
      return { output: 'No command history.', error: null };
    }
    return { 
      output: history.map((h, i) => `${i + 1}. ${h.command}`).join('\n'), 
      error: null 
    };
  }

  static async rm(session, path) {
    if (!path) {
      return { output: 'Usage: rm <file>', error: null };
    }
    
    const deleted = await VFSEngine.delete(session, path);
    return { output: `Deleted: ${deleted}`, error: null };
  }
}
