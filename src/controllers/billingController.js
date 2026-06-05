const db = require('../database/db');
const { toJsonString } = require('../utils');

const BILLING_COLUMNS = [
  'document_type',
  'document_number',
  'company_id',
  'billed_to_name',
  'billed_to_address',
  'billed_to_tax_id',
  'items_json',
  'subtotal',
  'vat_amount',
  'grand_total',
];

function billingValues(data) {
  return BILLING_COLUMNS.map((col) => data[col]);
}

function getAllBillingDocuments(req, res) {
  const sql = 'SELECT * FROM billing_documents ORDER BY created_at DESC';
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
}

function getBillingDocumentById(req, res) {
  const sql = 'SELECT * FROM billing_documents WHERE id = ?';
  db.get(sql, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Billing document not found' });
    res.json(row);
  });
}

function insertBillingDocument(res, data) {
  const placeholders = BILLING_COLUMNS.map(() => '?').join(', ');
  const sql = `INSERT INTO billing_documents (${BILLING_COLUMNS.join(', ')}) VALUES (${placeholders})`;

  db.run(sql, billingValues(data), function onInsert(err) {
    if (err) return res.status(500).json({ error: err.message });

    db.get('SELECT * FROM billing_documents WHERE id = ?', [this.lastID], (fetchErr, row) => {
      if (fetchErr) return res.status(500).json({ error: fetchErr.message });
      res.status(201).json(row);
    });
  });
}

function createBillingDocument(req, res) {
  if (req.body.document_type == null) {
    return res.status(400).json({ error: 'document_type is required' });
  }

  const documentNumber = req.body.document_number || `INV-${Date.now()}`;

  const baseData = {
    document_type: req.body.document_type,
    document_number: documentNumber,
    company_id: req.body.company_id ?? null,
    billed_to_name: req.body.billed_to_name ?? null,
    billed_to_address: req.body.billed_to_address ?? null,
    billed_to_tax_id: req.body.billed_to_tax_id ?? null,
    items_json: toJsonString(req.body.items_json),
    subtotal: req.body.subtotal ?? null,
    vat_amount: req.body.vat_amount ?? null,
    grand_total: req.body.grand_total ?? null,
  };

  insertBillingDocument(res, baseData);
}

module.exports = {
  getAllBillingDocuments,
  getBillingDocumentById,
  createBillingDocument,
};
