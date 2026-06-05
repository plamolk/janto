// ═══════════════════════════════════════════════════════════════════════════
// Phase 3 & 4 — Backup Engine + Midnight Janitor
// Phase 3: 15-Sec Debounce → Integrity Check → Zip → Google Drive Upload
// Phase 4: Midnight Scheduler → Daily Snapshot → GFS Smart Pruning
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { ZipArchive } = require('archiver');
const sqlite3 = require('sqlite3').verbose();
const { google } = require('googleapis');

// ─── Paths ──────────────────────────────────────────────────────────────────
const DB_PATH = path.resolve(__dirname, '../../database.sqlite');
const BACKUP_ZIP_PATH = path.resolve(__dirname, '../../backup_today.zip');
const CREDENTIALS_PATH = path.resolve(__dirname, '../../config/credentials.json');
const TOKEN_PATH = path.resolve(__dirname, '../../config/token.json');

// TODO: Set your Google Drive Folder ID here after creating the target folder
const DRIVE_FOLDER_ID = '18jS4ljnM2EgB5z0wCI8tRzANHPHlIu8j';

// ─── Debounce State ─────────────────────────────────────────────────────────
let debounceTimer = null;
const DEBOUNCE_MS = 15_000; // 15 seconds (Rule #1)

// ─── Midnight Janitor State ─────────────────────────────────────────────────
const DAY_MS = 24 * 60 * 60 * 1000; // 86 400 000 ms

// ═══════════════════════════════════════════════════════════════════════════
// Function 1 — checkIntegrity()
// Opens a SEPARATE read-only connection and runs PRAGMA integrity_check.
// Rejects if the database is corrupted so we never back up bad data.
// ═══════════════════════════════════════════════════════════════════════════
function checkIntegrity() {
  return new Promise((resolve, reject) => {
    const checkDb = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
      if (err) return reject(new Error(`Integrity DB open failed: ${err.message}`));
    });

    checkDb.get('PRAGMA integrity_check;', (err, row) => {
      checkDb.close(); // always close the disposable connection

      if (err) return reject(new Error(`Integrity PRAGMA failed: ${err.message}`));

      if (!row || row.integrity_check !== 'ok') {
        return reject(
          new Error(`🔴 Integrity check FAILED: ${JSON.stringify(row)}`)
        );
      }

      console.log('✅ Integrity check passed');
      resolve();
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Function 2 — compressDatabase()
// Uses `archiver` to zip database.sqlite → backup_today.zip
// ═══════════════════════════════════════════════════════════════════════════
function compressDatabase() {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(BACKUP_ZIP_PATH);
    const archive = new ZipArchive({ zlib: { level: 9 } }); // max compression

    output.on('close', () => {
      const sizeMB = (archive.pointer() / (1024 * 1024)).toFixed(2);
      console.log(`📦 Backup compressed: backup_today.zip (${sizeMB} MB)`);
      resolve();
    });

    archive.on('error', (err) => {
      reject(new Error(`Compression failed: ${err.message}`));
    });

    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        console.warn('⚠️ Archiver warning:', err.message);
      } else {
        reject(new Error(`Compression warning (fatal): ${err.message}`));
      }
    });

    archive.pipe(output);
    archive.file(DB_PATH, { name: 'database.sqlite' });
    archive.finalize();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Function 3 — uploadToDrive()
// Authenticates via OAuth2 using config/credentials.json + config/token.json,
// then uploads backup_today.zip to Google Drive.
// ═══════════════════════════════════════════════════════════════════════════
function uploadToDrive() {
  return new Promise((resolve, reject) => {
    // ── Guard: skip upload if credentials aren't configured yet ──────────
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      console.warn('⚠️ config/credentials.json not found — skipping Drive upload');
      return resolve();
    }

    let credentialsRaw;
    try {
      credentialsRaw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
    } catch (parseErr) {
      console.warn('⚠️ credentials.json is empty or invalid — skipping Drive upload');
      return resolve();
    }

    // If credentials.json is an empty object {}, skip gracefully
    const credKeys = credentialsRaw.installed || credentialsRaw.web;
    if (!credKeys) {
      console.warn('⚠️ credentials.json has no "installed" or "web" key — skipping Drive upload');
      return resolve();
    }

    const { client_id, client_secret, redirect_uris } = credKeys;
    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0]
    );

    // ── Load saved token ────────────────────────────────────────────────
    if (!fs.existsSync(TOKEN_PATH)) {
      console.warn('⚠️ config/token.json not found — skipping Drive upload');
      return resolve();
    }

    let tokenRaw;
    try {
      tokenRaw = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    } catch (parseErr) {
      console.warn('⚠️ token.json is empty or invalid — skipping Drive upload');
      return resolve();
    }

    if (!tokenRaw.access_token) {
      console.warn('⚠️ token.json has no access_token — skipping Drive upload');
      return resolve();
    }

    oAuth2Client.setCredentials(tokenRaw);

    const drive = google.drive({ version: 'v3', auth: oAuth2Client });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `janto_backup_${timestamp}.zip`;

    const fileMetadata = {
      name: fileName,
      ...(DRIVE_FOLDER_ID ? { parents: [DRIVE_FOLDER_ID] } : {}),
    };

    const media = {
      mimeType: 'application/zip',
      body: fs.createReadStream(BACKUP_ZIP_PATH),
    };

    drive.files.create(
      {
        resource: fileMetadata,
        media: media,
        fields: 'id, name, size',
      },
      (err, response) => {
        if (err) {
          return reject(new Error(`Drive upload failed: ${err.message}`));
        }

        const { id, name, size } = response.data;
        const sizeMB = (parseInt(size, 10) / (1024 * 1024)).toFixed(2);
        console.log(`☁️  Uploaded to Google Drive: ${name} (${sizeMB} MB) [ID: ${id}]`);
        resolve(response.data);
      }
    );
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Function 4 — triggerBackup()   ★ MAIN EXPORTED FUNCTION ★
// Implements a 15-second debounce (Rule #1). Multiple rapid calls only
// result in ONE backup after 15 seconds of quiet.
// Sequence: checkIntegrity() → compressDatabase() → uploadToDrive()
// ═══════════════════════════════════════════════════════════════════════════
function triggerBackup() {
  // Clear any pending debounce timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  console.log('⏳ Backup debounce started — waiting 15 seconds...');

  debounceTimer = setTimeout(async () => {
    debounceTimer = null;
    const startTime = Date.now();

    console.log('🚀 Backup sequence initiated');

    try {
      // Step 1 — Integrity
      await checkIntegrity();

      // Step 2 — Compress
      await compressDatabase();

      // Step 3 — Upload
      await uploadToDrive();

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`🟢 Backup complete in ${elapsed}s`);
    } catch (err) {
      console.error('🔴 Backup FAILED:', err.message);
      // Error is caught and logged — server keeps running
    }
  }, DEBOUNCE_MS);
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 4 — compressDatabaseDated()
// Creates a dated zip: backup_YYYY_MM_DD.zip (for the midnight daily snapshot)
// ═══════════════════════════════════════════════════════════════════════════
function compressDatabaseDated() {
  return new Promise((resolve, reject) => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const datedName = `backup_${yyyy}_${mm}_${dd}.zip`;
    const datedPath = path.resolve(__dirname, `../../${datedName}`);

    const output = fs.createWriteStream(datedPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on('close', () => {
      const sizeMB = (archive.pointer() / (1024 * 1024)).toFixed(2);
      console.log(`📦 Daily snapshot compressed: ${datedName} (${sizeMB} MB)`);
      resolve({ fileName: datedName, filePath: datedPath });
    });

    archive.on('error', (err) => {
      reject(new Error(`Daily snapshot compression failed: ${err.message}`));
    });

    archive.pipe(output);
    archive.file(DB_PATH, { name: 'database.sqlite' });
    archive.finalize();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 4 — uploadDatedToDrive(fileName)
// Uploads a dated snapshot zip to Google Drive using the existing auth logic.
// ═══════════════════════════════════════════════════════════════════════════
function uploadDatedToDrive(fileName, filePath) {
  return new Promise((resolve, reject) => {
    // ── Guard: skip if credentials aren't configured ────────────────────
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      console.warn('⚠️ credentials.json not found — skipping dated Drive upload');
      return resolve();
    }

    let credentialsRaw;
    try {
      credentialsRaw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
    } catch (_) {
      console.warn('⚠️ credentials.json invalid — skipping dated Drive upload');
      return resolve();
    }

    const credKeys = credentialsRaw.installed || credentialsRaw.web;
    if (!credKeys) {
      console.warn('⚠️ credentials.json not configured — skipping dated Drive upload');
      return resolve();
    }

    const { client_id, client_secret, redirect_uris } = credKeys;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    if (!fs.existsSync(TOKEN_PATH)) {
      console.warn('⚠️ token.json not found — skipping dated Drive upload');
      return resolve();
    }

    let tokenRaw;
    try {
      tokenRaw = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    } catch (_) {
      console.warn('⚠️ token.json invalid — skipping dated Drive upload');
      return resolve();
    }

    if (!tokenRaw.access_token) {
      console.warn('⚠️ token.json has no access_token — skipping dated Drive upload');
      return resolve();
    }

    oAuth2Client.setCredentials(tokenRaw);
    const drive = google.drive({ version: 'v3', auth: oAuth2Client });

    const fileMetadata = {
      name: fileName,
      ...(DRIVE_FOLDER_ID ? { parents: [DRIVE_FOLDER_ID] } : {}),
    };

    const media = {
      mimeType: 'application/zip',
      body: fs.createReadStream(filePath),
    };

    drive.files.create(
      { resource: fileMetadata, media, fields: 'id, name, size' },
      (err, response) => {
        if (err) return reject(new Error(`Dated Drive upload failed: ${err.message}`));
        const { id, name, size } = response.data;
        const sizeMB = (parseInt(size, 10) / (1024 * 1024)).toFixed(2);
        console.log(`☁️  Daily snapshot uploaded: ${name} (${sizeMB} MB) [ID: ${id}]`);
        resolve(response.data);
      }
    );
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 4 — pruneOldBackups()  (GFS Retention — Rule #2)
// Grandfather-Father-Son smart pruning:
//   • Daily  : keep files from the last 30 days
//   • Monthly: keep only last-day-of-month files (up to 12 months)
//   • Yearly : keep only Dec 31st files (anything older than 1 year)
// ═══════════════════════════════════════════════════════════════════════════
function pruneOldBackups(fileNames) {
  // If no list provided, scan the project root for backup_YYYY_MM_DD.zip files
  if (!fileNames) {
    const rootDir = path.resolve(__dirname, '../../');
    try {
      fileNames = fs.readdirSync(rootDir).filter((f) =>
        /^backup_\d{4}_\d{2}_\d{2}\.zip$/.test(f)
      );
    } catch (err) {
      console.error('🔴 pruneOldBackups: Failed to read directory:', err.message);
      return { keep: [], delete: [] };
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const keep = [];
  const toDelete = [];

  // ── Helper: parse "backup_YYYY_MM_DD.zip" → Date ──────────────────────
  function parseBackupDate(fileName) {
    const match = fileName.match(/^backup_(\d{4})_(\d{2})_(\d{2})\.zip$/);
    if (!match) return null;
    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
  }

  // ── Helper: is this date the last day of its month? ───────────────────
  function isLastDayOfMonth(date) {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    return nextDay.getDate() === 1; // rolled over to the 1st = was last day
  }

  // ── Helper: is this Dec 31? ───────────────────────────────────────────
  function isLastDayOfYear(date) {
    return date.getMonth() === 11 && date.getDate() === 31;
  }

  // ── Classify each file ────────────────────────────────────────────────
  for (const fileName of fileNames) {
    const fileDate = parseBackupDate(fileName);
    if (!fileDate) {
      console.warn(`⚠️ Skipping unrecognized file: ${fileName}`);
      continue;
    }

    const ageMs = today.getTime() - fileDate.getTime();
    const ageDays = Math.floor(ageMs / DAY_MS);

    // Rule 1 — Daily: keep everything from last 30 days
    if (ageDays <= 30) {
      keep.push(fileName);
      console.log(`  ✅ KEEP (daily, ${ageDays}d old): ${fileName}`);
      continue;
    }

    // Rule 2 — Monthly: 31–365 days old → keep only last-day-of-month
    if (ageDays <= 365) {
      if (isLastDayOfMonth(fileDate)) {
        keep.push(fileName);
        console.log(`  ✅ KEEP (monthly, last day of month, ${ageDays}d old): ${fileName}`);
      } else {
        toDelete.push(fileName);
        console.log(`  🗑️  DELETE (monthly, not last day of month, ${ageDays}d old): ${fileName}`);
      }
      continue;
    }

    // Rule 3 — Yearly: older than 365 days → keep only Dec 31
    if (isLastDayOfYear(fileDate)) {
      keep.push(fileName);
      console.log(`  ✅ KEEP (yearly, Dec 31, ${ageDays}d old): ${fileName}`);
    } else {
      toDelete.push(fileName);
      console.log(`  🗑️  DELETE (yearly, not Dec 31, ${ageDays}d old): ${fileName}`);
    }
  }

  console.log(`\n📊 Pruning summary: ${keep.length} kept, ${toDelete.length} to delete`);
  return { keep, delete: toDelete };
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 4 — runMidnightJanitor()
// Executes at 00:00 daily.
// Step A: Create a dated daily snapshot & upload.
// Step B: Prune old backups using GFS rules.
// ═══════════════════════════════════════════════════════════════════════════
async function runMidnightJanitor() {
  const startTime = Date.now();
  console.log('\n🌙 ══════════════════════════════════════════════════════════');
  console.log('🌙 Midnight Janitor started at', new Date().toLocaleString());
  console.log('🌙 ══════════════════════════════════════════════════════════');

  try {
    // ── Step A: Daily Snapshot ─────────────────────────────────────────
    console.log('\n📸 Step A — Creating daily snapshot...');
    await checkIntegrity();
    const { fileName, filePath } = await compressDatabaseDated();
    await uploadDatedToDrive(fileName, filePath);
    console.log('📸 Daily snapshot complete');

    // ── Step B: GFS Pruning ───────────────────────────────────────────
    console.log('\n🧹 Step B — Running GFS smart pruning...');
    const result = pruneOldBackups();

    // TODO: When Google Drive is connected, use drive.files.delete()
    // to actually delete the pruned files from Drive.
    // For now, we log what WOULD be deleted.
    if (result.delete.length > 0) {
      console.log('\n🧹 Files that WOULD be deleted from Drive (pending API connection):');
      result.delete.forEach((f) => console.log(`   🗑️  ${f}`));
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n🌙 Midnight Janitor finished in ${elapsed}s`);
    console.log('🌙 ══════════════════════════════════════════════════════════\n');
  } catch (err) {
    console.error('🔴 Midnight Janitor FAILED:', err.message);
    // Error is caught — server keeps running
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 4 — scheduleMidnightJanitor()
// Calculates the exact ms until next 00:00:00, fires setTimeout once,
// then wraps in a 24-hour setInterval for subsequent nights.
// ═══════════════════════════════════════════════════════════════════════════
function scheduleMidnightJanitor() {
  const now = new Date();

  // Calculate next midnight (00:00:00.000 tomorrow)
  const nextMidnight = new Date(now);
  nextMidnight.setDate(nextMidnight.getDate() + 1);
  nextMidnight.setHours(0, 0, 0, 0);

  const msUntilMidnight = nextMidnight.getTime() - now.getTime();
  const hoursUntil = (msUntilMidnight / (1000 * 60 * 60)).toFixed(2);

  console.log(`🕛 Midnight Janitor scheduled — next run in ${hoursUntil} hours (${nextMidnight.toLocaleString()})`);

  // First run: wait until midnight
  setTimeout(() => {
    runMidnightJanitor();

    // Subsequent runs: every 24 hours
    setInterval(() => {
      runMidnightJanitor();
    }, DAY_MS);
  }, msUntilMidnight);
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════
module.exports = {
  triggerBackup,
  checkIntegrity,
  compressDatabase,
  compressDatabaseDated,
  uploadToDrive,
  uploadDatedToDrive,
  pruneOldBackups,
  runMidnightJanitor,
  scheduleMidnightJanitor,
};
