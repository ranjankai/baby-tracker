import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { BabyProvider } from './components/BabyContext';
import SummaryCards from './components/SummaryCards';
import QuickLog from './components/QuickLog';
import EventList from './components/EventList';
import InsightStrip from './components/InsightStrip';
import InsightBox from './components/InsightBox';
import MedBox from './components/MedBox';
import LoginScreen from './components/LoginScreen';
import { LogOut, Sun, Moon, RefreshCw } from 'lucide-react';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    // Auth initialization
    const savedUser = localStorage.getItem('baby_tracker_user');
    if (savedUser) setUser(savedUser);

    // Theme initialization
    const savedTheme = localStorage.getItem('baby_tracker_theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialDarkMode = savedTheme === 'dark' || (!savedTheme && systemPrefersDark);
    
    setIsDarkMode(initialDarkMode);
    if (initialDarkMode) {
      document.documentElement.classList.add('dark-mode');
    }
    
    setIsInitializing(false);
  }, []);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('baby_tracker_theme', newMode ? 'dark' : 'light');
    if (newMode) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
  };

  const handleSync = () => {
    window.location.reload();
  };

  const handleLogin = (username) => {
    setUser(username);
    localStorage.setItem('baby_tracker_user', username);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('baby_tracker_user');
  };

  if (isInitializing) return null;

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <BabyProvider>
      <div className="app-container">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h1 style={{ margin: 0, lineHeight: 1 }}>Baby Tracker</h1>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button 
              onClick={handleSync}
              className="icon-action-btn theme-toggle"
              title="Refresh Data"
              style={{ background: 'var(--primary-light)', color: 'var(--primary)', border: 'none' }}
            >
              <RefreshCw size={18} />
            </button>

            <button 
              onClick={toggleDarkMode}
              className="icon-action-btn theme-toggle"
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            
            {/* User Avatar Bubble */}
            <div 
              title={`Logged in as ${user}`}
              style={{ 
                width: '32px', height: '32px', borderRadius: '50%', 
                background: 'linear-gradient(135deg, var(--primary), var(--secondary))', 
                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                fontWeight: '700', fontSize: '13px', letterSpacing: '0.5px',
                boxShadow: '0 2px 8px rgba(167, 139, 250, 0.25)'
              }}>
              {user ? (
                user.toLowerCase() === 'rakant' ? 'RK' : 
                user.toLowerCase() === 'risharma' ? 'RS' : 
                user.substring(0, 2).toUpperCase()
              ) : '??'}
            </div>

            <button 
              onClick={handleLogout}
              className="icon-action-btn"
              title="Log out"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)' }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <SummaryCards />
        <InsightStrip />
        <QuickLog />
        <MedBox />
        <EventList />

        <footer style={{ marginTop: 'auto', padding: '24px 0', textAlign: 'center', opacity: 0.5, fontSize: '12px' }}>
          Built with ❤️ for new parents
        </footer>
      </div>
      <InsightBox />
    </BabyProvider>
  );
}

export default App;
