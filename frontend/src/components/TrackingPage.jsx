import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { PhoneCall, CheckCircle2, X, Star, ShieldAlert, Heart, Truck, Landmark } from 'lucide-react';

const ambIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/883/883344.png',
  iconSize: [40, 40], iconAnchor: [20, 20],
});
const userIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
  iconSize: [36, 36], iconAnchor: [18, 36],
});
const hospIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png',
  iconSize: [32, 32], iconAnchor: [16, 32],
});

const FIRST_AID_GUIDELINES = {
  'Accident / Trauma': [
    { title: 'Apply Direct Pressure', text: 'Use a clean cloth or bandage directly on the wound to control bleeding.' },
    { title: 'Keep Spine Stable', text: 'Avoid moving the patient’s head, neck, or back to prevent nerve damage.' },
    { title: 'Check Airway', text: 'Make sure the patient is breathing and there are no obstructions in the mouth.' }
  ],
  'Cardiac Arrest': [
    { title: 'Perform Hands-Only CPR', text: 'Push hard & fast in the center of the chest (100-120 compressions per minute).' },
    { title: 'Locate AED', text: 'If an Automated External Defibrillator is nearby, turn it on and follow voice instructions.' },
    { title: 'Keep Warm & Alert', text: 'Cover with a blanket. Keep talking to the patient to monitor responsiveness.' }
  ],
  'Breathing Difficulty': [
    { title: 'Sit the Patient Upright', text: 'Helping them sit vertically relieves lung pressure and makes breathing easier.' },
    { title: 'Loosen Tight Clothes', text: 'Undo collars, belts, or any garments restricting the chest/neck area.' },
    { title: 'Administer Inhaler', text: 'Help them locate and use their emergency inhaler or personal oxygen if available.' }
  ],
  'Unconscious Person': [
    { title: 'Use the Recovery Position', text: 'If breathing, roll them onto their side to keep their tongue from blocking airway.' },
    { title: 'Do Not Feed or Give Water', text: 'Giving fluids to an unconscious person can cause choking or asphyxiation.' },
    { title: 'Monitor Breath Constantly', text: 'Stay next to them and check for regular chest rise/fall until help arrives.' }
  ],
  'Stroke Symptoms': [
    { title: 'Think F.A.S.T.', text: 'Check for Face drooping, Arm weakness, and Speech difficulty. Note the time of onset.' },
    { title: 'Elevate Head Slightly', text: 'Keep them lying down with head and shoulders slightly raised on a pillow.' },
    { title: 'Stay Calm and Quiet', text: 'Keep the room quiet and avoid unnecessary movements to manage brain pressure.' }
  ],
  'Other / Not Sure': [
    { title: 'Stay by the Entrance', text: 'If possible, stand outside or clear the main gate/door to guide the paramedics.' },
    { title: 'Gather Medications', text: 'Collect all current prescriptions, medical history, or insurance files for the crew.' },
    { title: 'Secure Household Pets', text: 'Move dogs/cats to a separate room to avoid any delays when responders enter.' }
  ]
};

export default function TrackingPage({ userLat, userLon, dispatchData, problem, onReset }) {
  const ambStartLat = dispatchData.ambulance.latitude;
  const ambStartLon = dispatchData.ambulance.longitude;
  const [ambLat, setAmbLat] = useState(ambStartLat);
  const [ambLon, setAmbLon] = useState(ambStartLon);
  const [eta, setEta] = useState(dispatchData.etaMins || 8);
  const [arrived, setArrived] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const TOTAL = 480;
    let step = 0;
    const dLat = (userLat - ambStartLat) / TOTAL;
    const dLon = (userLon - ambStartLon) / TOTAL;
    const iv = setInterval(() => {
      if (step >= TOTAL) { clearInterval(iv); setArrived(true); return; }
      setAmbLat(p => p + dLat);
      setAmbLon(p => p + dLon);
      if (step % 48 === 0) setEta(p => Math.max(1, p - 1));
      step++;
    }, 16);
    return () => clearInterval(iv);
  }, []);

  const bounds = [[userLat, userLon], [ambStartLat, ambStartLon],
    ...(dispatchData.hospital ? [[dispatchData.hospital.latitude, dispatchData.hospital.longitude]] : [])];
  const routeLine = [[ambStartLat, ambStartLon], [userLat, userLon],
    ...(dispatchData.hospital ? [[dispatchData.hospital.latitude, dispatchData.hospital.longitude]] : [])];

  const guidelines = FIRST_AID_GUIDELINES[problem] || FIRST_AID_GUIDELINES['Other / Not Sure'];

  return (
    <div className="map-screen animate-in">
      <div className="map-top">
        <MapContainer bounds={bounds} boundsOptions={{ padding: [40, 40] }} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          <Marker position={[userLat, userLon]} icon={userIcon}><Popup>Your Location</Popup></Marker>
          <Marker position={[ambLat, ambLon]} icon={ambIcon}><Popup>Ambulance en route</Popup></Marker>
          {dispatchData.hospital && (
            <Marker position={[dispatchData.hospital.latitude, dispatchData.hospital.longitude]} icon={hospIcon}>
              <Popup>{dispatchData.hospital.name} — ICU Bed Reserved ✓</Popup>
            </Marker>
          )}
          <Polyline positions={routeLine} color="#ef4444" weight={2.5} dashArray="8 6" opacity={0.5} />
        </MapContainer>
      </div>

      <div className="tracking-sheet scrollable">
        <div className="sheet-handle" />
        <div className="tracking-top-row">
          <CheckCircle2 size={28} color="var(--green)" />
          <div>
            <h2>{arrived ? 'Ambulance Arrived!' : 'Driver is on the way'}</h2>
            <p>Booking #{dispatchData.bookingId.slice(0, 8).toUpperCase()}</p>
          </div>
          <div className="eta-pill">
            <span className="eta-num">{arrived ? '✓' : eta}</span>
            <span className="eta-unit">{arrived ? 'Here' : 'min ETA'}</span>
          </div>
        </div>

        <div className="info-rows">
          {problem && (
            <div className="info-row">
              <span className="info-key">Emergency</span>
              <span className="info-val" style={{ color: '#f87171' }}>{problem}</span>
            </div>
          )}
          {dispatchData.hospital && (
            <div className="info-row">
              <span className="info-key">Destination</span>
              <div style={{ textAlign: 'right' }}>
                <div className="info-val" style={{ color: '#34d399', fontSize: '0.82rem' }}>{dispatchData.hospital.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--green)', marginTop: 1 }}>✓ 1 ICU Bed Secured</div>
              </div>
            </div>
          )}
          <div className="info-row">
            <span className="info-key">Provider</span>
            <span className="info-val">{dispatchData.ambulance.providerName}</span>
          </div>
        </div>

        {/* First Aid Guidelines Section */}
        <div className="first-aid-box">
          <div className="first-aid-header">
            <ShieldAlert size={16} color="var(--accent)" />
            <h4>Emergency Actions while waiting:</h4>
          </div>
          <div className="first-aid-list">
            {guidelines.map((g, idx) => (
              <div key={idx} className="first-aid-item">
                <span className="first-aid-num">{idx + 1}</span>
                <div>
                  <p className="first-aid-title">{g.title}</p>
                  <p className="first-aid-text">{g.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Interactive Driver Card */}
        <div className="driver-card interactive" onClick={() => setShowDetails(true)}>
          <div className="driver-ava">👨‍⚕️</div>
          <div style={{ flex: 1 }}>
            <div className="driver-name-row">
              <p className="driver-name">{dispatchData.ambulance.driverName}</p>
              <div className="rating-pill">
                <Star size={11} fill="var(--yellow)" color="var(--yellow)" />
                <span>{dispatchData.ambulance.driverRating || '4.8'}</span>
              </div>
            </div>
            <p className="driver-company">{dispatchData.ambulance.providerName} • <span style={{ color: 'var(--text-faint)' }}>Tap for details</span></p>
          </div>
          <a href={`tel:${dispatchData.ambulance.phone}`} className="call-circle" onClick={e => e.stopPropagation()}>
            <PhoneCall size={18} color="white" />
          </a>
        </div>

        <button className="btn btn-full btn-danger" style={{ marginTop: 8 }} onClick={onReset}>Cancel Emergency Request</button>
      </div>

      {/* Driver/Provider Details Modal Bottom Sheet */}
      {showDetails && (
        <div className="modal-overlay animate-fade-in" onClick={() => setShowDetails(false)}>
          <div className="modal-sheet animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Medical Dispatcher Profile</h3>
              <button className="close-btn" onClick={() => setShowDetails(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-scroll-content">
              {/* Profile Card Section */}
              <div className="profile-hero-card">
                <span className="profile-large-avatar">👨‍⚕️</span>
                <h2>{dispatchData.ambulance.driverName}</h2>
                <p className="certification-badge">Certified Paramedic / BLS Responder</p>
                <div className="profile-stats-grid">
                  <div className="profile-stat-box">
                    <span className="stat-highlight-val">⭐ {dispatchData.ambulance.driverRating || '4.8'}</span>
                    <span className="stat-desc-lbl">Driver Rating</span>
                  </div>
                  <div className="profile-stat-box">
                    <span className="stat-highlight-val">6+ Yrs</span>
                    <span className="stat-desc-lbl">Experience</span>
                  </div>
                  <div className="profile-stat-box">
                    <span className="stat-highlight-val">100%</span>
                    <span className="stat-desc-lbl">Incident Sync</span>
                  </div>
                </div>
              </div>

              {/* Vehicle & Care Provider Details */}
              <div className="details-group">
                <h4 className="group-title"><Truck size={16} /> Ambulance Details</h4>
                <div className="details-list">
                  <div className="details-row">
                    <span className="details-lbl">Unit Class:</span>
                    <span className="details-val">{dispatchData.ambulance.ambulanceType || 'ALS'} (Advanced Life Support)</span>
                  </div>
                  <div className="details-row">
                    <span className="details-lbl">License Plate:</span>
                    <span className="details-val font-mono">DL 3C AB 4920</span>
                  </div>
                  <div className="details-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                    <span className="details-lbl">Onboard Equipment:</span>
                    <div className="equipment-tag-wrap">
                      {['Oxygen Cylinder', 'Defibrillator (AED)', 'Ventilator', 'Vital Monitor', 'Trauma Kit'].map(eq => (
                        <span key={eq} className="equipment-tag">{eq}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="details-group">
                <h4 className="group-title"><Landmark size={16} /> Provider Information</h4>
                <div className="details-list">
                  <div className="details-row">
                    <span className="details-lbl">Care Provider:</span>
                    <span className="details-val">{dispatchData.ambulance.providerName}</span>
                  </div>
                  <div className="details-row">
                    <span className="details-lbl">Provider Type:</span>
                    <span className="details-val">{dispatchData.ambulance.providerType || 'PRIVATE'}</span>
                  </div>
                  <div className="details-row">
                    <span className="details-lbl">Dispatch Hotline:</span>
                    <a href="tel:+9118004567890" className="details-val details-link">+91 1800 456 7890</a>
                  </div>
                </div>
              </div>

              <div className="details-group" style={{ marginBottom: 20 }}>
                <h4 className="group-title"><Heart size={16} /> Secured Booking Status</h4>
                <div className="details-list">
                  <div className="details-row">
                    <span className="details-lbl">Booking Ref:</span>
                    <span className="details-val font-mono">{dispatchData.bookingId.toUpperCase()}</span>
                  </div>
                  {dispatchData.hospital && (
                    <div className="details-row">
                      <span className="details-lbl">Reserved Bed:</span>
                      <span className="details-val" style={{ color: 'var(--green)', fontWeight: 600 }}>1 ICU Bed at {dispatchData.hospital.name}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button className="btn btn-full btn-primary" onClick={() => setShowDetails(false)}>Close Dispatch Details</button>
          </div>
        </div>
      )}
    </div>
  );
}
