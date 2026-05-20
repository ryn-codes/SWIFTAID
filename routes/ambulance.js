const express = require('express');
const router = express.Router();
const { requestAmbulance, getAmbulances, getRequestStatus, updateEmergencyType } = require('../controllers/ambulanceController');
const { getProfile, upsertProfile, getHistory } = require('../controllers/profileController');

router.get('/ambulances', getAmbulances);
router.post('/request-ambulance', requestAmbulance);
router.get('/request-status/:id', getRequestStatus);
router.patch('/request/:id/emergency', updateEmergencyType);
router.get('/profile/:phone', getProfile);
router.post('/profile', upsertProfile);
router.get('/history/:phone', getHistory);

module.exports = router;
