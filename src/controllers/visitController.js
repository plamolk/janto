const db = require('../database/db');
const { triggerBackup } = require('../services/backupService');

const VISIT_BODY_COLUMNS = [
  'visit_date',
  'va_empty_r',
  'va_empty_l',
  'va_empty_total',
  'rx_obj_r_sph',
  'rx_obj_r_cyl',
  'rx_obj_r_axis',
  'rx_obj_r_add',
  'rx_obj_r_pd',
  'rx_obj_r_h',
  'rx_obj_l_sph',
  'rx_obj_l_cyl',
  'rx_obj_l_axis',
  'rx_obj_l_add',
  'rx_obj_l_pd',
  'rx_obj_l_h',
  'rx_subj_r_sph',
  'rx_subj_r_cyl',
  'rx_subj_r_axis',
  'rx_subj_r_add',
  'rx_subj_r_pd',
  'rx_subj_r_h',
  'rx_subj_l_sph',
  'rx_subj_l_cyl',
  'rx_subj_l_axis',
  'rx_subj_l_add',
  'rx_subj_l_pd',
  'rx_subj_l_h',
  'prescription_type',
  'recommended_lens',
  'lens_type',
  'lens_color',
  'lens_price',
  'glasses_type',
  'frame_model',
  'frame_size',
  'frame_price',
  'examiner',
  'salesperson',
  'dispenser',
  'notes',
];

function mapVisitBody(body) {
  const mapped = {};
  for (const col of VISIT_BODY_COLUMNS) {
    mapped[col] = body[col] !== undefined ? body[col] : null;
  }
  return mapped;
}

function getVisitsByCustomerId(req, res) {
  const customerId = req.params.customerId;

  db.get('SELECT id FROM customers WHERE id = ?', [customerId], (findErr, customer) => {
    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const sql = `
      SELECT * FROM visits
      WHERE customer_id = ?
      ORDER BY visit_number ASC
    `;
    db.all(sql, [customerId], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });
}

function createVisit(req, res) {
  const { customer_id } = req.body;

  if (!customer_id) {
    return res.status(400).json({ error: 'customer_id is required' });
  }

  const lp = Number(req.body.lens_price);
  if (!isNaN(lp) && lp < 0) {
    return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง / Invalid data' });
  }

  const fp = Number(req.body.frame_price);
  if (!isNaN(fp) && fp < 0) {
    return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง / Invalid data' });
  }

  db.get('SELECT id FROM customers WHERE id = ?', [customer_id], (findErr, customer) => {
    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const nextNumberSql = `
      SELECT COALESCE(MAX(visit_number), 0) + 1 AS next_visit_number
      FROM visits WHERE customer_id = ?
    `;

    db.get(nextNumberSql, [customer_id], (numErr, row) => {
      if (numErr) return res.status(500).json({ error: numErr.message });

      const visitNumber = row.next_visit_number;
      const bodyData = mapVisitBody(req.body);
      const insertColumns = ['customer_id', 'visit_number', ...VISIT_BODY_COLUMNS];
      const placeholders = insertColumns.map(() => '?').join(', ');
      const values = [customer_id, visitNumber, ...VISIT_BODY_COLUMNS.map((col) => bodyData[col])];
      const sql = `INSERT INTO visits (${insertColumns.join(', ')}) VALUES (${placeholders})`;

      db.run(sql, values, function onInsert(err) {
        if (err) return res.status(500).json({ error: err.message });

        triggerBackup();
        console.log("DEBUG: Backup triggered manually after save");

        db.get('SELECT * FROM visits WHERE id = ?', [this.lastID], (fetchErr, visit) => {
          if (fetchErr) return res.status(500).json({ error: fetchErr.message });
          res.status(201).json(visit);
        });
      });
    });
  });
}

function updateVisit(req, res) {
  const visitId = req.params.id;

  const lp = Number(req.body.lens_price);
  if (!isNaN(lp) && lp < 0) {
    return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง / Invalid data' });
  }

  const fp = Number(req.body.frame_price);
  if (!isNaN(fp) && fp < 0) {
    return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง / Invalid data' });
  }

  const bodyData = mapVisitBody(req.body);

  const setClauses = VISIT_BODY_COLUMNS.map((col) => `${col} = ?`).join(', ');
  const values = [...VISIT_BODY_COLUMNS.map((col) => bodyData[col]), visitId];

  const sql = `UPDATE visits SET ${setClauses} WHERE id = ?`;

  db.run(sql, values, function onUpdate(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Visit not found' });

    triggerBackup();
    console.log("DEBUG: Backup triggered manually after save");

    db.get('SELECT * FROM visits WHERE id = ?', [visitId], (fetchErr, visit) => {
      if (fetchErr) return res.status(500).json({ error: fetchErr.message });
      res.json(visit);
    });
  });
}

module.exports = {
  getVisitsByCustomerId,
  createVisit,
  updateVisit,
};
