const db = require('../database/db');
const { toJsonString } = require('../utils');

const CUSTOMER_COLUMNS = [
  'member_id',
  'first_name',
  'last_name',
  'gender',
  'birthdate',
  'occupation',
  'address',
  'tel_home',
  'tel_office',
  'tel_mobile',
  'email',
  'health_history',
  'purpose',
  'glasses_experience',
  'progressive_experience',
  'current_eye_problem',
  'old_prescription_json',
  'other_details',
  'created_at',
];

function mapCustomerBody(body) {
  return {
    member_id: body.member_id ?? null,
    first_name: body.first_name ?? null,
    last_name: body.last_name ?? null,
    gender: body.gender ?? null,
    birthdate: body.birthdate ?? null,
    occupation: body.occupation ?? null,
    address: body.address ?? null,
    tel_home: body.tel_home ?? null,
    tel_office: body.tel_office ?? null,
    tel_mobile: body.tel_mobile ?? null,
    email: body.email ?? null,
    health_history: body.health_history ?? null,
    purpose: body.purpose ?? null,
    glasses_experience: body.glasses_experience ?? null,
    progressive_experience: body.progressive_experience ?? null,
    current_eye_problem: body.current_eye_problem ?? null,
    old_prescription_json: toJsonString(body.old_prescription_json),
    other_details: body.other_details ?? null,
    created_at: body.created_at || new Date().toISOString().replace('T', ' ').slice(0, 19),
  };
}

function customerValues(data) {
  return CUSTOMER_COLUMNS.map((col) => data[col]);
}

function getAllCustomers(req, res) {
  const sql = 'SELECT * FROM customers ORDER BY created_at DESC';
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
}

function getCustomerById(req, res) {
  const sql = 'SELECT * FROM customers WHERE id = ?';
  db.get(sql, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Customer not found' });
    res.json(row);
  });
}

function createCustomer(req, res) {
  if (!req.body.first_name || String(req.body.first_name).trim() === '') {
    return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง / Invalid data' });
  }

  const data = mapCustomerBody(req.body);
  const placeholders = CUSTOMER_COLUMNS.map(() => '?').join(', ');
  const sql = `INSERT INTO customers (${CUSTOMER_COLUMNS.join(', ')}) VALUES (${placeholders})`;

  db.run(sql, customerValues(data), function onInsert(err) {
    if (err) return res.status(500).json({ error: err.message });

    db.get('SELECT * FROM customers WHERE id = ?', [this.lastID], (fetchErr, row) => {
      if (fetchErr) return res.status(500).json({ error: fetchErr.message });
      res.status(201).json(row);
    });
  });
}

function updateCustomer(req, res) {
  const { id } = req.params;

  db.get('SELECT * FROM customers WHERE id = ?', [id], (findErr, existing) => {
    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!existing) return res.status(404).json({ error: 'Customer not found' });

    const merged = { ...existing, ...req.body };
    if (!merged.first_name || String(merged.first_name).trim() === '') {
      return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง / Invalid data' });
    }

    const data = mapCustomerBody(merged);
    const setClause = CUSTOMER_COLUMNS.map((col) => `${col} = ?`).join(', ');
    const sql = `UPDATE customers SET ${setClause} WHERE id = ?`;

    db.run(sql, [...customerValues(data), id], function onUpdate(err) {
      if (err) return res.status(500).json({ error: err.message });

      db.get('SELECT * FROM customers WHERE id = ?', [id], (fetchErr, row) => {
        if (fetchErr) return res.status(500).json({ error: fetchErr.message });
        res.json(row);
      });
    });
  });
}

module.exports = {
  getAllCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
};
