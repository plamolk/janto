let billingDocumentsData = [];
window.allBillingDocs = [];
window.savedCompanies = [];
let billingRowIdCounter = 0;
let billingModalReadOnly = false;

function formatDocumentType(type) {
  return Number(type) === 2
    ? 'ใบกำกับภาษี / TAX INVOICE'
    : 'ใบเสนอราคา / QUOTATION';
}

function parseBillingItems(itemsJson) {
  if (!itemsJson) return [];
  try {
    const parsed = typeof itemsJson === 'string' ? JSON.parse(itemsJson) : itemsJson;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapCompanyRow(row) {
  return {
    id: row.id,
    name: row.company_name ?? '',
    address: row.address ?? '',
    tax_id: row.tax_id ?? '',
  };
}

function findExistingCompany(name, taxId) {
  const trimmedName = (name || '').trim().toLowerCase();
  const trimmedTaxId = (taxId || '').trim();
  return (window.savedCompanies || []).find((c) => {
    if (trimmedTaxId && c.tax_id && String(c.tax_id).trim() === trimmedTaxId) return true;
    if (trimmedName && c.name && c.name.trim().toLowerCase() === trimmedName) return true;
    return false;
  });
}

function populateCompanyLookup() {
  const select = document.getElementById('billingCompanyLookup');
  if (!select) return;

  const previousValue = select.value;
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '-- กรอกข้อมูลใหม่ / เลือกบริษัทเดิม --';
  select.appendChild(placeholder);

  (window.savedCompanies || []).forEach((company) => {
    const option = document.createElement('option');
    option.value = String(company.id);
    option.textContent = company.name || '—';
    select.appendChild(option);
  });

  const stillValid = previousValue && (window.savedCompanies || []).some((c) => String(c.id) === previousValue);
  select.value = stillValid ? previousValue : '';
}

async function fetchSavedCompanies() {
  try {
    const response = await fetch('/api/companies');
    if (!response.ok) throw new Error('Failed to fetch companies');
    const rows = await response.json();
    window.savedCompanies = rows.map(mapCompanyRow);
    populateCompanyLookup();
  } catch (err) {
    console.error(err);
  }
}

async function upsertCompanyFromBilling(name, address, taxId) {
  const trimmedName = (name || '').trim();
  if (!trimmedName) return;

  if (findExistingCompany(trimmedName, taxId)) return;

  try {
    const response = await fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_name: trimmedName,
        address: (address || '').trim() || null,
        tax_id: (taxId || '').trim() || null,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('upsertCompanyFromBilling:', err.error || response.status);
    }
  } catch (err) {
    console.error(err);
  }
}

function handleCompanyLookupChange() {
  const select = document.getElementById('billingCompanyLookup');
  const selectedId = select?.value || '';

  const nameInput = document.getElementById('billingBilledToName');
  const addressInput = document.getElementById('billingBilledToAddress');
  const taxIdInput = document.getElementById('billingBilledToTaxId');
  if (!nameInput || !addressInput || !taxIdInput) return;

  if (!selectedId) {
    nameInput.value = '';
    addressInput.value = '';
    taxIdInput.value = '';
    return;
  }

  const company = (window.savedCompanies || []).find((c) => String(c.id) === selectedId);
  if (company) {
    nameInput.value = company.name || '';
    addressInput.value = company.address || '';
    taxIdInput.value = company.tax_id || '';
  }
}

function resetCompanyManagerForm() {
  const idEl = document.getElementById('companyManagerId');
  const nameEl = document.getElementById('companyManagerName');
  const addressEl = document.getElementById('companyManagerAddress');
  const taxEl = document.getElementById('companyManagerTaxId');
  if (idEl) idEl.value = '';
  if (nameEl) nameEl.value = '';
  if (addressEl) addressEl.value = '';
  if (taxEl) taxEl.value = '';
}

function renderCompanyManagerTable() {
  const tbody = document.getElementById('companyManagerTableBody');
  if (!tbody) return;

  const companies = window.savedCompanies || [];
  if (!companies.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="2" class="px-4 py-6 text-center text-slate-500">ยังไม่มีบริษัท</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = companies
    .map(
      (company) => `
    <tr class="hover:bg-slate-50">
      <td class="px-4 py-2 text-slate-800">${escapeHtml(company.name || '—')}</td>
      <td class="px-4 py-2 text-right whitespace-nowrap">
        <button
          type="button"
          onclick="editCompany(${company.id})"
          class="text-blue-600 hover:text-blue-800 text-sm font-medium"
          title="แก้ไข"
        >
          แก้ไข
        </button>
        <button
          type="button"
          onclick="deleteCompany(${company.id})"
          class="text-red-600 hover:text-red-800 text-sm font-medium ml-2"
          title="ลบ"
        >
          ลบ
        </button>
      </td>
    </tr>
  `
    )
    .join('');
}

async function openCompanyManager() {
  await fetchSavedCompanies();
  resetCompanyManagerForm();
  renderCompanyManagerTable();
  document.getElementById('companyManagerModal')?.classList.remove('hidden');
}

function closeCompanyManager() {
  document.getElementById('companyManagerModal')?.classList.add('hidden');
  resetCompanyManagerForm();
}

function editCompany(id) {
  const company = (window.savedCompanies || []).find((c) => String(c.id) === String(id));
  if (!company) return;

  const idEl = document.getElementById('companyManagerId');
  const nameEl = document.getElementById('companyManagerName');
  const addressEl = document.getElementById('companyManagerAddress');
  const taxEl = document.getElementById('companyManagerTaxId');
  if (idEl) idEl.value = String(company.id);
  if (nameEl) nameEl.value = company.name || '';
  if (addressEl) addressEl.value = company.address || '';
  if (taxEl) taxEl.value = company.tax_id || '';
}

async function saveCompanyManagerForm(e) {
  e.preventDefault();

  const id = document.getElementById('companyManagerId')?.value || '';
  const company_name = document.getElementById('companyManagerName')?.value.trim() || '';
  const address = document.getElementById('companyManagerAddress')?.value.trim() || '';
  const tax_id = document.getElementById('companyManagerTaxId')?.value.trim() || '';

  if (!company_name) {
    alert('กรุณาระบุชื่อบริษัท/ลูกค้า');
    return;
  }

  const body = {
    company_name,
    address: address || null,
    tax_id: tax_id || null,
  };

  try {
    const url = id ? `/api/companies/${id}` : '/api/companies';
    const method = id ? 'PUT' : 'POST';
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      alert(err.error || 'ไม่สามารถบันทึกบริษัทได้');
      return;
    }

    await fetchSavedCompanies();
    renderCompanyManagerTable();
    resetCompanyManagerForm();
  } catch (err) {
    console.error(err);
    alert('เกิดข้อผิดพลาดเครือข่าย กรุณาลองใหม่อีกครั้ง');
  }
}

async function deleteCompany(id) {
  const company = (window.savedCompanies || []).find((c) => String(c.id) === String(id));
  const label = company?.name || `ID ${id}`;
  if (!confirm(`ต้องการลบบริษัท "${label}" หรือไม่?\nเอกสารที่ออกไปแล้วจะไม่ถูกเปลี่ยนแปลง`)) return;

  try {
    const response = await fetch(`/api/companies/${id}`, { method: 'DELETE' });
    if (!response.ok && response.status !== 204) {
      const err = await response.json().catch(() => ({}));
      alert(err.error || 'ไม่สามารถลบบริษัทได้');
      return;
    }

    const lookup = document.getElementById('billingCompanyLookup');
    if (lookup && lookup.value === String(id)) {
      lookup.value = '';
      handleCompanyLookupChange();
    }

    await fetchSavedCompanies();
    renderCompanyManagerTable();
    resetCompanyManagerForm();
  } catch (err) {
    console.error(err);
    alert('เกิดข้อผิดพลาดเครือข่าย กรุณาลองใหม่อีกครั้ง');
  }
}

async function fetchBillingDocuments() {
  try {
    const response = await fetch('/api/billing');
    if (!response.ok) throw new Error('Failed to fetch billing documents');
    billingDocumentsData = await response.json();
    window.allBillingDocs = billingDocumentsData;
    filterBillingDocuments();
  } catch (err) {
    console.error(err);
    alert('ไม่สามารถโหลดรายการเอกสารได้');
  }
}

function filterBillingDocuments() {
  const textVal = (document.getElementById('filterBillingText')?.value || '').toLowerCase();
  const dateVal = document.getElementById('filterBillingDate')?.value || '';
  const typeVal = document.getElementById('filterBillingType')?.value || 'all';

  const filtered = (window.allBillingDocs || []).filter((doc) => {
    const matchText =
      !textVal ||
      (doc.billed_to_name && doc.billed_to_name.toLowerCase().includes(textVal)) ||
      (doc.document_number && String(doc.document_number).toLowerCase().includes(textVal));

    const matchDate =
      !dateVal || (doc.created_at && String(doc.created_at).startsWith(dateVal));

    const matchType =
      typeVal === 'all' || String(doc.document_type) === typeVal;

    return matchText && matchDate && matchType;
  });

  renderBillingTable(filtered);
}

function renderBillingTable(docs) {
  const tbody = document.getElementById('billingTableBody');
  if (!tbody) return;

  const rows = docs ?? billingDocumentsData;

  if (!window.allBillingDocs.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="px-6 py-8 text-center text-slate-500">ยังไม่มีเอกสาร</td>
      </tr>
    `;
    return;
  }

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="px-6 py-8 text-center text-slate-500">ไม่พบเอกสารที่ตรงกับเงื่อนไข</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows
    .map(
      (doc, index) => `
    <tr class="hover:bg-slate-50">
      <td class="px-6 py-3 text-slate-600">${index + 1}</td>
      <td class="px-6 py-3 text-slate-800 font-medium">${escapeHtml(doc.document_number || '—')}</td>
      <td class="px-6 py-3 text-slate-600">${escapeHtml(formatDocumentType(doc.document_type))}</td>
      <td class="px-6 py-3 text-slate-600">${escapeHtml(doc.billed_to_name || '—')}</td>
      <td class="px-6 py-3 text-slate-800 text-right">${formatMoney(doc.grand_total)}</td>
      <td class="px-6 py-3 text-slate-600">${doc.created_at ? new Date(doc.created_at).toLocaleDateString('th-TH') : '—'}</td>
      <td class="px-6 py-3 text-right whitespace-nowrap">
        <button
          type="button"
          onclick="viewBillingDocument(${doc.id})"
          class="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          ดู
        </button>
        <button
          type="button"
          onclick="printBillingDocumentById(${doc.id})"
          class="text-blue-600 hover:text-blue-800 text-sm font-medium ml-3"
          title="พิมพ์ หรือ บันทึกเป็น PDF"
        >
          🖨️ พิมพ์ / PDF
        </button>
      </td>
    </tr>
  `
    )
    .join('');
}

function applyBillingViewModeLock() {
  billingModalReadOnly = true;

  const addBtn = document.getElementById('addBillingRowBtn');
  const saveBtn = document.getElementById('saveBillingBtn');
  if (addBtn) addBtn.style.display = 'none';
  if (saveBtn) saveBtn.style.display = 'none';

  document.querySelectorAll('#billingModal input, #billingModal select, #billingModal textarea').forEach((el) => {
    if (el.id === 'cancelBillingBtn') return;
    el.disabled = true;
  });

  document.querySelectorAll('.billing-row-delete, .delete-row-btn').forEach((btn) => {
    btn.style.display = 'none';
  });

  document.getElementById('billingActionTh')?.classList.add('hidden');
  document.querySelectorAll('.billing-items-action-col').forEach((el) => el.classList.add('hidden'));
}

function releaseBillingViewModeLock() {
  billingModalReadOnly = false;

  const addBtn = document.getElementById('addBillingRowBtn');
  const saveBtn = document.getElementById('saveBillingBtn');
  if (addBtn) addBtn.style.display = '';
  if (saveBtn) saveBtn.style.display = '';

  document.querySelectorAll('#billingModal input, #billingModal select, #billingModal textarea').forEach((el) => {
    if (el.id === 'cancelBillingBtn') return;
    el.disabled = false;
    el.readOnly = false;
  });

  document.querySelectorAll('.billing-row-delete, .delete-row-btn').forEach((btn) => {
    btn.style.display = '';
  });

  document.getElementById('billingActionTh')?.classList.remove('hidden');
  document.querySelectorAll('.billing-items-action-col').forEach((el) => el.classList.remove('hidden'));
}

function resetBillingForm() {
  billingRowIdCounter = 0;
  document.getElementById('billingEditId').value = '';
  document.getElementById('billingModalTitle').textContent = 'สร้างเอกสารใหม่';
  document.getElementById('billingDocumentType').value = '1';
  document.getElementById('billingDocumentNumber').value = '';
  document.getElementById('billingBilledToName').value = '';
  document.getElementById('billingBilledToAddress').value = '';
  document.getElementById('billingBilledToTaxId').value = '';
  const lookup = document.getElementById('billingCompanyLookup');
  if (lookup) {
    lookup.value = '';
    lookup.disabled = false;
  }
  document.getElementById('billingVatEnabled').checked = true;
  document.getElementById('billingItemsBody').innerHTML = '';
  releaseBillingViewModeLock();
  calculateGrandTotal();
}

function openBillingModal() {
  resetBillingForm();
  addBillingRow();
  document.getElementById('billingModal').classList.remove('hidden');
  calculateGrandTotal();
}

function closeBillingModal() {
  document.getElementById('billingModal').classList.add('hidden');
  resetBillingForm();
}

function addBillingRow(prefill = {}, options = {}) {
  // Enforce max 6 rows only when the user is manually adding (not prefilling saved data)
  const isPrefilling = Object.keys(prefill).length > 0;
  if (!isPrefilling) {
    const currentRows = document.querySelectorAll('#billingItemsBody tr');
    if (currentRows.length >= 6) {
      alert('⚠️ สามารถเพิ่มรายการสินค้าได้สูงสุด 6 รายการต่อหนึ่งเอกสารเท่านั้น เพื่อให้จัดหน้าพิมพ์ A4 ได้สวยงามพอดี');
      return;
    }
  }

  const includeActionColumn = options.includeActionColumn !== false;
  const tbody = document.getElementById('billingItemsBody');
  const tr = document.createElement('tr');
  tr.dataset.rowId = String(++billingRowIdCounter);

  const qty = prefill.qty ?? prefill.quantity ?? 1;
  const unitPrice = prefill.unit_price ?? prefill.unitPrice ?? 0;
  const total = prefill.total ?? qty * unitPrice;

  const inputClass =
    'w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500';

  const nameTd = document.createElement('td');
  nameTd.className = 'px-2 py-1';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = `billing-item-name ${inputClass}`;
  nameInput.value = prefill.name ?? '';
  nameInput.addEventListener('input', () => onBillingRowInput(nameInput));
  nameTd.appendChild(nameInput);

  const qtyTd = document.createElement('td');
  qtyTd.className = 'px-2 py-1';
  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.min = '0';
  qtyInput.step = 'any';
  qtyInput.className = `billing-item-qty ${inputClass} text-right`;
  qtyInput.value = qty;
  qtyInput.addEventListener('input', () => onBillingRowInput(qtyInput));
  qtyTd.appendChild(qtyInput);

  const priceTd = document.createElement('td');
  priceTd.className = 'px-2 py-1';
  const priceInput = document.createElement('input');
  priceInput.type = 'number';
  priceInput.min = '0';
  priceInput.step = '0.01';
  priceInput.className = `billing-item-price ${inputClass} text-right`;
  priceInput.value = unitPrice;
  priceInput.addEventListener('input', () => onBillingRowInput(priceInput));
  priceTd.appendChild(priceInput);

  const totalTd = document.createElement('td');
  totalTd.className = 'px-2 py-1';
  const totalInput = document.createElement('input');
  totalInput.type = 'text';
  totalInput.readOnly = true;
  totalInput.className =
    'billing-item-total w-full px-2 py-1.5 border border-slate-100 rounded text-sm text-right bg-slate-50 text-slate-700';
  totalInput.value = Number(total).toFixed(2);
  totalTd.appendChild(totalInput);

  const cells = [nameTd, qtyTd, priceTd, totalTd];
  if (includeActionColumn) {
    const actionTd = document.createElement('td');
    actionTd.className = 'billing-items-action-col px-2 py-1 text-center';
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className =
      'billing-row-delete delete-row-btn p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer';
    delBtn.title = 'ลบรายการนี้';
    delBtn.textContent = '🗑️';
    delBtn.addEventListener('click', () => removeBillingRow(delBtn));
    actionTd.appendChild(delBtn);
    cells.push(actionTd);
  }

  tr.append(...cells);
  tbody.appendChild(tr);
  onBillingRowInput(qtyInput);
}

function removeBillingRow(btn) {
  if (billingModalReadOnly) return;
  btn.closest('tr')?.remove();
  calculateGrandTotal();
}

function onBillingRowInput(el) {
  const tr = el.closest('tr');
  if (!tr) return;
  const qty = parseFloat(tr.querySelector('.billing-item-qty')?.value) || 0;
  const price = parseFloat(tr.querySelector('.billing-item-price')?.value) || 0;
  const total = qty * price;
  const totalEl = tr.querySelector('.billing-item-total');
  if (totalEl) totalEl.value = total.toFixed(2);
  calculateGrandTotal();
}

function calculateGrandTotal() {
  let subtotal = 0;
  document.querySelectorAll('#billingItemsBody tr').forEach((tr) => {
    subtotal += parseFloat(tr.querySelector('.billing-item-total')?.value) || 0;
  });
  const vatEnabled = document.getElementById('billingVatEnabled')?.checked ?? false;
  const vat = vatEnabled ? subtotal * 0.07 : 0;
  const grand = subtotal + vat;

  const subEl = document.getElementById('billingSubtotal');
  const vatEl = document.getElementById('billingVatAmount');
  const grandEl = document.getElementById('billingGrandTotal');
  if (subEl) subEl.textContent = formatMoney(subtotal);
  if (vatEl) vatEl.textContent = formatMoney(vat);
  if (grandEl) grandEl.textContent = formatMoney(grand);

  return { subtotal, vat, grand };
}

function collectBillingItemsFromTable() {
  const items = [];
  document.querySelectorAll('#billingItemsBody tr').forEach((tr) => {
    const name = tr.querySelector('.billing-item-name')?.value?.trim() || '';
    const qty = parseFloat(tr.querySelector('.billing-item-qty')?.value) || 0;
    const unit_price = parseFloat(tr.querySelector('.billing-item-price')?.value) || 0;
    const total = parseFloat(tr.querySelector('.billing-item-total')?.value) || 0;
    if (!name && qty === 0 && unit_price === 0) return;
    items.push({ name, qty, unit_price, total });
  });
  return items;
}

function populateBillingForm(doc, options = {}) {
  const includeAction = options.includeActionColumn !== false;
  document.getElementById('billingEditId').value = doc.id ?? '';
  document.getElementById('billingDocumentType').value = String(doc.document_type ?? 1);
  document.getElementById('billingDocumentNumber').value = doc.document_number ?? '';
  document.getElementById('billingBilledToName').value = doc.billed_to_name ?? '';
  document.getElementById('billingBilledToAddress').value = doc.billed_to_address ?? '';
  document.getElementById('billingBilledToTaxId').value = doc.billed_to_tax_id ?? '';

  const lookup = document.getElementById('billingCompanyLookup');
  if (lookup) {
    const companyId = doc.company_id != null ? String(doc.company_id) : '';
    const exists = companyId && (window.savedCompanies || []).some((c) => String(c.id) === companyId);
    lookup.value = exists ? companyId : '';
  }

  const items = parseBillingItems(doc.items_json);
  document.getElementById('billingItemsBody').innerHTML = '';
  if (items.length) {
    items.forEach((item) => addBillingRow(item, { includeActionColumn: includeAction }));
  } else {
    addBillingRow({}, { includeActionColumn: includeAction });
  }

  const subtotal = Number(doc.subtotal) || 0;
  const vat = Number(doc.vat_amount) || 0;
  const vatEnabled = vat > 0 || (subtotal > 0 && Math.abs(vat - subtotal * 0.07) < 0.02);
  document.getElementById('billingVatEnabled').checked = vatEnabled;
  calculateGrandTotal();
}

async function viewBillingDocument(id) {
  try {
    const response = await fetch(`/api/billing/${id}`);
    if (!response.ok) throw new Error('Not found');
    const doc = await response.json();
    resetBillingForm();
    document.getElementById('billingModalTitle').textContent = 'ดูเอกสาร';
    populateBillingForm(doc, { includeActionColumn: false });
    applyBillingViewModeLock();
    document.getElementById('billingModal').classList.remove('hidden');
  } catch (err) {
    console.error(err);
    alert('ไม่สามารถโหลดเอกสารได้');
  }
}

async function saveBillingDocument(e) {
  e.preventDefault();
  if (billingModalReadOnly) return;

  const items = collectBillingItemsFromTable();
  if (!items.length) {
    alert('กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ');
    return;
  }

  const { subtotal, vat, grand } = calculateGrandTotal();
  const docNum = document.getElementById('billingDocumentNumber').value.trim();
  const companyId = document.getElementById('billingCompanyLookup')?.value || '';
  const billedToName = document.getElementById('billingBilledToName').value.trim();
  const billedToAddress = document.getElementById('billingBilledToAddress').value.trim();
  const billedToTaxId = document.getElementById('billingBilledToTaxId').value.trim();

  const payload = {
    document_type: Number(document.getElementById('billingDocumentType').value),
    billed_to_name: billedToName || null,
    billed_to_address: billedToAddress || null,
    billed_to_tax_id: billedToTaxId || null,
    items_json: items,
    subtotal,
    vat_amount: vat,
    grand_total: grand,
  };
  if (companyId) payload.company_id = Number(companyId);
  if (docNum) payload.document_number = docNum;

  try {
    const response = await fetch('/api/billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      alert(err.error || 'ไม่สามารถบันทึกเอกสารได้');
      return;
    }

    const saved = await response.json();
    if (!companyId && billedToName) {
      await upsertCompanyFromBilling(billedToName, billedToAddress, billedToTaxId);
    }
    await fetchSavedCompanies();
    closeBillingModal();
    await fetchBillingDocuments();
    if (confirm('บันทึกเอกสารเรียบร้อยแล้ว ต้องการพิมพ์ตอนนี้หรือไม่?')) {
      printBillingDocument(saved);
    }
  } catch (err) {
    console.error(err);
    alert('เกิดข้อผิดพลาดเครือข่าย กรุณาลองใหม่อีกครั้ง');
  }
}

const SHOP_PRINT = {
  name: 'ร้านแว่นตาจันทร์โต',
  address: 'เลขที่ 5/216 ม.6 ต.บางเมือง อ.เมืองสมุทรปราการ จ.สมุทรปราการ 10270',
  phone: 'โทร : 080-462-8915, 02-121-4578',
  taxId: '3170600206134',
  remarks: '(ธนาคารกสิกรไทย 125-867-3111 นางสาวอัมพา จันทร์โต)',
};

function isTaxInvoice(doc) {
  return Number(doc.document_type) === 2;
}

function getPrintTitle(doc) {
  return formatDocumentType(doc.document_type);
}

function buildPrintItemRows(items) {
  if (!items.length) {
    return `
      <tr>
        <td colspan="5" class="border border-black px-2 py-2 text-center">ไม่มีรายการ</td>
      </tr>
    `;
  }

  return items
    .map(
      (item, index) => `
    <tr>
      <td class="border border-black px-2 py-2 text-center w-10 align-top">${index + 1}</td>
      <td class="border border-black px-2 py-2 text-left align-top">${escapeHtml(item.name || '—')}</td>
      <td class="border border-black px-2 py-2 text-center w-16 align-top">${escapeHtml(String(item.qty ?? ''))}</td>
      <td class="border border-black px-2 py-2 text-right w-24 align-top">${formatMoney(item.unit_price)}</td>
      <td class="border border-black px-2 py-2 text-right w-28 align-top">${formatMoney(item.total)}</td>
    </tr>
  `
    )
    .join('');
}

function buildEmptyItemPadding(itemCount, minRows = 3) {
  const padCount = Math.max(0, minRows - itemCount);
  return Array.from({ length: padCount }, () => `
    <tr>
      <td class="border border-black px-2 py-2 text-center w-10">&nbsp;</td>
      <td class="border border-black px-2 py-2">&nbsp;</td>
      <td class="border border-black px-2 py-2 w-16">&nbsp;</td>
      <td class="border border-black px-2 py-2 w-24">&nbsp;</td>
      <td class="border border-black px-2 py-2 w-28">&nbsp;</td>
    </tr>
  `).join('');
}

function buildPrintSignatureBlock(doc) {
  if (isTaxInvoice(doc)) {
    return `
      <div class="mt-24 grid grid-cols-2 gap-12 text-center">
        <div>
          <p class="mt-5 text-center mb-10">จึงเรียนมาเพื่อพิจารณา</p>
          <p class="border-b border-black mx-auto w-[180px] mb-1">&nbsp;</p>
          <p class="">ร้านแว่นตาจันทร์โต</p>
          <p class="mb-4">ผู้รับเงิน</p>
          <p class="text-xs text-center">วันที่ ( _____________________________ )</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="mt-14 grid grid-cols-2 gap-12 text-center">
      <div>
        <p class="mt-5 text-center mb-10">จึงเรียนมาเพื่อพิจารณา</p>
        <p class="border-b border-black mx-auto w-[180px] mb-1">&nbsp;</p>
        <p class="">ร้านแว่นตาจันทร์โต</p>
        <p class="mb-4">ผู้เสนอราคา</p>
        <p class="text-xs text-center">วันที่ ( _____________________________ )</p>
      </div>
  
    </div>
  `;
}

function buildBillingPrintHtml(doc) {
  const items = parseBillingItems(doc.items_json);
  const dateLabel = doc.created_at ? new Date(doc.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
  const docTypeLabel = getPrintTitle(doc);
  const taxInvoice = isTaxInvoice(doc);
  const vatAmount = Number(doc.vat_amount) || 0;
  const showVatRow = taxInvoice || vatAmount > 0;
  const remarksText = taxInvoice ? '' : SHOP_PRINT.remarks;

  const itemRows = buildPrintItemRows(items) + buildEmptyItemPadding(items.length);

  const vatRow = showVatRow
    ? `
      <tr>
        <td class="border-b border-black px-2 py-1 text-left">VAT 7%</td>
        <td class="border-b border-black px-2 py-1 text-right font-medium">${formatMoney(vatAmount)}</td>
      </tr>
    `
    : '';

  const quotationIntro = taxInvoice
    ? ''
    : `<p class="mb-3 text-left">${escapeHtml(SHOP_PRINT.name)} มีความยินดีเสนอราคาสินค้าดังรายการต่อไปนี้</p>`;

  const remarksBlock = remarksText
    ? `<p class="mt-12"><span class="font-semibold">หมายเหตุ :</span> ${escapeHtml(remarksText)}</p>`
    : '';

  return `
    <div class="w-full h-full text-black text-sm box-border font-sans">

      <!-- Edge-to-edge blue shop header -->
      <div class="text-center text-white pt-[12mm] pb-[8mm] px-[15mm]"
           style="-webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: #1e40af;">
        <h1 class="text-2xl font-bold mb-1">${escapeHtml(SHOP_PRINT.name)}</h1>
        <p class="text-sm mt-1 font-bold">${escapeHtml(SHOP_PRINT.address)}</p>
        <p class="text-sm mt-1 font-bold">${escapeHtml(SHOP_PRINT.phone)}</p>
        <p class="text-sm mt-1 font-bold">เลขประจำตัวผู้เสียภาษี ${escapeHtml(SHOP_PRINT.taxId)}</p>
      </div>

      <!-- Padded body content -->
      <div class="px-[15mm] pb-[12mm] pt-[6mm]">

        <div class="text-center mt-4 mb-10">
          <h2 class="text-xl font-bold">${escapeHtml(docTypeLabel)}</h2>
        </div>

        <div class="flex justify-between items-start gap-6 text-sm mb-14">
          <div class="flex-1">
            <p class="font-semibold">${escapeHtml(doc.billed_to_name || '—')}</p>
            <p class="whitespace-pre-line mt-1">${escapeHtml(doc.billed_to_address || '—')}</p>
            <p class="mt-2"><span class="font-semibold">เลขที่ผู้เสียภาษี:</span> ${escapeHtml(doc.billed_to_tax_id || '—')}</p>
          </div>
          <div class="text-right shrink-0">
            <p>เลขที่ (No.): <span class="font-semibold">${escapeHtml(doc.document_number || '—')}</span></p>
            <p class="mt-1">วันที่ (Date): <span class="font-semibold">${escapeHtml(dateLabel)}</span></p>
          </div>
        </div>

        ${quotationIntro}

        <table class="w-full border-collapse border border-black text-sm">
          <thead>
            <tr>
              <th class="border border-black px-2 py-1 text-center w-10">ลำดับ</th>
              <th class="border border-black px-2 py-1 text-center">รายการ</th>
              <th class="border border-black px-2 py-1 text-center w-16">จำนวน</th>
              <th class="border border-black px-2 py-1 text-center w-24">หน่วยละ</th>
              <th class="border border-black px-2 py-1 text-center w-28">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>

        <div class="mt-4 flex gap-4 items-start justify-end">
          <div class="w-72 shrink-0">
            <table class="w-full border-collapse border border-black text-sm">
              <tbody>
                <tr>
                  <td class="border-b border-black px-2 py-1 text-left">รวมเงิน (Sub Total)</td>
                  <td class="border-b border-black px-2 py-1 text-right font-medium">${formatMoney(doc.subtotal)}</td>
                </tr>
                ${vatRow}
                <tr>
                  <td class="border-b border-black px-2 py-1 text-left font-bold">ยอดเงินสุทธิ (Grand Total)</td>
                  <td class="border-b border-black px-2 py-1 text-right font-bold">${formatMoney(doc.grand_total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="text-sm mt-5">
          ${remarksBlock}
        </div>

        ${buildPrintSignatureBlock(doc)}

      </div><!-- end padded body -->
    </div>
  `;
}

async function fetchBillingDocumentById(id) {
  let doc = billingDocumentsData.find((d) => Number(d.id) === Number(id));
  if (!doc) {
    const response = await fetch(`/api/billing/${id}`);
    if (!response.ok) throw new Error('Not found');
    doc = await response.json();
  }
  return doc;
}

function mountPrintableDocument(doc) {
  const container = document.getElementById('printContainer');
  if (!container) return null;
  container.innerHTML = buildBillingPrintHtml(doc);
  return container.firstElementChild || container;
}

function printBillingDocument(doc) {
  if (!doc) return;
  mountPrintableDocument(doc);
  setTimeout(() => window.print(), 100);
}

async function printBillingDocumentById(docId) {
  try {
    const container = document.getElementById('printContainer');
    if (!container) throw new Error('ไม่พบกล่อง #printContainer ในหน้าเว็บ');

    const doc = await fetchBillingDocumentById(docId);
    container.innerHTML = buildBillingPrintHtml(doc);

    setTimeout(() => window.print(), 100);
  } catch (error) {
    console.error(error);
    alert('เกิดข้อผิดพลาดในการเปิดเอกสาร: ' + error.message);
  }
}

window.openBillingModal = openBillingModal;
window.closeBillingModal = closeBillingModal;
window.addBillingRow = addBillingRow;
window.removeBillingRow = removeBillingRow;
window.onBillingRowInput = onBillingRowInput;
window.viewBillingDocument = viewBillingDocument;
window.printBillingDocument = printBillingDocument;
window.printBillingDocumentById = printBillingDocumentById;
window.filterBillingDocuments = filterBillingDocuments;
window.handleCompanyLookupChange = handleCompanyLookupChange;
window.openCompanyManager = openCompanyManager;
window.closeCompanyManager = closeCompanyManager;
window.resetCompanyManagerForm = resetCompanyManagerForm;
window.editCompany = editCompany;
window.deleteCompany = deleteCompany;
window.saveCompanyManagerForm = saveCompanyManagerForm;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('createBillBtn')?.addEventListener('click', openBillingModal);
  document.getElementById('cancelBillingBtn')?.addEventListener('click', closeBillingModal);
  document.getElementById('addBillingRowBtn')?.addEventListener('click', () => addBillingRow());
  document.getElementById('billingVatEnabled')?.addEventListener('change', calculateGrandTotal);
  document.getElementById('billingForm')?.addEventListener('submit', saveBillingDocument);
  document.getElementById('companyManagerForm')?.addEventListener('submit', saveCompanyManagerForm);
  fetchBillingDocuments();
  fetchSavedCompanies();
});
