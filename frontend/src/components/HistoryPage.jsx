import { useState, useEffect } from 'react';
import { Clock, Calendar, CheckCircle2, ChevronRight, X, User, Landmark, ShieldAlert, PhoneCall, Heart } from 'lucide-react';

const API = 'http://localhost:3000/api';

const STATUS_COLORS = {
  ASSIGNED: 'tag-green',
  PENDING: 'tag-blue',
  SEARCHING: 'tag-blue',
  COMPLETED: 'tag-gray',
  CANCELLED: 'tag-red',
  IN_PROGRESS: 'tag-green',
};

export default function HistoryPage({ phone }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState(null);

  useEffect(() => {
    if (!phone) { setLoading(false); return; }
    fetch(`${API}/history/${encodeURIComponent(phone)}`)
      .then(r => r.json())
      .then(d => { setHistory(d.history || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [phone]);

  const fmtDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const fmtTime = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  return (
    <div className="history-container animate-up">
      <div className="history-header">
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.03em' }}>Emergency Logs</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 3 }}>Logs and details of your past ambulance requests</p>
      </div>

      {loading && (
        <div className="locating-screen">
          <div className="radar-pulse" style={{ fontSize: '1.5rem' }}>📋</div>
          <p style={{ color: 'var(--text-muted)' }}>Loading history…</p>
        </div>
      )}

      {!loading && !phone && (
        <div className="empty-state">
          <span className="empty-icon font-emoji">📱</span>
          <p>Enter your phone number on the Home tab to load your history logs.</p>
        </div>
      )}

      {!loading && phone && history.length === 0 && (
        <div className="empty-state">
          <span className="empty-icon font-emoji">🕓</span>
          <p>No emergency requests found.<br />Your logs are currently empty.</p>
        </div>
      )}

      {!loading && history.length > 0 && (
        <div className="history-list">
          {history.map(item => (
            <div 
              className="history-log-card interactive animate-in" 
              key={item.id}
              onClick={() => setSelectedIncident(item)}
            >
              <div className="log-badge-row">
                <span className="log-type-title">
                  {item.emergencyType && item.emergencyType !== 'UNKNOWN' ? item.emergencyType : 'Emergency Request'}
                </span>
                <span className={`tag ${STATUS_COLORS[item.status] || 'tag-gray'}`}>
                  {item.status}
                </span>
              </div>
              <div className="log-info-grid">
                <div className="log-meta-item">
                  <Calendar size={13} color="var(--text-faint)" />
                  <span>{fmtDate(item.createdAt)}</span>
                </div>
                <div className="log-meta-item">
                  <Clock size={13} color="var(--text-faint)" />
                  <span>{fmtTime(item.createdAt)}</span>
                </div>
              </div>
              <div className="log-summary-row">
                <p className="log-provider-meta">
                  Unit: {item.providerName} • {item.driverName}
                </p>
                <ChevronRight size={16} color="var(--text-faint)" />
              </div>
              {item.pickupAddress && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span>📍</span>
                  <span>{item.pickupAddress}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Incident Details Drawer Overlay */}
      {selectedIncident && (
        <div className="modal-overlay animate-fade-in" onClick={() => setSelectedIncident(null)}>
          <div className="modal-sheet animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Incident Log Details</h3>
              <button className="close-btn" onClick={() => setSelectedIncident(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-scroll-content">
              {/* Receipt Header */}
              <div className="receipt-hero-card">
                <div className="receipt-header-row">
                  <div>
                    <h2 className="receipt-title">
                      {selectedIncident.emergencyType && selectedIncident.emergencyType !== 'UNKNOWN' 
                        ? selectedIncident.emergencyType 
                        : 'Ambulance Dispatch'}
                    </h2>
                    <p className="receipt-id">Booking ID: {selectedIncident.id.slice(0, 16).toUpperCase()}</p>
                  </div>
                  <span className={`tag ${STATUS_COLORS[selectedIncident.status] || 'tag-gray'}`} style={{ alignSelf: 'flex-start' }}>
                    {selectedIncident.status}
                  </span>
                </div>
                <div className="receipt-meta-grid">
                  <div>
                    <p className="meta-lbl">DATE</p>
                    <p className="meta-val">{fmtDate(selectedIncident.createdAt)}</p>
                  </div>
                  <div>
                    <p className="meta-lbl">TIME</p>
                    <p className="meta-val">{fmtTime(selectedIncident.createdAt)}</p>
                  </div>
                </div>
              </div>

              {/* Pickup Location Details */}
              <div className="details-group">
                <h4 className="group-title">📍 Pickup Location</h4>
                <div className="details-list">
                  <div className="details-row">
                    <span className="details-val" style={{ textAlign: 'left', color: 'var(--text)', fontSize: '0.82rem', lineHeight: 1.4 }}>
                      {selectedIncident.pickupAddress || 'GPS Coordinates Acquired'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Driver & Responder Details */}
              <div className="details-group">
                <h4 className="group-title"><User size={16} /> Paramedic Driver</h4>
                <div className="details-list">
                  <div className="details-row">
                    <span className="details-lbl">Driver Name:</span>
                    <span className="details-val">{selectedIncident.driverName}</span>
                  </div>
                  <div className="details-row">
                    <span className="details-lbl">Driver Rating:</span>
                    <span className="details-val">⭐ {selectedIncident.driverRating || '4.8'}</span>
                  </div>
                  {selectedIncident.driverPhone && (
                    <div className="details-row">
                      <span className="details-lbl">Phone Contact:</span>
                      <a href={`tel:${selectedIncident.driverPhone}`} className="details-val details-link">
                        {selectedIncident.driverPhone}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Provider & Ambulance Details */}
              <div className="details-group">
                <h4 className="group-title"><Landmark size={16} /> Care Provider & Unit</h4>
                <div className="details-list">
                  <div className="details-row">
                    <span className="details-lbl">Provider:</span>
                    <span className="details-val">{selectedIncident.providerName}</span>
                  </div>
                  <div className="details-row">
                    <span className="details-lbl">Ambulance Class:</span>
                    <span className="details-val">{selectedIncident.ambulanceType || 'ALS'} Unit</span>
                  </div>
                  {selectedIncident.etaMins && (
                    <div className="details-row">
                      <span className="details-lbl">ETA at Booking:</span>
                      <span className="details-val">{selectedIncident.etaMins} mins</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Admission Hospital Details */}
              <div className="details-group" style={{ marginBottom: 20 }}>
                <h4 className="group-title"><Heart size={16} /> Hospital Admitted</h4>
                <div className="details-list">
                  <div className="details-row">
                    <span className="details-lbl">Admitted Destination:</span>
                    <span className="details-val" style={{ color: 'var(--green)', fontWeight: 600 }}>
                      {selectedIncident.hospitalName || 'Nearest Trauma Hospital'}
                    </span>
                  </div>
                  <div className="details-row">
                    <span className="details-lbl">ICU Bed Reservation:</span>
                    <span className="details-val">Secured ✓</span>
                  </div>
                </div>
              </div>
            </div>

            <button className="btn btn-full btn-primary" onClick={() => setSelectedIncident(null)}>
              Close Log Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
