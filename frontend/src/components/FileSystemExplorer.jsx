import { useState, useEffect } from 'react';

export default function FileSystemExplorer({ sessionId, onFileOperation }) {
  const [filesystem, setFilesystem] = useState(null);
  const [expanded, setExpanded] = useState(new Set(['/']));
  const [selectedPath, setSelectedPath] = useState(null);
  const [operation, setOperation] = useState(null); // 'delete', 'rename', 'move'
  const [operationValue, setOperationValue] = useState('');

  useEffect(() => {
    if (sessionId) {
      loadFilesystem();
    }
  }, [sessionId]);

  const loadFilesystem = async () => {
    try {
      const res = await fetch(`/api/admin/session/${sessionId}/filesystem`, {
        credentials: 'include'
      });
      const data = await res.json();
      setFilesystem(data.filesystem);
    } catch (err) {
      console.error('Failed to load filesystem:', err);
    }
  };

  const toggleExpand = (path) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpanded(newExpanded);
  };

  const renderNode = (node, path = '/', name = 'root') => {
    if (!node) return null;

    const isExpanded = expanded.has(path);
    const isSelected = selectedPath === path;
    const isDir = node.type === 'dir';
    const hasChildren = isDir && node.children && Object.keys(node.children).length > 0;

    return (
      <div key={path} className="select-none">
        <div
          className={`flex items-center py-1 px-2 hover:bg-gray-800 cursor-pointer ${
            isSelected ? 'bg-cyan-500/20' : ''
          }`}
          onClick={() => {
            setSelectedPath(path);
            setOperation(null);
            setOperationValue('');
          }}
        >
          {isDir ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(path);
              }}
              className="mr-2 text-yellow-400 w-4"
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          ) : (
            <span className="mr-6 text-gray-500">•</span>
          )}
          <span className={`text-sm ${isDir ? 'text-yellow-400' : 'text-cyan-300'}`}>
            {name}
          </span>
          {isDir && (
            <span className="ml-2 text-xs text-gray-500">
              ({Object.keys(node.children || {}).length})
            </span>
          )}
        </div>
        {isDir && isExpanded && hasChildren && (
          <div className="ml-4">
            {Object.entries(node.children).map(([childName, childNode]) => {
              const childPath = path === '/' ? `/${childName}` : `${path}/${childName}`;
              return renderNode(childNode, childPath, childName);
            })}
          </div>
        )}
      </div>
    );
  };

  const handleDelete = async () => {
    if (!selectedPath || !operationValue) return;
    
    try {
      const res = await fetch(`/api/admin/session/${sessionId}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ path: selectedPath })
      });
      
      if (res.ok) {
        await loadFilesystem();
        setSelectedPath(null);
        setOperation(null);
        setOperationValue('');
        if (onFileOperation) onFileOperation('delete', selectedPath);
      }
    } catch (err) {
      console.error('Failed to delete:', err);
      alert('Failed to delete file');
    }
  };

  const handleRename = async () => {
    if (!selectedPath || !operationValue) return;
    
    try {
      const res = await fetch(`/api/admin/session/${sessionId}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ path: selectedPath, newName: operationValue })
      });
      
      if (res.ok) {
        await loadFilesystem();
        setSelectedPath(null);
        setOperation(null);
        setOperationValue('');
        if (onFileOperation) onFileOperation('rename', selectedPath, operationValue);
      }
    } catch (err) {
      console.error('Failed to rename:', err);
      alert('Failed to rename file');
    }
  };

  const handleMove = async () => {
    if (!selectedPath || !operationValue) return;
    
    try {
      const res = await fetch(`/api/admin/session/${sessionId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sourcePath: selectedPath, targetPath: operationValue })
      });
      
      if (res.ok) {
        await loadFilesystem();
        setSelectedPath(null);
        setOperation(null);
        setOperationValue('');
        if (onFileOperation) onFileOperation('move', selectedPath, operationValue);
      }
    } catch (err) {
      console.error('Failed to move:', err);
      alert('Failed to move file');
    }
  };

  if (!filesystem) {
    return (
      <div className="text-gray-500 text-center py-4">Loading filesystem...</div>
    );
  }

  const selectedNode = selectedPath
    ? (() => {
        const parts = selectedPath.split('/').filter(p => p);
        let current = filesystem.root;
        for (const part of parts) {
          if (current.children && current.children[part]) {
            current = current.children[part];
          } else {
            return null;
          }
        }
        return current;
      })()
    : null;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto bg-gray-900 border border-yellow-500/30 rounded p-2 mb-2">
        {renderNode(filesystem.root)}
      </div>
      
      {selectedPath && (
        <div className="bg-gray-900 border border-yellow-500/30 rounded p-3 mb-2">
          <div className="text-sm text-yellow-400 mb-2">
            Selected: <span className="text-cyan-300">{selectedPath}</span>
          </div>
          {selectedNode && selectedNode.type === 'file' && (
            <div className="text-xs text-gray-400 mb-2 max-h-32 overflow-y-auto">
              <pre className="whitespace-pre-wrap">{selectedNode.contents?.substring(0, 500)}</pre>
            </div>
          )}
          
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => {
                setOperation('delete');
                setOperationValue('');
              }}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-white text-sm"
            >
              Delete
            </button>
            <button
              onClick={() => {
                setOperation('rename');
                const parts = selectedPath.split('/').filter(p => p);
                setOperationValue(parts[parts.length - 1]);
              }}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm"
            >
              Rename
            </button>
            <button
              onClick={() => {
                setOperation('move');
                const parts = selectedPath.split('/').filter(p => p);
                parts.pop();
                setOperationValue(parts.length > 0 ? '/' + parts.join('/') : '/');
              }}
              className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-white text-sm"
            >
              Move
            </button>
          </div>
          
          {operation && (
            <div className="mt-3">
              {operation === 'delete' && (
                <div>
                  <div className="text-sm text-yellow-400 mb-2">
                    Confirm deletion of: {selectedPath}
                  </div>
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white"
                  >
                    Confirm Delete
                  </button>
                  <button
                    onClick={() => {
                      setOperation(null);
                      setOperationValue('');
                    }}
                    className="ml-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded text-white"
                  >
                    Cancel
                  </button>
                </div>
              )}
              
              {operation === 'rename' && (
                <div>
                  <input
                    type="text"
                    value={operationValue}
                    onChange={(e) => setOperationValue(e.target.value)}
                    placeholder="New name"
                    className="w-full bg-black border border-yellow-500/50 rounded px-3 py-2 text-yellow-300 text-sm mb-2"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleRename}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => {
                        setOperation(null);
                        setOperationValue('');
                      }}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded text-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              
              {operation === 'move' && (
                <div>
                  <input
                    type="text"
                    value={operationValue}
                    onChange={(e) => setOperationValue(e.target.value)}
                    placeholder="Target directory path"
                    className="w-full bg-black border border-yellow-500/50 rounded px-3 py-2 text-yellow-300 text-sm mb-2"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleMove}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-white"
                    >
                      Move
                    </button>
                    <button
                      onClick={() => {
                        setOperation(null);
                        setOperationValue('');
                      }}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded text-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

