import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BootSeq from '../components/BootSeq';
import TerminalUI from '../components/TerminalUI';
import io from 'socket.io-client';

export default function Terminal({ user, setUser }) {
  const [sessionId, setSessionId] = useState(null);
  const [bootComplete, setBootComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [waitingRoom, setWaitingRoom] = useState(true);
  const [roundStarted, setRoundStarted] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Create or get session
    fetch('/api/session/create', {
      method: 'POST',
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        setSessionId(data.sessionId);
        
        // Check if round is already started (for page refresh)
        if (data.roundStarted) {
          setWaitingRoom(false);
          setRoundStarted(true);
        } else {
          setWaitingRoom(true);
          setRoundStarted(false);
        }
        
        setLoading(false);
        
        // Connect to socket to listen for round start/end
        const sock = io('http://localhost:3010', {
          transports: ['websocket']
        });
        
        sock.on('connect', () => {
          sock.emit('join_session', { sessionId: data.sessionId });
        });
        
        sock.on('round_started', (data) => {
          setWaitingRoom(false);
          setRoundStarted(true);
        });
        
        sock.on('round_ended', (data) => {
          setWaitingRoom(true);
          setRoundStarted(false);
        });
      })
      .catch(err => {
        console.error('Failed to create session:', err);
        navigate('/login');
      });
  }, [navigate]);

  if (loading || !sessionId) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-cyan-400 font-mono">
        Initializing session...
      </div>
    );
  }

  if (waitingRoom && !roundStarted) {
    return (
      <div className="w-screen h-screen bg-black flex items-center justify-center">
        <div className="text-center border-2 border-yellow-500 p-12 rounded-lg bg-black/50">
          <div className="text-6xl font-bold text-yellow-500 mb-6 font-mono tracking-wider">
            IMMORTECH
          </div>
          <div className="text-3xl text-yellow-400 mb-8 font-mono">
            Waiting for system bypass...
          </div>
          <div className="text-yellow-600 text-lg font-mono animate-pulse">
            Please stand by...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-black overflow-hidden">
      {!bootComplete ? (
        <BootSeq onComplete={() => setBootComplete(true)} />
      ) : (
        <TerminalUI sessionId={sessionId} user={user} setUser={setUser} />
      )}
    </div>
  );
}
