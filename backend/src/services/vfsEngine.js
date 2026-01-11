/**
 * Virtual Filesystem Engine
 * Handles all filesystem operations for player sessions
 */

export class VFSEngine {
  /**
   * Resolve a path relative to current working directory
   */
  static resolvePath(fs, currentPath, targetPath) {
    if (!targetPath) return currentPath || '/';
    
    // Ensure currentPath is a string
    if (typeof currentPath !== 'string') {
      currentPath = '/';
    }
    
    // Handle absolute paths
    if (targetPath.startsWith('/')) {
      return targetPath;
    }
    
    // Handle relative paths
    const parts = currentPath.split('/').filter(p => p);
    const targetParts = targetPath.split('/').filter(p => p);
    
    for (const part of targetParts) {
      if (part === '.') continue;
      if (part === '..') {
        if (parts.length > 0) parts.pop();
      } else {
        parts.push(part);
      }
    }
    
    return '/' + parts.join('/');
  }

  /**
   * Get node at path
   */
  static getNode(fs, path) {
    if (path === '/') return fs.root;
    
    const parts = path.split('/').filter(p => p);
    let current = fs.root;
    
    for (const part of parts) {
      if (!current.children || !current.children[part]) {
        return null;
      }
      current = current.children[part];
    }
    
    return current;
  }

  /**
   * Check if path is accessible (unlocked)
   */
  static isPathUnlocked(session, path) {
    if (!session.unlockedPaths) {
      return true; // If no tracking, allow all
    }
    
    // Check if this path or any parent is unlocked
    const parts = path.split('/').filter(p => p);
    for (let i = 1; i <= parts.length; i++) {
      const checkPath = '/' + parts.slice(0, i).join('/');
      if (session.unlockedPaths.has(checkPath)) {
        return true;
      }
    }
    
    // Also check if path starts with any unlocked path
    for (const unlocked of session.unlockedPaths) {
      if (path.startsWith(unlocked)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * List directory contents
   */
  static list(session, path) {
    const resolvedPath = this.resolvePath(session.fs, session.currentPath, path);
    const node = this.getNode(session.fs, resolvedPath);
    
    if (!node) {
      throw new Error(`No such file or directory: ${path}`);
    }
    
    if (node.type !== 'dir') {
      throw new Error(`Not a directory: ${path}`);
    }
    
    // Check if directory is locked
    if (node.meta?.locked) {
      throw new Error(`Permission denied: ${path} is locked`);
    }
    
    // Check if path is unlocked
    if (!this.isPathUnlocked(session, resolvedPath)) {
      throw new Error(`Permission denied: ${path} is locked`);
    }
    
    const children = node.children || {};
    const unlockedPaths = session.unlockedPaths || new Set();
    
    // Filter children based on unlocked paths
    return Object.keys(children)
      .filter(name => {
        const childPath = resolvedPath === '/' ? `/${name}` : `${resolvedPath}/${name}`;
        // Always show if it's in an unlocked path or if parent is unlocked
        return this.isPathUnlocked(session, childPath);
      })
      .map(name => {
        const child = children[name];
        return {
          name,
          type: child.type,
          size: child.type === 'file' ? (child.contents?.length || 0) : '-',
          meta: child.meta || {}
        };
      });
  }

  /**
   * Read file contents
   */
  static readFile(session, path) {
    const resolvedPath = this.resolvePath(session.fs, session.currentPath, path);
    const node = this.getNode(session.fs, resolvedPath);
    
    if (!node) {
      throw new Error(`No such file: ${path}`);
    }
    
    if (node.type !== 'file') {
      throw new Error(`Not a file: ${path}`);
    }
    
    // Check if file is locked
    if (node.meta?.locked) {
      throw new Error(`Permission denied: ${path} is locked`);
    }
    
    // Check if path is unlocked
    if (!this.isPathUnlocked(session, resolvedPath)) {
      throw new Error(`Permission denied: ${path} is locked`);
    }
    
    return {
      contents: node.contents || '',
      meta: node.meta || {}
    };
  }

  /**
   * Change directory
   */
  static changeDirectory(session, path) {
    const resolvedPath = this.resolvePath(session.fs, session.currentPath, path);
    const node = this.getNode(session.fs, resolvedPath);
    
    if (!node) {
      throw new Error(`No such directory: ${path}`);
    }
    
    if (node.type !== 'dir') {
      throw new Error(`Not a directory: ${path}`);
    }
    
    if (node.meta?.locked) {
      throw new Error(`Permission denied: ${path} is locked`);
    }
    
    // Check if path is unlocked
    if (!this.isPathUnlocked(session, resolvedPath)) {
      throw new Error(`Permission denied: ${path} is locked`);
    }
    
    session.currentPath = resolvedPath;
    return resolvedPath;
  }

  /**
   * Search files and contents
   */
  static search(session, pattern) {
    const results = [];
    const searchRegex = new RegExp(pattern, 'i');
    
    const searchNode = (node, path) => {
      if (node.type === 'file') {
        const contents = node.contents || '';
        if (searchRegex.test(path) || searchRegex.test(contents)) {
          results.push({ path, type: 'file', match: searchRegex.test(path) ? 'filename' : 'content' });
        }
      } else if (node.type === 'dir' && node.children) {
        Object.keys(node.children).forEach(name => {
          searchNode(node.children[name], path === '/' ? `/${name}` : `${path}/${name}`);
        });
      }
    };
    
    searchNode(session.fs.root, '/');
    return results;
  }

  /**
   * Decrypt file (simple XOR for demo)
   */
  static decrypt(session, path, key) {
    const resolvedPath = this.resolvePath(session.fs, session.currentPath, path);
    const node = this.getNode(session.fs, resolvedPath);
    
    if (!node || node.type !== 'file') {
      throw new Error(`No such file: ${path}`);
    }
    
    if (!node.meta?.encrypted) {
      throw new Error(`File is not encrypted: ${path}`);
    }
    
    const encrypted = node.contents;
    if (encrypted.startsWith('ENCRYPTED:XOR:')) {
      const hexData = encrypted.replace('ENCRYPTED:XOR:', '');
      const keyNum = parseInt(key, 10);
      
      if (isNaN(keyNum)) {
        throw new Error('Invalid key format');
      }
      
      // Simple XOR decryption
      // First, try to decode hex string
      let bytes;
      try {
        bytes = hexData.match(/.{2}/g)?.map(hex => parseInt(hex, 16)) || [];
      } catch {
        // If hex decoding fails, treat as plain text and encrypt/decrypt directly
        bytes = Array.from(encrypted.replace('ENCRYPTED:XOR:', '')).map(c => c.charCodeAt(0));
      }
      
      const decrypted = bytes.map(byte => String.fromCharCode(byte ^ keyNum)).join('');
      
      // Update file contents
      node.contents = decrypted;
      node.meta.encrypted = false;
      node.meta.decrypted = true;
      
      return decrypted;
    }
    
    throw new Error('Unsupported encryption format');
  }

  /**
   * Add file (admin action)
   */
  static addFile(session, path, contents, meta = {}) {
    const resolvedPath = this.resolvePath(session.fs, session.currentPath, path);
    const parts = resolvedPath.split('/').filter(p => p);
    const filename = parts.pop();
    const dirPath = '/' + parts.join('/');
    
    const dirNode = this.getNode(session.fs, dirPath || '/');
    if (!dirNode || dirNode.type !== 'dir') {
      throw new Error(`Invalid directory: ${dirPath}`);
    }
    
    if (!dirNode.children) {
      dirNode.children = {};
    }
    
    dirNode.children[filename] = {
      type: 'file',
      contents,
      meta
    };
    
    return resolvedPath;
  }

  /**
   * Lock/unlock path
   */
  static setLock(session, path, locked) {
    const resolvedPath = this.resolvePath(session.fs, session.currentPath, path);
    const node = this.getNode(session.fs, resolvedPath);
    
    if (!node) {
      throw new Error(`No such file or directory: ${path}`);
    }
    
    if (!node.meta) {
      node.meta = {};
    }
    
    node.meta.locked = locked;
    return { path: resolvedPath, locked };
  }

  /**
   * Delete file or directory
   */
  static async delete(session, path) {
    const resolvedPath = this.resolvePath(session.fs, session.currentPath, path);
    const parts = resolvedPath.split('/').filter(p => p);
    const name = parts.pop();
    const parentPath = '/' + parts.join('/');
    
    const parentNode = this.getNode(session.fs, parentPath || '/');
    if (!parentNode || parentNode.type !== 'dir') {
      throw new Error(`Invalid parent directory: ${parentPath}`);
    }
    
    if (!parentNode.children || !parentNode.children[name]) {
      throw new Error(`No such file or directory: ${path}`);
    }
    
    const nodeToDelete = parentNode.children[name];
    
    // Check if this is a security file that unlocks paths for other players
    if (nodeToDelete.meta?.securityFile && nodeToDelete.meta?.unlocksPaths) {
      const unlocksPaths = nodeToDelete.meta.unlocksPaths;
      const targetUserGroups = nodeToDelete.meta.targetUsers || [];
      
      // Import sessionManager dynamically to avoid circular dependency
      const { default: sessionManager } = await import('./sessionManager.js');
      
      // Store unlocked session IDs for notification
      const unlockedSessionIds = [];
      
      // Unlock paths for target user groups (0-3, representing access points 1-4)
      const allSessions = sessionManager.getAllSessions();
      allSessions.forEach(s => {
        const targetSession = sessionManager.getSession(s.id);
        if (targetSession) {
          const userGroup = targetSession.userId % 4;
          // Unlock for target users (but not the one who deleted it)
          if (targetUserGroups.includes(userGroup) && targetSession.id !== session.id) {
            unlocksPaths.forEach(unlockPath => {
              if (!targetSession.unlockedPaths) {
                targetSession.unlockedPaths = new Set();
              }
              targetSession.unlockedPaths.add(unlockPath);
              // Also unlock all parent paths
              const parts = unlockPath.split('/').filter(p => p);
              for (let i = 1; i <= parts.length; i++) {
                const parentPath = '/' + parts.slice(0, i).join('/');
                targetSession.unlockedPaths.add(parentPath);
              }
            });
            sessionManager.persistSession(s.id);
            unlockedSessionIds.push(s.id);
          }
        }
      });
      
      // Store unlocked session IDs in the session for server to notify
      if (!session.meta) {
        session.meta = {};
      }
      session.meta.recentlyUnlockedSessions = unlockedSessionIds;
      session.meta.recentlyUnlockedPaths = unlocksPaths;
    }
    
    delete parentNode.children[name];
    return resolvedPath;
  }

  /**
   * Rename file or directory
   */
  static rename(session, path, newName) {
    const resolvedPath = this.resolvePath(session.fs, session.currentPath, path);
    const parts = resolvedPath.split('/').filter(p => p);
    const oldName = parts.pop();
    const parentPath = '/' + parts.join('/');
    
    const parentNode = this.getNode(session.fs, parentPath || '/');
    if (!parentNode || parentNode.type !== 'dir') {
      throw new Error(`Invalid parent directory: ${parentPath}`);
    }
    
    if (!parentNode.children || !parentNode.children[oldName]) {
      throw new Error(`No such file or directory: ${path}`);
    }
    
    if (parentNode.children[newName]) {
      throw new Error(`File or directory already exists: ${newName}`);
    }
    
    parentNode.children[newName] = parentNode.children[oldName];
    delete parentNode.children[oldName];
    
    return parentPath === '/' ? `/${newName}` : `${parentPath}/${newName}`;
  }

  /**
   * Move file or directory
   */
  static move(session, sourcePath, targetPath) {
    const resolvedSource = this.resolvePath(session.fs, session.currentPath, sourcePath);
    const resolvedTarget = this.resolvePath(session.fs, session.currentPath, targetPath);
    
    // Get source node
    const sourceNode = this.getNode(session.fs, resolvedSource);
    if (!sourceNode) {
      throw new Error(`No such file or directory: ${sourcePath}`);
    }
    
    // Get target directory
    const targetNode = this.getNode(session.fs, resolvedTarget);
    if (!targetNode || targetNode.type !== 'dir') {
      throw new Error(`Target is not a directory: ${targetPath}`);
    }
    
    // Extract source name
    const sourceParts = resolvedSource.split('/').filter(p => p);
    const sourceName = sourceParts.pop();
    
    // Check if target already has a file/dir with same name
    if (targetNode.children && targetNode.children[sourceName]) {
      throw new Error(`File or directory already exists in target: ${sourceName}`);
    }
    
    // Remove from source parent
    const sourceParentPath = '/' + sourceParts.join('/');
    const sourceParent = this.getNode(session.fs, sourceParentPath || '/');
    if (!sourceParent || !sourceParent.children) {
      throw new Error(`Invalid source parent: ${sourceParentPath}`);
    }
    
    // Move to target
    if (!targetNode.children) {
      targetNode.children = {};
    }
    targetNode.children[sourceName] = sourceNode;
    delete sourceParent.children[sourceName];
    
    return resolvedTarget === '/' ? `/${sourceName}` : `${resolvedTarget}/${sourceName}`;
  }

  /**
   * Write file (create or update)
   */
  static writeFile(session, path, contents, meta = {}) {
    const resolvedPath = this.resolvePath(session.fs, session.currentPath, path);
    const parts = resolvedPath.split('/').filter(p => p);
    const filename = parts.pop();
    const dirPath = '/' + parts.join('/');
    
    const dirNode = this.getNode(session.fs, dirPath || '/');
    if (!dirNode || dirNode.type !== 'dir') {
      throw new Error(`Invalid directory: ${dirPath}`);
    }
    
    if (!dirNode.children) {
      dirNode.children = {};
    }
    
    dirNode.children[filename] = {
      type: 'file',
      contents,
      meta
    };
    
    return resolvedPath;
  }

  /**
   * Deep clone filesystem
   */
  static cloneFS(fs) {
    return JSON.parse(JSON.stringify(fs));
  }
}
