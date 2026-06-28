const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../../database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to database:', err.message);
    process.exit(1);
  }

  console.log('Connected to SQLite database');

  db.get('PRAGMA journal_mode = WAL;', (walErr, row) => {
    if (walErr) {
      console.error('Failed to enable WAL mode:', walErr.message);
      process.exit(1);
    }

    if (!row || row.journal_mode !== 'wal') {
      console.error('WAL mode was not enabled. Got:', row?.journal_mode);
      process.exit(1);
    }

    console.log('WAL mode enabled');
    initDb();
  });
});

function initDb() {
  db.serialize(() => {
    db.run(
      `CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        member_id TEXT,
        first_name TEXT NOT NULL,
        last_name TEXT,
        gender TEXT,
        age TEXT,
        birthdate TEXT,
        occupation TEXT,
        address TEXT,
        tel_home TEXT,
        tel_office TEXT,
        tel_mobile TEXT,
        email TEXT,
        health_history TEXT,
        purpose TEXT,
        glasses_experience TEXT,
        progressive_experience TEXT,
        current_eye_problem TEXT,
        old_prescription_json TEXT,
        other_details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      (err) => {
        if (err) {
          console.error('Failed to create customers table:', err.message);
          process.exit(1);
        }
        console.log('Table ready: customers');

        // Add age column migration
        db.run(`ALTER TABLE customers ADD COLUMN age TEXT`, (alterErr) => {
          if (alterErr && !alterErr.message.includes('duplicate column')) {
            console.error(`Migration warning (customers.age):`, alterErr.message);
          }
        });
      }
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        visit_number INTEGER,
        visit_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        va_empty_r TEXT,
        va_empty_l TEXT,
        va_empty_total TEXT,
        rx_obj_r_sph TEXT,
        rx_obj_r_cyl TEXT,
        rx_obj_r_axis TEXT,
        rx_obj_r_add TEXT,
        rx_obj_r_pd TEXT,
        rx_obj_r_h TEXT,
        rx_obj_l_sph TEXT,
        rx_obj_l_cyl TEXT,
        rx_obj_l_axis TEXT,
        rx_obj_l_add TEXT,
        rx_obj_l_pd TEXT,
        rx_obj_l_h TEXT,
        rx_subj_r_sph TEXT,
        rx_subj_r_cyl TEXT,
        rx_subj_r_axis TEXT,
        rx_subj_r_add TEXT,
        rx_subj_r_pd TEXT,
        rx_subj_r_h TEXT,
        rx_subj_l_sph TEXT,
        rx_subj_l_cyl TEXT,
        rx_subj_l_axis TEXT,
        rx_subj_l_add TEXT,
        rx_subj_l_pd TEXT,
        rx_subj_l_h TEXT,
        prescription_type TEXT,
        recommended_lens TEXT,
        lens_type TEXT,
        lens_color TEXT,
        lens_price REAL,
        glasses_type TEXT,
        frame_model TEXT,
        frame_size TEXT,
        frame_price REAL,
        examiner TEXT,
        salesperson TEXT,
        dispenser TEXT,
        notes TEXT,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      )`,
      (err) => {
        if (err) {
          console.error('Failed to create visits table:', err.message);
          process.exit(1);
        }
        console.log('Table ready: visits');

        // Auto-migration: add columns that may be missing in existing databases
        const newColumns = [
          { name: 'recommended_lens', type: 'TEXT' },
          { name: 'lens_price', type: 'REAL' },
          { name: 'glasses_type', type: 'TEXT' },
          { name: 'frame_price', type: 'REAL' },
          { name: 'salesperson', type: 'TEXT' },
        ];
        newColumns.forEach(({ name, type }) => {
          db.run(`ALTER TABLE visits ADD COLUMN ${name} ${type}`, (alterErr) => {
            if (alterErr && !alterErr.message.includes('duplicate column')) {
              console.error(`Migration warning (visits.${name}):`, alterErr.message);
            }
          });
        });
      }
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_name TEXT NOT NULL,
        address TEXT,
        tax_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      (err) => {
        if (err) {
          console.error('Failed to create companies table:', err.message);
          process.exit(1);
        }
        console.log('Table ready: companies');
      }
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS billing_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_type INTEGER NOT NULL,
        document_number TEXT UNIQUE NOT NULL,
        company_id INTEGER,
        billed_to_name TEXT,
        billed_to_address TEXT,
        billed_to_tax_id TEXT,
        items_json TEXT,
        subtotal REAL,
        vat_amount REAL,
        grand_total REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id)
      )`,
      (err) => {
        if (err) {
          console.error('Failed to create billing_documents table:', err.message);
          process.exit(1);
        }
        console.log('Table ready: billing_documents');
      }
    );

    // ─── Task 1: system_metadata table ───────────────────────────────
    db.run(
      `CREATE TABLE IF NOT EXISTS system_metadata (
        id INTEGER PRIMARY KEY,
        db_version INTEGER DEFAULT 1
      )`,
      (err) => {
        if (err) {
          console.error('Failed to create system_metadata table:', err.message);
          process.exit(1);
        }
        console.log('Table ready: system_metadata');
      }
    );

    db.run(
      `INSERT OR IGNORE INTO system_metadata (id, db_version) VALUES (1, 1)`,
      (err) => {
        if (err) {
          console.error('Failed to seed system_metadata:', err.message);
          process.exit(1);
        }
        console.log('Default row ensured: system_metadata');
      }
    );

    // ─── Task 2: Force Recreation of 12 Triggers (The 12 Spies) ─────
    const coreTables = ['customers', 'visits', 'companies', 'billing_documents'];
    const actions = ['insert', 'update', 'delete'];

    coreTables.forEach((table) => {
      actions.forEach((action) => {
        const triggerName = `trg_${table}_${action}`;

        // DROP first — guarantee a clean slate
        db.run(`DROP TRIGGER IF EXISTS ${triggerName}`, (err) => {
          if (err) {
            console.error(`Failed to drop trigger ${triggerName}:`, err.message);
            process.exit(1);
          }
        });

        // CREATE fresh trigger
        db.run(
          `CREATE TRIGGER ${triggerName}
           AFTER ${action.toUpperCase()} ON ${table}
           BEGIN
             UPDATE system_metadata SET db_version = db_version + 1 WHERE id = 1;
           END`,
          (err) => {
            if (err) {
              console.error(`Failed to create trigger ${triggerName}:`, err.message);
              process.exit(1);
            }
            console.log(`🔫 Trigger active: ${triggerName}`);
          }
        );
      });
    });
  });
}

// ─── Task 3: getDbVersion helper ───────────────────────────────────
db.getDbVersion = function () {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT db_version FROM system_metadata WHERE id = 1',
      (err, row) => {
        if (err) return reject(err);
        resolve(row ? row.db_version : null);
      }
    );
  });
};

module.exports = db;
