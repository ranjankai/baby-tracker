import { useState } from 'react';
import { Lock, User, ChevronRight } from 'lucide-react';

const USERS = [
  { id: 'rakant', name: 'rakant', password: 'ra123' },
  { id: 'risharma', name: 'risharma', password: 'ri123' }
];

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState(USERS[0].id);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    const user = USERS.find(u => u.id === username && u.password === password);
    
    if (user) {
      onLogin(user.name);
    } else {
      setError('Incorrect password. Please try again.');
      // Auto-clear error after 3 seconds
      setTimeout(() => setError(''), 3000);
    }
  };

  return (
    <div className="glass-container">
      <div className="glass-card">
        <h1 className="login-title">Baby Tracker</h1>
        <p className="login-subtitle">Welcome back, Super Parent!</p>

        <form onSubmit={handleLogin}>
          {error && <div className="auth-error">{error}</div>}

          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <span className="intensity-label" style={{ textAlign: 'left' }}>Who are you?</span>
            <select 
              className="input-field"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ paddingLeft: '44px', appearance: 'none' }}
            >
              {USERS.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <User size={18} style={{ position: 'absolute', left: '16px', top: '48px', color: 'var(--text-muted)' }} />
          </div>

          <div style={{ position: 'relative', marginBottom: '32px' }}>
            <span className="intensity-label" style={{ textAlign: 'left' }}>Password</span>
            <input 
              type="password"
              className="input-field"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ paddingLeft: '44px', marginBottom: 0 }}
            />
            <Lock size={18} style={{ position: 'absolute', left: '16px', top: '48px', color: 'var(--text-muted)' }} />
          </div>

          <button type="submit" className="button-primary">
            Log In <ChevronRight size={20} />
          </button>
        </form>
      </div>
    </div>
  );
}
