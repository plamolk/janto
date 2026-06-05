const express = require('express');
const path = require('path');
const cors = require('cors');
const db = require('./src/database/db');
const backupService = require('./src/services/backupService');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

const customerRoutes = require('./src/routes/customerRoutes');
const visitRoutes = require('./src/routes/visitRoutes');
const companyRoutes = require('./src/routes/companyRoutes');
const billingRoutes = require('./src/routes/billingRoutes');
const healthRoutes = require('./src/routes/healthRoutes');

app.use('/api/customers', customerRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/health', healthRoutes);

app.listen(PORT, () => {
  console.log(`Optical Clinic Local API listening on port ${PORT}`);

  // ─── Phase 2: Startup Verification Log ────────────────────────────
  db.getDbVersion()
    .then((version) => {
      console.log('🟢 Current Database Version:', version);
    })
    .catch((err) => {
      console.error('🔴 Failed to read database version:', err.message);
    });

  // ─── Phase 4: Arm the Midnight Janitor ────────────────────────────
  backupService.scheduleMidnightJanitor();
});
