import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login({ setUser }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Authentication failed');
        setLoading(false);
        return;
      }

      setUser(data.user);
      
      // Navigate based on role
      if (data.user.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/terminal');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center font-mono">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500 mb-2">
            NEON RAIN
          </h1>
          <p className="text-gray-400 text-sm">Cyberpunk Hacking Simulation</p>
        </div>

        <div className="bg-gray-900 border border-cyan-500/30 rounded-lg p-8 shadow-lg shadow-cyan-500/10">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-cyan-400 text-sm mb-2">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-black border border-cyan-500/50 rounded px-4 py-2 text-cyan-300 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-cyan-400 text-sm mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black border border-cyan-500/50 rounded px-4 py-2 text-cyan-300 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                required
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm bg-red-900/20 border border-red-500/50 rounded px-4 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold py-2 px-4 rounded hover:from-cyan-400 hover:to-purple-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '...' : isRegister ? 'Register' : 'Login'}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                setError('');
              }}
              className="w-full text-cyan-400 text-sm hover:text-cyan-300 transition"
            >
              {isRegister ? 'Already have an account? Login' : 'Need an account? Register'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
