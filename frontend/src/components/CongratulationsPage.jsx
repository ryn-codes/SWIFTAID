import { CheckCircle2, Star, ShieldAlert } from 'lucide-react';

const EMERGENCIES = [
  { id: 'accident',    icon: '🩸', label: 'Accident / Trauma' },
  { id: 'cardiac',     icon: '💔', label: 'Cardiac Arrest' },
  { id: 'breathing',   icon: '🫁', label: 'Breathing Difficulty' },
  { id: 'unconscious', icon: '😵', label: 'Unconscious Person' },
  { id: 'stroke',      icon: '🧠', label: 'Stroke Symptoms' },
  { id: 'other',       icon: '🤕', label: 'Other / Not Sure' },
];

export default function CongratulationsPage({ dispatchData, problem, onSelectProblem, onProceed }) {
  const driver = dispatchData.ambulance;

  return (
    <div className="congratulations-screen animate-in">
      <div className="success-header">
        <div className="badge-pulse-wrap">
          <CheckCircle2 size={48} className="success-check-icon" />
        </div>
        <h1 className="success-title">Ambulance Confirmed!</h1>
        <p className="success-subtitle">We have successfully secured a responder for you.</p>
      </div>

      {/* Driver Information Card */}
      <div className="driver-summary-card">
        <div className="driver-header-row">
          <div className="avatar-med">👨‍⚕️</div>
          <div className="driver-details">
            <h3 className="drv-name">{driver.driverName}</h3>
            <p className="drv-provider">{driver.providerName} • {driver.ambulanceType || 'ALS'} Unit</p>
          </div>
          <div className="driver-rating-badge">
            <Star size={14} fill="var(--yellow)" color="var(--yellow)" />
            <span>{driver.driverRating || '4.8'}</span>
          </div>
        </div>
        <div className="eta-badge-row">
          <span className="eta-highlight">{dispatchData.etaMins || '5'} min ETA</span>
          <span className="bullet-sep">•</span>
          <span className="hospital-reserve-status">ICU Bed Secured at {dispatchData.hospital?.name || 'Nearest ICU Hospital'}</span>
        </div>
        {dispatchData.pickupAddress && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>📍</span>
            <span style={{ textAlign: 'left', lineHeight: 1.3 }}>Pickup: {dispatchData.pickupAddress}</span>
          </div>
        )}
      </div>

      {/* UX Nudge Section */}
      <div className="nudge-section">
        <div className="nudge-header">
          <ShieldAlert size={18} color="var(--accent)" />
          <h4>Help the driver prepare:</h4>
        </div>
        <p className="nudge-sub">Select your emergency type so medical staff can prepare treatment materials in advance.</p>
        
        <div className="triage-grid compact">
          {EMERGENCIES.map(e => {
            const isSelected = problem === e.label;
            return (
              <button 
                key={e.id} 
                className={`triage-chip compact-chip${isSelected ? ' selected' : ''}`} 
                onClick={() => onSelectProblem(e.label)}
              >
                <span className="triage-icon">{e.icon}</span>
                <span className="chip-label">{e.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Primary Action Button */}
      <div className="bottom-bar">
        <button className="btn btn-full btn-primary proceed-btn" onClick={onProceed}>
          Track Live on Map &rarr;
        </button>
      </div>
    </div>
  );
}
