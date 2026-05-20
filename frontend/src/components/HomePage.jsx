import { Phone } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000/api';

export default function HomePage({ phone, setPhone, onNext, stats }) {
  const handleSubmit = (e) => {
    e.preventDefault();
    if (phone.trim().length >= 7) onNext();
  };

  return (
    <div className="animate-up">
      {/* Hero */}
      <div className="home-hero">
        <p className="hero-greeting">SwiftAid Emergency Network</p>
        <h1 className="hero-title">Help is one<br/>tap away.</h1>
        <p className="hero-sub">Nearest ambulance dispatched in seconds. No login. No friction.</p>
      </div>

      {/* Phone input row */}
      <div className="phone-row">
        <div className="input-icon-wrap" style={{ flex: 1 }}>
          <Phone className="icon-left" size={16} />
          <input
            type="tel"
            className="input-field"
            placeholder="+91 98765 43210"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            autoComplete="tel"
          />
        </div>
      </div>

      {/* SOS Button */}
      <div className="sos-button-wrap">
        <button
          className="sos-btn"
          onClick={handleSubmit}
          disabled={phone.trim().length < 7}
        >
          <span style={{ fontSize: '2rem' }}>🚨</span>
          <span className="sos-label">SOS</span>
          <span className="sos-sub">Tap to Dispatch</span>
        </button>
        <span className="sos-hint">Enter your phone first, then tap SOS</span>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-number">{stats.ambulances}</span>
          <span className="stat-label">Units Ready</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{stats.hospitals}</span>
          <span className="stat-label">Hospitals</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">&lt;30s</span>
          <span className="stat-label">Avg Dispatch</span>
        </div>
      </div>

      {/* Quick info */}
      <div style={{ padding: '0 20px 20px' }}>
        <p className="section-title" style={{ marginBottom: 10 }}>How it works</p>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            ['📍', 'Auto-detect your location instantly'],
            ['🚑', 'Top-3 nearest drivers pinged in parallel'],
            ['🏥', 'Nearest hospital with free ICU bed secured'],
            ['📞', 'Direct driver call on confirmation'],
          ].map(([icon, text]) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: '1.2rem' }}>{icon}</span>
              <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)', fontWeight: 500 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
