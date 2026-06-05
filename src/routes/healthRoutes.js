const express = require('express');
const dns = require('dns');
const https = require('https');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const router = express.Router();
const DB_PATH = path.resolve(__dirname, '../../database.sqlite');
const TOKEN_PATH = path.resolve(__dirname, '../../config/token.json');

// Maximum allowed clock drift (in milliseconds) before triggering Read-Only mode
const MAX_DRIFT_MS = 30000;

// ─── Helper: Check internet connectivity ────────────────────────────────────
function checkInternet() {
  return new Promise((resolve) => {
    dns.lookup('google.com', (err) => {
      resolve(!err);
    });
  });
}

// ─── Helper: Check time sync via HTTP Date header ───────────────────────────
// Performs a lightweight HEAD request to https://google.com and compares the
// server's Date header against local time. Resolves false if drift > 30s.
// On network failure, resolves true so the "no internet" check handles it.
function checkTimeSync() {
  return new Promise((resolve) => {
    const req = https.request(
      'https://google.com',
      { method: 'HEAD', timeout: 5000 },
      (res) => {
        const serverDateStr = res.headers['date'];
        if (!serverDateStr) {
          // No Date header — can't determine drift, assume OK
          return resolve(true);
        }

        const serverTime = new Date(serverDateStr).getTime();
        const localTime = Date.now();
        const drift = Math.abs(localTime - serverTime);

        resolve(drift <= MAX_DRIFT_MS);
      }
    );

    req.on('timeout', () => {
      req.destroy();
      // Timeout = likely offline → let the internet check handle it
      resolve(true);
    });

    req.on('error', () => {
      // Network error = offline → resolve true so Priority 3 catches it
      resolve(true);
    });

    req.end();
  });
}

// ─── Helper: Check Google Drive API token exists ────────────────────────────
// Returns { ok: true } if config/token.json is present, { ok: false } if missing.
function checkApiToken() {
  const exists = fs.existsSync(TOKEN_PATH);
  return Promise.resolve({ ok: exists });
}

// ─── Helper: Check database integrity ───────────────────────────────────────
function checkDbIntegrity() {
  return new Promise((resolve) => {
    const checkDb = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
      if (err) return resolve({ ok: false, detail: err.message });
    });

    checkDb.get('PRAGMA integrity_check;', (err, row) => {
      checkDb.close();
      if (err) return resolve({ ok: false, detail: err.message });
      if (!row || row.integrity_check !== 'ok') {
        return resolve({ ok: false, detail: JSON.stringify(row) });
      }
      resolve({ ok: true, detail: 'ok' });
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/health
// Returns: { status, alertType, message, checks }
// ═══════════════════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const [apiToken, hasInternet, isTimeSynced, dbIntegrity] = await Promise.all([
      checkApiToken(),
      checkInternet(),
      checkTimeSync(),
      checkDbIntegrity(),
    ]);

    // ── Priority 0: Missing token.json → api_error (backup non-functional) ─
    if (!apiToken.ok) {
      return res.json({
        status: 'critical',
        alertType: 'api_error',
        message: '⛔ ไม่พบ config/token.json — กรุณารัน node generate-token.js เพื่อเชื่อมต่อ Google Drive',
        checks: { apiToken: false, internet: hasInternet, timeSync: isTimeSynced, dbIntegrity: dbIntegrity.ok },
      });
    }

    // ── Priority 1: Database corruption → CRITICAL ──────────────────────
    if (!dbIntegrity.ok) {
      return res.json({
        status: 'critical',
        alertType: 'db_corrupt',
        message: `⛔ ฐานข้อมูลเสียหาย (Database Corrupt): ${dbIntegrity.detail}`,
        checks: { apiToken: true, internet: hasInternet, timeSync: isTimeSynced, dbIntegrity: false },
      });
    }

    // ── Priority 2: Time desync → CRITICAL (triggers Read-Only mode) ────
    if (!isTimeSynced) {
      return res.json({
        status: 'critical',
        alertType: 'time_desync',
        message: '⛔ เวลาเครื่องไม่ตรง (Time Desync) — ระบบเข้าสู่โหมดอ่านอย่างเดียว',
        checks: { apiToken: true, internet: hasInternet, timeSync: false, dbIntegrity: true },
      });
    }

    // ── Priority 3: No internet → WARNING ───────────────────────────────
    if (!hasInternet) {
      return res.json({
        status: 'warning',
        alertType: 'no_internet',
        message: '⚠️ ไม่มีอินเตอร์เน็ต — ข้อมูลจะยังไม่สำรองขึ้น Cloud',
        checks: { apiToken: true, internet: false, timeSync: true, dbIntegrity: true },
      });
    }

    // ── All OK ──────────────────────────────────────────────────────────
    return res.json({
      status: 'ok',
      alertType: null,
      message: 'ระบบทำงานปกติ',
      checks: { apiToken: true, internet: true, timeSync: true, dbIntegrity: true },
    });
  } catch (err) {
    // ── Unexpected error → CRITICAL ─────────────────────────────────────
    return res.json({
      status: 'critical',
      alertType: 'api_error',
      message: `⛔ API Error: ${err.message}`,
      checks: { internet: false, timeSync: false, dbIntegrity: false },
    });
  }
});

module.exports = router;
