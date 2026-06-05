const db = require('../database/db');

const COMPANY_COLUMNS = [
  'company_name',
  'address',
  'tax_id',
];

function mapCompanyBody(body) {
  return {
    company_name: body.company_name ?? null,
    address: body.address ?? null,
    tax_id: body.tax_id ?? null,
  };
}

function companyValues(data) {
  return COMPANY_COLUMNS.map((col) => data[col]);
}

function getAllCompanies(req, res) {
  const sql = 'SELECT * FROM companies ORDER BY created_at DESC';
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
}

function getCompanyById(req, res) {
  const sql = 'SELECT * FROM companies WHERE id = ?';
  db.get(sql, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Company not found' });
    res.json(row);
  });
}

function createCompany(req, res) {
  if (!req.body.company_name || String(req.body.company_name).trim() === '') {
    return res.status(400).json({ error: 'company_name is required' });
  }

  const data = mapCompanyBody(req.body);
  const placeholders = COMPANY_COLUMNS.map(() => '?').join(', ');
  const sql = `INSERT INTO companies (${COMPANY_COLUMNS.join(', ')}) VALUES (${placeholders})`;

  db.run(sql, companyValues(data), function onInsert(err) {
    if (err) return res.status(500).json({ error: err.message });

    db.get('SELECT * FROM companies WHERE id = ?', [this.lastID], (fetchErr, row) => {
      if (fetchErr) return res.status(500).json({ error: fetchErr.message });
      res.status(201).json(row);
    });
  });
}

function updateCompany(req, res) {
  const { id } = req.params;

  db.get('SELECT * FROM companies WHERE id = ?', [id], (findErr, existing) => {
    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!existing) return res.status(404).json({ error: 'Company not found' });

    const fieldsToUpdate = COMPANY_COLUMNS.filter((col) =>
      Object.prototype.hasOwnProperty.call(req.body, col)
    );

    if (fieldsToUpdate.length === 0) {
      return res.json(existing);
    }

    if (fieldsToUpdate.includes('company_name')) {
      const name = req.body.company_name;
      if (!name || String(name).trim() === '') {
        return res.status(400).json({ error: 'company_name is required' });
      }
    }

    const setClause = fieldsToUpdate.map((col) => `${col} = ?`).join(', ');
    const values = fieldsToUpdate.map((col) => req.body[col] ?? null);
    const sql = `UPDATE companies SET ${setClause} WHERE id = ?`;

    db.run(sql, [...values, id], function onUpdate(err) {
      if (err) return res.status(500).json({ error: err.message });

      db.get('SELECT * FROM companies WHERE id = ?', [id], (fetchErr, row) => {
        if (fetchErr) return res.status(500).json({ error: fetchErr.message });
        res.json(row);
      });
    });
  });
}

function deleteCompany(req, res) {
  const { id } = req.params;

  db.get('SELECT * FROM companies WHERE id = ?', [id], (findErr, existing) => {
    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!existing) return res.status(404).json({ error: 'Company not found' });

    db.run(
      'UPDATE billing_documents SET company_id = NULL WHERE company_id = ?',
      [id],
      (nullifyErr) => {
        if (nullifyErr) return res.status(500).json({ error: nullifyErr.message });

        db.run('DELETE FROM companies WHERE id = ?', [id], function onDelete(err) {
          if (err) return res.status(500).json({ error: err.message });
          if (this.changes === 0) return res.status(404).json({ error: 'Company not found' });
          res.status(204).send();
        });
      }
    );
  });
}

module.exports = {
  getAllCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  deleteCompany,
};
