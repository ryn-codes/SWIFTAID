import { useState, useEffect, useRef } from 'react';
import { Phone, Mic, MicOff, VolumeX, AlertCircle, Loader2, Play, Square, Siren } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000/api';

export default function HomePage({ phone, setPhone, onNext, stats }) {
  const [isSilent, setIsSilent] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [detectedCategory, setDetectedCategory] = useState('');
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [voiceError, setVoiceError] = useState(null);
  const [selectedLang, setSelectedLang] = useState(() => {
    const navLang = navigator.language;
    if (navLang && navLang.toLowerCase().startsWith('en')) {
      return 'en-IN'; // Indian English is the default context
    }
    return navLang || 'en-IN';
  });

  const LANGUAGES = [
    { code: 'en-IN', label: 'English (India)' },
    { code: 'en-US', label: 'English (US)' },
    { code: 'en-GB', label: 'English (UK)' },
    { code: 'en-AU', label: 'English (Australia)' },
    { code: 'en-CA', label: 'English (Canada)' },
    { code: 'hi-IN', label: 'Hindi (हिंदी)' },
    { code: 'bn-IN', label: 'Bengali (বাংলা)' },
    { code: 'ta-IN', label: 'Tamil (தமிழ்)' },
    { code: 'te-IN', label: 'Telugu (తెలుగు)' },
    { code: 'es-ES', label: 'Spanish (Español)' },
    { code: 'fr-FR', label: 'French (Français)' },
    { code: 'ar-SA', label: 'Arabic (العربية)' },
  ];

  const mediaRecorderRef = useRef(null);
  const countdownRef = useRef(null);
  const transcriptRef = useRef('');
  const isCancelledRef = useRef(false);
  const silenceTimeoutRef = useRef(null);
  const initialSilenceTimeoutRef = useRef(null);

  const audioContextRef = useRef(null);
  const analyserNodeRef = useRef(null);
  const audioStreamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const chunksRef = useRef([]);
  const volumeBarRef = useRef(null);
  const visualizerBarsRef = useRef(null);

  const cleanupVisualizer = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  const cleanupAudio = () => {
    cleanupVisualizer();
    if (initialSilenceTimeoutRef.current) clearTimeout(initialSilenceTimeoutRef.current);
    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.error("Stop recorder error:", err);
      }
    }
    mediaRecorderRef.current = null;

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }

    if (audioContextRef.current) {
      if (audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      audioContextRef.current = null;
    }
    analyserNodeRef.current = null;
  };

  useEffect(() => {
    return () => {
      cleanupAudio();
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  useEffect(() => {
    if (isListening) {
      startListening();
    }
  }, [selectedLang]);

  const startVolumeCheckLoop = () => {
    if (!analyserNodeRef.current) return;

    const dataArray = new Uint8Array(analyserNodeRef.current.frequencyBinCount);
    let silenceStart = null;
    const SILENCE_THRESHOLD = 8; // Low frequency amplitude threshold
    const SILENCE_DURATION_MS = 3200; // Auto-stop after 3.2s of silence

    const checkVolume = () => {
      if (!analyserNodeRef.current) return;
      analyserNodeRef.current.getByteFrequencyData(dataArray);

      // Average frequency volume
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;

      // Realtime Volume scale for UI pulse
      const volPct = Math.min(1, average / 128);
      if (volumeBarRef.current) {
        volumeBarRef.current.style.transform = `scale(${1 + volPct * 0.45})`;
      }

      // Equalizer bars animation
      if (visualizerBarsRef.current) {
        const bars = visualizerBarsRef.current.children;
        for (let i = 0; i < bars.length; i++) {
          const freqValue = dataArray[i % dataArray.length] || 0;
          const heightPct = Math.max(10, (freqValue / 255) * 100);
          bars[i].style.height = `${heightPct}%`;
        }
      }

      // Silence Detection
      if (average < SILENCE_THRESHOLD) {
        if (silenceStart === null) {
          silenceStart = Date.now();
        } else if (Date.now() - silenceStart > SILENCE_DURATION_MS) {
          console.log(`Silence detected for ${SILENCE_DURATION_MS}ms. Stopping recording...`);
          stopListening();
          return;
        }
      } else {
        silenceStart = null; // reset silence timer when voice is detected
      }

      animationFrameRef.current = requestAnimationFrame(checkVolume);
    };

    animationFrameRef.current = requestAnimationFrame(checkVolume);
  };

  const startListening = async () => {
    if (!phone || phone.trim().length < 7) {
      alert("Please enter your phone number first.");
      return;
    }
    // Clean up any existing instances
    cleanupAudio();

    setIsListening(true);
    setVoiceTranscript('');
    setDetectedCategory('');
    setVoiceError(null);
    setCountdown(null);
    setShowVoiceModal(true);
    isCancelledRef.current = false;
    chunksRef.current = [];

    try {
      // 1. Request microphone stream with voice-optimized constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      audioStreamRef.current = stream;

      // 2. Setup Web Audio API Analyser for Visualizer & Silence Detection
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64; // Small fftSize is perfect for live volume/frequencies
      analyserNodeRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      // Start volume check & visualizer loop
      startVolumeCheckLoop();

      // 3. Setup MediaRecorder
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/ogg';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = ''; // Let browser choose default
          }
        }
      }

      const recorderOptions = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all track inputs so the red recording dot disappears
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach(track => track.stop());
        }

        cleanupVisualizer();

        if (isCancelledRef.current) {
          setIsListening(false);
          return;
        }

        // Process recorded audio
        const finalMime = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(chunksRef.current, { type: finalMime });
        
        if (audioBlob.size < 1000) { // Check if audio is too short/empty
          console.warn("Recorded audio blob is too small.");
          setVoiceError('no-speech');
          setIsListening(false);
          return;
        }

        // Convert audio Blob to Base64
        setIsProcessingVoice(true);
        setIsListening(false);
        
        try {
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
            const base64Data = reader.result.split(',')[1];
            handleParseVoiceAudio(base64Data, finalMime);
          };
        } catch (err) {
          console.error("Base64 conversion failed:", err);
          setVoiceError('conversion-failed');
          setIsProcessingVoice(false);
        }
      };

      // 4. Start recording!
      mediaRecorder.start();

      // Set a hard timeout of 15 seconds to prevent extremely large audio submissions
      initialSilenceTimeoutRef.current = setTimeout(() => {
        console.log("Maximum audio recording limit (15s) reached. Auto-stopping...");
        stopListening();
      }, 15000);

    } catch (err) {
      console.error("Mic access or recorder setup failed:", err);
      setVoiceError(err.name === 'NotAllowedError' ? 'not-allowed' : 'unknown');
      setIsListening(false);
    }
  };

  const stopListening = () => {
    cleanupVisualizer();
    if (initialSilenceTimeoutRef.current) clearTimeout(initialSilenceTimeoutRef.current);
    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.error("Stop recorder error in stopListening:", err);
      }
    }
  };

  const handleParseVoiceAudio = async (base64Audio, mimeType) => {
    setIsProcessingVoice(true);
    setVoiceError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/triage/voice-parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio: base64Audio,
          mimeType,
          langHint: selectedLang
        })
      });

      if (response.ok) {
        const data = await response.json();
        setVoiceTranscript(data.transcript);
        transcriptRef.current = data.transcript;
        
        if (!data.transcript || data.transcript.trim() === '') {
          setVoiceError('no-speech');
          return;
        }

        setDetectedCategory(data.emergencyType);
        
        let count = 4;
        setCountdown(count);
        countdownRef.current = setInterval(() => {
          count -= 1;
          if (count <= 0) {
            clearInterval(countdownRef.current);
            setShowVoiceModal(false);
            onNext(isSilent, data.transcript, data.emergencyType);
          } else {
            setCountdown(count);
          }
        }, 1000);
      } else {
        const errorData = await response.json();
        console.error("Voice parse error from server:", errorData);
        setVoiceError('server-failed');
      }
    } catch (err) {
      console.error("Voice parse API exception:", err);
      setVoiceError('network-error');
    } finally {
      setIsProcessingVoice(false);
    }
  };

  const handleParseVoiceTriage = async (text) => {
    setIsProcessingVoice(true);
    try {
      const r = await fetch(`${API_BASE_URL}/triage/voice-parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (r.ok) {
        const data = await r.json();
        setDetectedCategory(data.emergencyType);
        
        let count = 4;
        setCountdown(count);
        countdownRef.current = setInterval(() => {
          count -= 1;
          if (count <= 0) {
            clearInterval(countdownRef.current);
            setShowVoiceModal(false);
            onNext(isSilent, text, data.emergencyType);
          } else {
            setCountdown(count);
          }
        }, 1000);
      } else {
        alert("Failed to categorize voice triage. Proceeding with standard dispatch.");
        handleCancelVoice();
        onNext(isSilent, text, 'Other / Not Sure');
      }
    } catch (err) {
      console.error("Voice parse triage error:", err);
      alert("Error parsing voice. Proceeding with standard dispatch.");
      handleCancelVoice();
      onNext(isSilent, text, 'Other / Not Sure');
    } finally {
      setIsProcessingVoice(false);
    }
  };

  const handleCancelVoice = () => {
    isCancelledRef.current = true;
    cleanupAudio();
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(null);
    setIsListening(false);
    setVoiceTranscript('');
    setDetectedCategory('');
    setVoiceError(null);
    setShowVoiceModal(false);
  };

  const handleForceDispatch = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setShowVoiceModal(false);
    onNext(isSilent, voiceTranscript, detectedCategory || 'Other / Not Sure');
  };

  const handleSubmit = (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (phone.trim().length >= 7) onNext(isSilent);
  };

  return (
    <div className="animate-up">
      {/* Hero */}
      <div className="home-hero">
        <p className="hero-greeting">SWIFTAID EMERGENCY NETWORK</p>
        <h1 className="hero-title">Help is one<br/>tap away.</h1>
      </div>

      {/* Phone input row */}
      <div className="phone-row-container">
        <div className="phone-input-wrap">
          <Phone className="phone-input-icon" size={18} />
          <input
            type="tel"
            className="phone-input-field"
            placeholder="+91 98765 43210"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            autoComplete="tel"
          />
        </div>
      </div>

      {/* Silent mode Switcher */}
      <div className="silent-card-wrap">
        <div className={`silent-card-toggle ${isSilent ? 'active' : ''}`} onClick={() => setIsSilent(!isSilent)}>
          <div className="silent-toggle-info">
            <VolumeX size={20} className="silent-icon" />
            <div className="silent-text-content">
              <p className="silent-title">Silent SOS Mode</p>
              <p className="silent-subtitle">Mutes sirens & disguises tracking screen</p>
            </div>
          </div>
          <div className={`switch-toggle ${isSilent ? 'active' : ''}`}>
            <div className="switch-knob" />
          </div>
        </div>

        {isSilent && (
          <div className="silent-warning-box">
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <p>
              <strong>Undercover Protection:</strong> This option triggers dispatch silently, and hides Map details with a fake news dashboard to protect you from local threats.
            </p>
          </div>
        )}
      </div>

      {/* SOS Button & Voice Button Row */}
      <div className="sos-buttons-section">
        <div className="sos-grid-wrap">
          <button
            className="sos-card-btn sos-dispatch-btn"
            onClick={handleSubmit}
            disabled={phone.trim().length < 7}
          >
            <div className="sos-btn-icon-wrap">
              <Siren size={30} className="sos-btn-icon" />
            </div>
            <div className="sos-btn-label">
              <span className="bold-label">SOS</span>
              <span className="bold-label">Dispatch</span>
            </div>
            <span className="sos-btn-sub">Tap to Dispatch</span>
          </button>
          
          <button
            className="sos-card-btn voice-sos-btn"
            onClick={startListening}
            disabled={phone.trim().length < 7}
          >
            <div className="sos-btn-icon-wrap">
              <Mic size={30} className="sos-btn-icon" />
            </div>
            <div className="sos-btn-label">
              <span className="bold-label">Voice</span>
              <span className="bold-label">SOS</span>
            </div>
            <span className="sos-btn-sub">Describe Emergency</span>
          </button>
        </div>
        <span className="sos-hint-text">Enter your phone first, then select SOS method</span>
      </div>

      {/* Stats Counter Widgets */}
      <div className="stats-counter-row">
        <div className="stat-counter-card">
          <span className="stat-counter-number">{stats.ambulances || 906}</span>
          <span className="stat-counter-label">Units Ready</span>
        </div>
        <div className="stat-counter-card">
          <span className="stat-counter-number">{stats.hospitals || 50}</span>
          <span className="stat-counter-label">Hospitals</span>
        </div>
        <div className="stat-counter-card">
          <span className="stat-counter-number">&lt;30s</span>
          <span className="stat-counter-label">Avg Dispatch</span>
        </div>
      </div>

      {/* How it works */}
      <div className="how-it-works-section">
        <p className="how-it-works-title">HOW IT WORKS</p>
        <div className="how-it-works-list">
          <div className="how-it-works-item">
            <span className="how-it-works-icon">🎙️</span>
            <div className="how-it-works-content">
              <p className="how-it-works-header">Voice SOS & AI Triage</p>
              <p className="how-it-works-desc">Speak your situation naturally. Our AI parses accents instantly to identify symptoms and guide dispatch.</p>
            </div>
          </div>
          <div className="how-it-works-item">
            <span className="how-it-works-icon">🤫</span>
            <div className="how-it-works-content">
              <p className="how-it-works-header">Silent SOS Protection</p>
              <p className="how-it-works-desc">Mute sirens, disguise tracking screens as wellness news, and chat securely in unsafe situations.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Voice Triage Modal Overlay */}
      {showVoiceModal && (
        <div className="modal-overlay active" style={{ zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(2, 6, 23, 0.75)' }}>
          <div className="modal-sheet animate-slide-up" style={{ padding: '24px 20px', width: '100%', maxWidth: 430, borderTopLeftRadius: 'var(--radius-lg)', borderTopRightRadius: 'var(--radius-lg)' }} onClick={e => e.stopPropagation()}>
            {/* Language/Accent Selector pills */}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => setSelectedLang(lang.code)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 99,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    border: '1px solid ' + (selectedLang === lang.code ? 'var(--blue)' : 'var(--border)'),
                    background: selectedLang === lang.code ? 'rgba(59, 130, 246, 0.12)' : 'var(--bg-elevated)',
                    color: selectedLang === lang.code ? 'var(--blue)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {lang.label}
                </button>
              ))}
            </div>

            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div ref={volumeBarRef} className="voice-triage-pulse-wrap" style={{
                position: 'relative',
                width: 72,
                height: 72,
                margin: '0 auto 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                background: isListening 
                  ? 'rgba(239, 68, 68, 0.15)' 
                  : voiceError 
                    ? 'rgba(239, 68, 68, 0.15)' 
                    : 'rgba(59, 130, 246, 0.15)',
                transition: 'transform 0.08s ease'
              }}>
                {isListening && (
                  <div className="voice-pulse-ring" style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    border: '2px solid var(--accent)',
                    animation: 'pulse-ring 1.5s infinite'
                  }} />
                )}
                {isListening ? (
                  <Mic size={32} color="var(--accent)" />
                ) : isProcessingVoice ? (
                  <Loader2 size={32} color="var(--blue)" className="spinner-icon" />
                ) : voiceError ? (
                  <MicOff size={32} color="var(--accent)" />
                ) : (
                  <Play size={32} color="var(--green)" />
                )}
              </div>
              
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: voiceError ? 'var(--accent)' : 'var(--text)' }}>
                {isListening 
                  ? 'Listening for Emergency…' 
                  : isProcessingVoice 
                    ? 'Analyzing symptoms…' 
                    : voiceError 
                      ? 'Speech Input Failed' 
                      : 'AI Triage Confirmed'}
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
                {isListening 
                  ? 'Describe the situation (e.g. chest pain, breathing difficulty)' 
                  : isProcessingVoice 
                    ? 'Keywords being mapped to guidelines' 
                    : voiceError 
                      ? (voiceError === 'not-allowed' 
                          ? 'Microphone access denied. Please allow microphone permissions.' 
                          : voiceError === 'no-speech' 
                            ? 'No speech detected. Please speak closer or try again.' 
                            : 'Could not connect to voice service. Check internet connection.') 
                      : 'Preparing dispatch details'}
              </p>

              {isListening && (
                <div ref={visualizerBarsRef} className="equalizer-wrap">
                  <div className="equalizer-bar"></div>
                  <div className="equalizer-bar"></div>
                  <div className="equalizer-bar"></div>
                  <div className="equalizer-bar"></div>
                  <div className="equalizer-bar"></div>
                  <div className="equalizer-bar"></div>
                  <div className="equalizer-bar"></div>
                  <div className="equalizer-bar"></div>
                  <div className="equalizer-bar"></div>
                </div>
              )}
            </div>

            {/* Transcript Preview / Editable Input */}
            <div style={{ marginBottom: 20 }}>
              <textarea
                className="input-field"
                value={voiceTranscript}
                onChange={(e) => {
                  setVoiceTranscript(e.target.value);
                  transcriptRef.current = e.target.value;
                }}
                placeholder="Type or speak details (e.g. chest pain, accident, breathing trouble)..."
                disabled={isProcessingVoice}
                style={{
                  width: '100%',
                  minHeight: 80,
                  maxHeight: 120,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '12px',
                  color: 'var(--text)',
                  fontSize: '0.95rem',
                  fontWeight: 500,
                  lineHeight: 1.4,
                  textAlign: 'center',
                  resize: 'none',
                  outline: 'none',
                  transition: 'border 0.2s',
                  fontFamily: 'inherit'
                }}
              />
            </div>

            {/* Triage Outcome */}
            {detectedCategory && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                background: 'var(--green-glow)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 'var(--radius-sm)',
                padding: '14px',
                marginBottom: 24,
                animation: 'fadeIn 0.25s ease'
              }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--green)' }}>Detected Emergency Type</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc' }}>🚨 {detectedCategory}</span>
                {countdown !== null && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Auto dispatching in <strong style={{ color: 'var(--accent)', fontSize: '1rem' }}>{countdown}s</strong>...
                  </p>
                )}
              </div>
            )}

            {/* Modal Controls */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={handleCancelVoice}>
                Cancel
              </button>
              
              {isListening && (
                <button className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={stopListening}>
                  <Square size={16} /> Stop Recording
                </button>
              )}

              {(detectedCategory || (!isListening && voiceTranscript.trim().length > 0)) && (
                <button 
                  className="btn btn-primary" 
                  style={{ flex: 1 }} 
                  onClick={() => {
                    if (detectedCategory) {
                      handleForceDispatch();
                    } else {
                      handleParseVoiceTriage(voiceTranscript.trim());
                    }
                  }}
                  disabled={isProcessingVoice}
                >
                  {isProcessingVoice 
                    ? 'Processing…' 
                    : detectedCategory 
                      ? 'Dispatch Now' 
                      : 'Parse Symptoms'}
                </button>
              )}

              {voiceError && !detectedCategory && !isListening && (
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={startListening}>
                  Retry Mic
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
