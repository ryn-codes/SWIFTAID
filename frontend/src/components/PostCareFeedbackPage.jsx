import { useState } from 'react';
import { Star, Heart, Home, Activity, Package, CheckCircle2, ChevronRight } from 'lucide-react';

const HOME_SUPPORT_OPTIONS = [
  { id: 'nursing',  icon: '🏥', label: 'Home Nursing Care',        desc: 'Professional nurse visits at home' },
  { id: 'therapy',  icon: '🦴', label: 'Physical Rehabilitation',  desc: 'Recovery therapy sessions' },
  { id: 'pharmacy', icon: '💊', label: 'Prescription Delivery',    desc: 'Medicines delivered to your door' },
  { id: 'followup', icon: '📋', label: 'Doctor Follow-Up Consult', desc: 'Virtual consultation with specialist' },
];

function StarRating({ value, onChange, label }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="star-rating-group">
      <span className="star-rating-label">{label}</span>
      <div className="star-row">
        {[1, 2, 3, 4, 5].map(s => (
          <button
            key={s}
            className="star-btn"
            onMouseEnter={() => setHovered(s)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => onChange(s)}
          >
            <Star
              size={28}
              fill={(hovered || value) >= s ? 'var(--yellow)' : 'transparent'}
              color={(hovered || value) >= s ? 'var(--yellow)' : 'var(--border)'}
              strokeWidth={1.5}
            />
          </button>
        ))}
        {value > 0 && (
          <span className="star-val-label">{['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][value]}</span>
        )}
      </div>
    </div>
  );
}

export default function PostCareFeedbackPage({ dispatchData, onDone }) {
  const [driverRating, setDriverRating]   = useState(0);
  const [hospitalRating, setHospitalRating] = useState(0);
  const [selectedSupport, setSelectedSupport] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const toggleSupport = (id) => setSelectedSupport(p => ({ ...p, [id]: !p[id] }));
  const supportCount  = Object.values(selectedSupport).filter(Boolean).length;

  const handleSubmit = () => {
    // In a real app this would POST feedback to the backend
    setSubmitted(true);
    setTimeout(() => onDone(), 2800);
  };

  if (submitted) {
    return (
      <div className="postcare-screen animate-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, textAlign: 'center', padding: 32 }}>
        <div className="badge-pulse-wrap" style={{ width: 80, height: 80 }}>
          <CheckCircle2 size={44} color="var(--green)" className="success-check-icon" />
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em' }}>Thank you!</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5, maxWidth: 260 }}>
          Your feedback has been recorded. We hope you have a safe and swift recovery. 🙏
        </p>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-faint)' }}>Returning to home screen…</p>
      </div>
    );
  }

  return (
    <div className="postcare-screen animate-in">
      {/* Incident Summary Hero */}
      <div className="postcare-hero">
        <div className="postcare-icon-wrap">
          <Heart size={32} color="var(--accent)" />
        </div>
        <div>
          <h2 className="postcare-title">Emergency Resolved</h2>
          <p className="postcare-subtitle">Booking #{(dispatchData.bookingId || '').slice(0, 8).toUpperCase()}</p>
        </div>
        <div className="resolved-badge">✓ COMPLETED</div>
      </div>

      {/* Quick Incident Recap */}
      <div className="postcare-recap-strip">
        <div className="recap-chip">
          <span className="recap-chip-label">Paramedic</span>
          <span className="recap-chip-val">{dispatchData.ambulance?.driverName || '—'}</span>
        </div>
        <div className="recap-chip">
          <span className="recap-chip-label">Unit Type</span>
          <span className="recap-chip-val">{dispatchData.ambulance?.ambulanceType || 'ALS'}</span>
        </div>
        {dispatchData.hospital && (
          <div className="recap-chip" style={{ gridColumn: '1 / -1' }}>
            <span className="recap-chip-label">Admitted Hospital</span>
            <span className="recap-chip-val">{dispatchData.hospital.name}</span>
          </div>
        )}
      </div>

      {/* Rating Section */}
      <div className="postcare-section">
        <h3 className="postcare-section-title"><Star size={16} /> Rate Your Experience</h3>
        <div className="rating-cards">
          <div className="rating-card">
            <span className="rating-card-icon">👨‍⚕️</span>
            <StarRating
              value={driverRating}
              onChange={setDriverRating}
              label={`Paramedic – ${dispatchData.ambulance?.driverName || 'Driver'}`}
            />
          </div>
          {dispatchData.hospital && (
            <div className="rating-card">
              <span className="rating-card-icon">🏥</span>
              <StarRating
                value={hospitalRating}
                onChange={setHospitalRating}
                label={`Hospital – ${dispatchData.hospital.name || 'Hospital'}`}
              />
            </div>
          )}
        </div>
      </div>

      {/* Home Support Options */}
      <div className="postcare-section">
        <h3 className="postcare-section-title"><Home size={16} /> Post-Discharge Home Support</h3>
        <p className="postcare-section-sub">Would you like to arrange any of the following?</p>
        <div className="support-options-grid">
          {HOME_SUPPORT_OPTIONS.map(opt => (
            <button
              key={opt.id}
              className={`support-option-card${selectedSupport[opt.id] ? ' selected' : ''}`}
              onClick={() => toggleSupport(opt.id)}
            >
              <div className="support-option-top">
                <span className="support-icon">{opt.icon}</span>
                {selectedSupport[opt.id] && (
                  <CheckCircle2 size={14} color="var(--green)" />
                )}
              </div>
              <span className="support-label">{opt.label}</span>
              <span className="support-desc">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Discharge Instructions */}
      <div className="discharge-box">
        <div className="discharge-header">
          <Activity size={14} color="var(--blue)" />
          <span>Standard Post-Incident Guidance</span>
        </div>
        <ul className="discharge-list">
          <li>Rest for at least 24 hours after transport</li>
          <li>Keep all prescribed medications on schedule</li>
          <li>Stay hydrated — aim for 2 litres of water daily</li>
          <li>Contact your GP if symptoms return within 48 hrs</li>
        </ul>
      </div>

      {/* Submit */}
      <div className="postcare-footer">
        {supportCount > 0 && (
          <p className="support-selected-note">
            <Package size={13} /> {supportCount} care service{supportCount > 1 ? 's' : ''} selected — our team will contact you
          </p>
        )}
        <button className="btn btn-full btn-primary" onClick={handleSubmit}>
          Submit Feedback & Close <ChevronRight size={16} />
        </button>
        <button className="btn btn-ghost" style={{ marginTop: 8, width: '100%' }} onClick={onDone}>
          Skip for now
        </button>
      </div>
    </div>
  );
}
