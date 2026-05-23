const express = require('express');
const router = express.Router();
const { 
  requestAmbulance, 
  getAmbulances, 
  getRequestStatus, 
  updateEmergencyType, 
  completeEmergencyRequest,
  parseVoiceTriage,
  sendChatMessage,
  getChatMessages,
  verifyOTP
} = require('../controllers/ambulanceController');
const { getProfile, upsertProfile, getHistory } = require('../controllers/profileController');

router.get('/ambulances', getAmbulances);
router.post('/request-ambulance', requestAmbulance);
router.get('/request-status/:id', getRequestStatus);
router.patch('/request/:id/emergency', updateEmergencyType);
router.patch('/request/:id/complete', completeEmergencyRequest);
router.post('/request/:id/verify-otp', verifyOTP);
router.get('/profile/:phone', getProfile);
router.post('/profile', upsertProfile);
router.get('/history/:phone', getHistory);

// Accessibility and Friction Reduction Features
router.post('/triage/voice-parse', parseVoiceTriage);
router.post('/request/:id/chat', sendChatMessage);
router.get('/request/:id/chat', getChatMessages);

module.exports = router;
