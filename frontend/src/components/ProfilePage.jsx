import { useState, useEffect } from 'react';
import { User, Heart, Save, HeartPulse, ShieldAlert, Award, Phone } from 'lucide-react';

const API = 'http://localhost:3000/api';
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = ['Male', 'Female', 'Other', 'Prefer Not to Say'];

export default function ProfilePage({ phone, setPhone }) {
  const [form, setForm] = useState({
    bloodGroup: '',
    allergies: '',
    conditions: '',
    age: '',
    gender: '',
    medications: '',
    insuranceProvider: '',
    emergencyContactName: '',
    emergencyContactPhone: ''
  });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadedPhone, setLoadedPhone] = useState('');

  useEffect(() => {
    if (!phone || phone.trim().length < 7) {
      setLoading(false);
      return;
    }
    
    if (phone === loadedPhone) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    fetch(`${API}/profile/${encodeURIComponent(phone)}`)
      .then(r => r.json())
      .then(d => {
        if (!active) return;
        if (d.profile) {
          const contact = (d.profile.contacts && d.profile.contacts[0]) || { name: '', phone: '' };
          setForm({
            bloodGroup: d.profile.bloodGroup || '',
            allergies: d.profile.allergies || '',
            conditions: d.profile.conditions || '',
            age: d.profile.age !== null && d.profile.age !== undefined ? String(d.profile.age) : '',
            gender: d.profile.gender || '',
            medications: d.profile.medications || '',
            insuranceProvider: d.profile.insuranceProvider || '',
            emergencyContactName: contact.name || '',
            emergencyContactPhone: contact.phone || ''
          });
          setLoadedPhone(phone);
        } else {
          if (loadedPhone) {
            setForm({
              bloodGroup: '',
              allergies: '',
              conditions: '',
              age: '',
              gender: '',
              medications: '',
              insuranceProvider: '',
              emergencyContactName: '',
              emergencyContactPhone: ''
            });
            setLoadedPhone('');
          }
        }
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [phone, loadedPhone]);

  const handleSave = async () => {
    if (!phone || phone.trim().length < 7) {
      alert("Please enter a valid phone number before saving your profile.");
      return;
    }
    
    const payload = {
      phoneNumber: phone,
      bloodGroup: form.bloodGroup,
      allergies: form.allergies,
      conditions: form.conditions,
      age: form.age ? parseInt(form.age, 10) : null,
      gender: form.gender,
      medications: form.medications,
      insuranceProvider: form.insuranceProvider,
      contacts: form.emergencyContactName || form.emergencyContactPhone 
        ? [{ name: form.emergencyContactName, phone: form.emergencyContactPhone }] 
        : []
    };

    try {
      const res = await fetch(`${API}/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        setLoadedPhone(phone);
      }
    } catch (err) {
      console.error("Failed to save profile:", err);
    }
  };

  if (loading) return <div className="locating-screen"><div className="radar-pulse">👤</div><p style={{ color: 'var(--text-muted)' }}>Loading profile…</p></div>;

  return (
    <div className="profile-container animate-up">
      <div className="profile-form-scroll" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '100px' }}>
        {/* Blood group selection */}
        <div className="profile-section-card">
          <h3 className="card-section-title"><Heart size={16} color="var(--accent)" /> Blood Group</h3>
          <div className="blood-group-grid">
            {BLOOD_GROUPS.map(bg => (
              <button 
                key={bg} 
                className={`blood-chip${form.bloodGroup === bg ? ' selected' : ''}`} 
                onClick={() => setForm(f => ({ ...f, bloodGroup: bg }))}
              >
                {bg}
              </button>
            ))}
          </div>
        </div>

        {/* Demographics / Personal Details */}
        <div className="profile-section-card">
          <h3 className="card-section-title"><User size={16} color="var(--accent)" /> Personal Details</h3>
          
          <div className="input-group" style={{ marginBottom: 12 }}>
            <label className="input-label">Phone Number</label>
            <input
              type="tel"
              className="input-field"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              autoComplete="tel"
            />
          </div>

          <div className="form-row-grid">
            <div className="form-col-50">
              <label className="input-label">Age</label>
              <input
                type="number"
                className="input-field"
                placeholder="e.g. 35"
                value={form.age}
                onChange={e => setForm(f => ({ ...f, age: e.target.value }))}
              />
            </div>
            <div className="form-col-50">
              <label className="input-label">Gender</label>
              <select
                className="input-field select-field"
                value={form.gender}
                onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
              >
                <option value="">Select Gender</option>
                {GENDERS.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Clinical Details */}
        <div className="profile-section-card">
          <h3 className="card-section-title"><ShieldAlert size={16} color="var(--accent)" /> Clinical Details</h3>
          <div className="input-group">
            <label className="input-label">Known Allergies</label>
            <input
              className="input-field"
              placeholder="e.g. Penicillin, Aspirin, Peanuts..."
              value={form.allergies}
              onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))}
            />
          </div>
          <div className="input-group" style={{ marginTop: 12 }}>
            <label className="input-label">Pre-existing Medical Conditions</label>
            <textarea
              className="input-field text-area-field"
              placeholder="e.g. Diabetes, Hypertension, Asthma..."
              value={form.conditions}
              onChange={e => setForm(f => ({ ...f, conditions: e.target.value }))}
              rows={2}
            />
          </div>
          <div className="input-group" style={{ marginTop: 12 }}>
            <label className="input-label">Current Medications</label>
            <input
              className="input-field"
              placeholder="e.g. Insulin, Metformin, Inhaler..."
              value={form.medications}
              onChange={e => setForm(f => ({ ...f, medications: e.target.value }))}
            />
          </div>
        </div>

        {/* Emergency Contact & Insurance */}
        <div className="profile-section-card">
          <h3 className="card-section-title"><Phone size={16} color="var(--accent)" /> Contacts & Insurance</h3>
          <div className="form-row-grid">
            <div className="form-col-50">
              <label className="input-label">Emergency Contact Name</label>
              <input
                className="input-field"
                placeholder="e.g. Jane Doe"
                value={form.emergencyContactName}
                onChange={e => setForm(f => ({ ...f, emergencyContactName: e.target.value }))}
              />
            </div>
            <div className="form-col-50">
              <label className="input-label">Emergency Contact Phone</label>
              <input
                type="tel"
                className="input-field"
                placeholder="e.g. +91 98765 43210"
                value={form.emergencyContactPhone}
                onChange={e => setForm(f => ({ ...f, emergencyContactPhone: e.target.value }))}
              />
            </div>
          </div>
          <div className="input-group" style={{ marginTop: 12 }}>
            <label className="input-label">Health Insurance Provider</label>
            <input
              className="input-field"
              placeholder="e.g. Star Health, HDFC Ergo..."
              value={form.insuranceProvider}
              onChange={e => setForm(f => ({ ...f, insuranceProvider: e.target.value }))}
            />
          </div>
        </div>

        {/* Privacy Note */}
        <div className="privacy-info-banner">
          <span>🛡️</span>
          <p>Your Medical ID is saved locally and encrypted. It is only shared securely with the assigned paramedic driver during active dispatches to ensure prepared care.</p>
        </div>

        {/* Save Bar */}
        <div className="profile-save-bar">
          <button className="btn btn-full btn-primary save-btn" onClick={handleSave}>
            <Save size={18} />
            {saved ? '✓ Profile Saved Successfully' : 'Save Emergency Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}
