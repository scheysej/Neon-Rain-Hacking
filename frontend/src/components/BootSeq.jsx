import { useEffect, useState } from 'react';

export default function BootSeq({ onComplete }) {
  const [lines, setLines] = useState([]);
  const [currentLine, setCurrentLine] = useState(0);

  const bootMessages = [
    '[SYSTEM] Initializing neural interface...',
    '[SYSTEM] Loading virtual filesystem...',
    '[SYSTEM] Establishing secure connection...',
    '[SYSTEM] Authenticating user credentials...',
    '[SYSTEM] Mounting encrypted partitions...',
    '[SYSTEM] Loading terminal environment...',
    '[SYSTEM] Connection established.',
    '',
    'Welcome to NEON RAIN',
    'Type "help" for available commands.',
    ''
  ];

  useEffect(() => {
    if (currentLine < bootMessages.length) {
      const timer = setTimeout(() => {
        setLines(prev => [...prev, bootMessages[currentLine]]);
        setCurrentLine(prev => prev + 1);
      }, 300);

      return () => clearTimeout(timer);
    } else {
      setTimeout(() => onComplete(), 500);
    }
  }, [currentLine, onComplete]);

  return (
    <div className="w-full h-full bg-black text-cyan-400 font-mono p-4 overflow-auto">
      {lines.map((line, i) => (
        <div key={i} className="mb-1">
          {line}
        </div>
      ))}
      {currentLine < bootMessages.length && (
        <span className="animate-pulse">_</span>
      )}
    </div>
  );
}
