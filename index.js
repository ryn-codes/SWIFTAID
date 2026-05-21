const express = require('express');
const cors = require('cors');
const app = express();
const ambulanceRoutes = require('./routes/ambulance');
require('dotenv').config();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/api', ambulanceRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
