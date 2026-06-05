const path = require('path');
const db = require('../src/database/db');
const backupService = require('../src/services/backupService');

// Promisify db.run for easier async/await usage
const runDb = (sql, params) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runAntigravityTest() {
  console.log('\n======================================================');
  console.log('  🚀 INITIATING ANTIGRAVITY E2E TEST SEQUENCE 🚀');
  console.log('======================================================\n');

  let insertedCustomerId = null;

  try {
    // ---------------------------------------------------------
    // STEP 1: Triggers & DB Version
    // ---------------------------------------------------------
    console.log('▶️  STEP 1: Testing Auto-Increment Triggers & DB Version');
    
    const initialVersion = await db.getDbVersion();
    console.log(`   🔍 Initial DB Version: ${initialVersion}`);
    
    console.log('   👤 Inserting fake customer: "Antigravity Test"...');
    const result = await runDb(
      'INSERT INTO customers (first_name, last_name) VALUES (?, ?)',
      ['Antigravity', 'Test']
    );
    insertedCustomerId = result.lastID;
    console.log(`   ✅ Customer inserted with ID: ${insertedCustomerId}`);
    
    const newVersion = await db.getDbVersion();
    console.log(`   🔍 New DB Version: ${newVersion}`);
    
    if (newVersion === initialVersion + 1) {
      console.log('   🟢 SUCCESS: DB Version increased by 1 (Trigger works!)');
    } else {
      console.log(`   🔴 FAILED: DB Version did not increase correctly (Expected ${initialVersion + 1}, got ${newVersion})`);
    }

    // ---------------------------------------------------------
    // STEP 2: 15s Debounce & Upload
    // ---------------------------------------------------------
    console.log('\n▶️  STEP 2: Testing Real-Time Upload Debounce');
    console.log('   ⏳ Waiting 16 seconds to force the real-time Drive upload...');
    await wait(16000);
    console.log('   ✅ Wait complete. The real-time upload should have fired in the background.');

    // ---------------------------------------------------------
    // STEP 3: Midnight Janitor
    // ---------------------------------------------------------
    console.log('\n▶️  STEP 3: Testing Midnight Janitor (Daily Snapshot & GFS Pruning)');
    console.log('   🧹 Calling backupService.runMidnightJanitor()...');
    
    if (typeof backupService.runMidnightJanitor === 'function') {
      await backupService.runMidnightJanitor();
      console.log('   ✅ Midnight Janitor execution completed.');
    } else {
      console.log('   ⚠️  backupService.runMidnightJanitor() is not defined or exported. Skipping.');
    }

    // ---------------------------------------------------------
    // STEP 4: Cleanup
    // ---------------------------------------------------------
    console.log('\n▶️  STEP 4: Cleaning up test data');
    if (insertedCustomerId) {
      console.log(`   🗑️  Deleting fake customer (ID: ${insertedCustomerId})...`);
      await runDb('DELETE FROM customers WHERE id = ?', [insertedCustomerId]);
      console.log('   ✅ Cleanup successful. (Note: This deletion will also bump the DB version!)');
    }

    console.log('\n======================================================');
    console.log('  🎉 ANTIGRAVITY E2E TEST SEQUENCE COMPLETED 🎉');
    console.log('======================================================\n');
    
    process.exit(0);

  } catch (error) {
    console.error('\n   ❌ ERROR DURING TEST SEQUENCE:');
    console.error(error);
    
    // Attempt cleanup even on failure
    if (insertedCustomerId) {
      try {
        await runDb('DELETE FROM customers WHERE id = ?', [insertedCustomerId]);
        console.log(`   🧹 Emergency cleanup of customer ID ${insertedCustomerId} succeeded.`);
      } catch (cleanupErr) {
        console.error(`   🚨 Emergency cleanup failed:`, cleanupErr);
      }
    }
    
    process.exit(1);
  }
}

// Give the database connection and tables a brief moment to initialize before running the test
console.log('⏳ Initializing test environment...');
setTimeout(() => {
  runAntigravityTest();
}, 1500);
