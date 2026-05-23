import { useState, useEffect, useRef } from 'react';
import { Home, Clock, User, AlertTriangle, Sun, Moon } from 'lucide-react';
import './index.css';
import './components/Map.css';
import HomePage from './components/HomePage';
import MatchingPage from './components/MatchingPage';
import CongratulationsPage from './components/CongratulationsPage';
import TrackingPage from './components/TrackingPage';
import ProfilePage from './components/ProfilePage';
import HistoryPage from './components/HistoryPage';
import PostCareFeedbackPage from './components/PostCareFeedbackPage';

const API = 'http://localhost:3000/api';

export default function App() {
  // Navigation
  const [tab, setTab] = useState('home');       // home | history | profile
  const [dispatchStep, setDispatchStep] = useState(0); // 0=idle 1=locating 2=matching 3=congrats 4=tracking 5=post-care

  // Theme support
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.className = theme === 'light' ? 'light-theme' : '';
    localStorage.setItem('theme', theme);
  }, [theme]);

  // State
  const [phone, setPhone] = useState('');
  const [userLat, setUserLat] = useState(null);
  const [userLon, setUserLon] = useState(null);
  const [problem, setProblem] = useState(null);
  const [dispatchData, setDispatchData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [stats, setStats] = useState({ ambulances: '…', hospitals: '…' });
  const [requestId, setRequestId] = useState(null);
  const [isSilent, setIsSilent] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState(null);
  const pollRef = useRef(null);

  const updateRequestEmergencyType = async (typeLabel) => {
    setProblem(typeLabel);
    if (!requestId) return;
    try {
      await fetch(`${API}/request/${requestId}/emergency`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emergencyType: typeLabel }),
      });
    } catch (err) {
      console.error("Failed to update emergency type:", err);
    }
  };

  // Load stats on mount
  useEffect(() => {
    fetch(`${API}/ambulances`)
      .then(r => r.json())
      .then(d => setStats(s => ({ ...s, ambulances: d.filter(a => a.isAvailable).length })))
      .catch(() => {});
    // Count hospitals via ambulances response length proxy
    setStats(s => ({ ...s, hospitals: 50 }));
  }, []);

  // ── Dispatch Flow ──────────────────────────────────────
  const handleSOS = async (isSilentMode = false, voiceText = null, voiceCategory = null) => {
    setErrorMsg(null);
    setIsSilent(isSilentMode);
    setVoiceTranscript(voiceText);
    if (voiceCategory) {
      setProblem(voiceCategory);
    }
    setDispatchStep(1); // locating

    let lat = 28.6139, lon = 77.2090;

    // IP geolocation (fastest, no permission)
    try {
      const r = await fetch('https://ipapi.co/json/');
      if (r.ok) {
        const d = await r.json();
        if (d.latitude && d.longitude) { lat = d.latitude; lon = d.longitude; }
      }
    } catch { /* ignore */ }

    // Browser GPS fallback
    if (lat === 28.6139) {
      await new Promise(resolve => {
        navigator.geolocation?.getCurrentPosition(
          p => { lat = p.coords.latitude; lon = p.coords.longitude; resolve(); },
          () => resolve(),
          { timeout: 8000 }
        );
        setTimeout(resolve, 8000);
      });
    }

    setUserLat(lat);
    setUserLon(lon);
    setDispatchStep(2); // matching

      // POST request
      try {
        const res = await fetch(`${API}/request-ambulance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: phone,
            latitude: lat,
            longitude: lon,
            isSilent: isSilentMode,
            voiceTranscript: voiceText,
            emergencyType: voiceCategory || 'UNKNOWN'
          }),
        });
        const data = await res.json();
        if (!res.ok) { setErrorMsg(data.error || 'Dispatch failed'); setDispatchStep(0); return; }

        setRequestId(data.requestId);

        // Poll for driver acceptance
        pollRef.current = setInterval(async () => {
          try {
            const sr = await fetch(`${API}/request-status/${data.requestId}`);
            if (sr.ok) {
              const sd = await sr.json();
              if (sd.status === 'ASSIGNED' || sd.status === 'IN_PROGRESS') {
                clearInterval(pollRef.current);
                setDispatchData(sd.dispatchData);
                setDispatchStep(3); // congratulations screen
              }
            }
          } catch { /* ignore */ }
        }, 1500);
      } catch {
        setErrorMsg('Network error. Check your connection and try again.');
        setDispatchStep(0);
      }
  };

  const resetDispatch = () => {
    clearInterval(pollRef.current);
    setDispatchStep(0);
    setDispatchData(null);
    setProblem(null);
    setErrorMsg(null);
    setRequestId(null);
    setIsSilent(false);
    setVoiceTranscript(null);
  };

  const completeRequest = async () => {
    if (!requestId) return;
    try {
      await fetch(`${API}/request/${requestId}/complete`, { method: 'PATCH' });
    } catch { /* ignore */ }
    setDispatchStep(5);
  };

  useEffect(() => () => clearInterval(pollRef.current), []);

  // ── Render ─────────────────────────────────────────────
  const isDispatching = dispatchStep > 0;
  const showNav = !isDispatching;

  const headerTitle = () => {
    if (dispatchStep === 1) return 'Locating You…';
    if (dispatchStep === 2) return 'Matching Unit…';
    if (dispatchStep === 3) return 'Unit Confirmed';
    if (dispatchStep === 4) return 'Help is Coming';
    if (dispatchStep === 5) return 'Post-Incident Care';
    if (tab === 'history') return 'History';
    if (tab === 'profile') return 'Medical Profile';
    return null; // home shows hero
  };

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="app-header">
        <div className="app-logo">
          <div className="logo-cross">✚</div>
          SwiftAid
        </div>
        {headerTitle() && (
          <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-muted)' }}>{headerTitle()}</span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button 
            onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} 
            className="theme-toggle-btn"
            aria-label="Toggle theme"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6, borderRadius: '50%' }}
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <span className="header-badge">LIVE</span>
        </div>
      </header>

      {/* Error Banner */}
      {errorMsg && <div className="error-banner">⚠ {errorMsg}</div>}

      {/* Page Content */}
      <div className="page-content">
        {/* Dispatch flow takes over everything */}
        {dispatchStep === 1 && (
          <div className="locating-screen animate-in">
            <div className="radar-pulse">📍</div>
            <h3 style={{ fontWeight: 700 }}>Finding Your Location</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Using GPS and IP geolocation…</p>
          </div>
        )}

        {dispatchStep === 2 && (
          <MatchingPage 
            userLat={userLat} 
            userLon={userLon} 
            problem={problem} 
            onSelectProblem={updateRequestEmergencyType} 
            theme={theme}
          />
        )}

        {dispatchStep === 3 && dispatchData && (
          <CongratulationsPage
            dispatchData={dispatchData}
            problem={problem}
            onSelectProblem={updateRequestEmergencyType}
            onProceed={() => setDispatchStep(4)}
          />
        )}

        {dispatchStep === 4 && dispatchData && (
          <TrackingPage
            userLat={userLat} userLon={userLon}
            dispatchData={dispatchData} problem={problem}
            onReset={resetDispatch}
            onComplete={completeRequest}
            theme={theme}
            isSilent={isSilent}
            requestId={requestId}
          />
        )}

        {dispatchStep === 5 && dispatchData && (
          <PostCareFeedbackPage
            dispatchData={dispatchData}
            onDone={resetDispatch}
          />
        )}

        {/* Normal tabs (hidden during dispatch) */}
        {!isDispatching && tab === 'home' && (
          <HomePage phone={phone} setPhone={setPhone} onNext={handleSOS} stats={stats} />
        )}
        {!isDispatching && tab === 'history' && <HistoryPage phone={phone} />}
        {!isDispatching && tab === 'profile' && <ProfilePage phone={phone} setPhone={setPhone} />}
      </div>

      {/* Bottom Navigation */}
      {showNav && (
        <nav className="bottom-nav">
          <button className={`nav-item${tab === 'home' ? ' active' : ''}`} onClick={() => setTab('home')}>
            <Home size={22} />
            <span className="nav-label">Home</span>
          </button>
          <button className={`nav-item${tab === 'history' ? ' active' : ''}`} onClick={() => setTab('history')}>
            <Clock size={22} />
            <span className="nav-label">History</span>
          </button>
          <button className={`nav-item${tab === 'profile' ? ' active' : ''}`} onClick={() => setTab('profile')}>
            <User size={22} />
            <span className="nav-label">Profile</span>
          </button>
        </nav>
      )}
    </div>
  );
}
