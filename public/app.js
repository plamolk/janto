// Shared utilities
function getDisplayPhone(customer) {
  return customer.tel_mobile || customer.tel_home || customer.tel_office || '—';
}

function displayCustomerValue(value) {
  return value == null || String(value).trim() === '' ? '—' : String(value);
}

function parseEditableValue(text) {
  const t = String(text).trim();
  return t === '—' ? '' : t;
}

function parseThaiDateInput(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const beYear = parseInt(parts[2], 10);
    const adYear = beYear - 543;
    return `${adYear}-${month}-${day}`;
  }
  return dateStr;
}

function formatDateToThaiBE(d) {
  if (!d) return '';
  if (typeof d === 'string') d = new Date(d);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const beYear = d.getFullYear() + 543;
  return `${day}/${month}/${beYear}`;
}

function mapPrescriptionType(val) {
  if (!val) return '';
  const v = String(val).trim();
  switch (v) {
    case 'Distance': return 'แว่นระยะไกล';
    case 'สายตาไกล': return 'แว่นระยะไกล';
    case 'Reading': return 'แว่นระยะใกล้';
    case 'Progressive': return 'เลนส์โปรเกรสซิพ';
    case 'Bifocal': return 'แว่นระยะกลาง';
    case 'Other': return ''; 
    default: return v;
  }
}

let customersData = [];
let currentViewCustomerId = null;
let currentCustomerVisits = [];
let inlineEditAbortController = null;
let rxInlineEditAbortController = null;

const EMPTY_OLD_RX = {
  R: { SPH: '-', CYL: '-', AXIS: '-', ADD: '-', PD: '-', H: '-' },
  L: { SPH: '-', CYL: '-', AXIS: '-', ADD: '-', PD: '-', H: '-' },
};

const OLD_RX_CELLS = [
  ['R', 'SPH', 'dOldRSph'],
  ['R', 'CYL', 'dOldRCyl'],
  ['R', 'AXIS', 'dOldRAxis'],
  ['R', 'ADD', 'dOldRAdd'],
  ['R', 'PD', 'dOldRPd'],
  ['R', 'H', 'dOldRH'],
  ['L', 'SPH', 'dOldLSph'],
  ['L', 'CYL', 'dOldLCyl'],
  ['L', 'AXIS', 'dOldLAxis'],
  ['L', 'ADD', 'dOldLAdd'],
  ['L', 'PD', 'dOldLPd'],
  ['L', 'H', 'dOldLH'],
];

const INLINE_EDIT_INNER_CLASS =
  'w-full h-full p-0 m-0 border-0 bg-transparent outline-none focus:ring-0 text-base';

const INLINE_EDIT_ACTIVE_CLASSES = ['ring-1', 'ring-blue-500', 'bg-white'];
const INLINE_EDIT_LAYOUT_CLASSES = ['flex', 'items-center'];

function beginInlineEditSlot(el) {
  el.classList.add(...INLINE_EDIT_ACTIVE_CLASSES, ...INLINE_EDIT_LAYOUT_CLASSES);
  el.classList.remove('truncate');
}

function endInlineEditSlot(el) {
  el.classList.remove(...INLINE_EDIT_ACTIVE_CLASSES, ...INLINE_EDIT_LAYOUT_CLASSES);
  el.classList.add('truncate');
}

function populateCustomerDetailFields(customer) {
  const c = customer;
  document.getElementById('detailFirstName').textContent = c.first_name || '—';
  document.getElementById('detailLastName').textContent = c.last_name || '—';
  document.getElementById('detailPhone').textContent = c.tel_mobile || '—';
  document.getElementById('detailBirthdate').textContent = c.birthdate ? new Date(c.birthdate).toLocaleDateString('th-TH') : '—';
  document.getElementById('detailAge').textContent = displayCustomerValue(customer.age);
  document.getElementById('detailCreatedAt').textContent = c.created_at ? new Date(c.created_at).toLocaleDateString('th-TH') : '—';
  document.getElementById('detailGender').textContent = displayCustomerValue(customer.gender);
  document.getElementById('detailOccupation').textContent = displayCustomerValue(customer.occupation);
  document.getElementById('detailEmail').textContent = displayCustomerValue(customer.email);
  document.getElementById('detailAddress').textContent = displayCustomerValue(customer.address);
  document.getElementById('detailHealthHistory').textContent = displayCustomerValue(customer.health_history);
  document.getElementById('detailProblem').textContent = displayCustomerValue(customer.current_eye_problem);
  document.getElementById('detailPurpose').textContent = displayCustomerValue(customer.purpose);
  document.getElementById('detailProgressiveExp').textContent = displayCustomerValue(customer.progressive_experience);
  document.getElementById('detailGlassesExp').textContent = displayCustomerValue(customer.glasses_experience);
  document.getElementById('detailOtherDetails').textContent = displayCustomerValue(customer.other_details);
}

async function updateCustomerField(customerId, field, newValue, extraFields = {}) {
  const payload = { [field]: newValue, ...extraFields };
  
  if (field === 'age' || payload.age !== undefined) {
    console.log('[DEBUG] Submitting Edit Payload:', payload);
  }

  if (field === 'first_name' && !String(newValue).trim()) {
    alert('ชื่อจำเป็นต้องไม่ว่าง');
    return false;
  }

  try {
    const response = await fetch(`/api/customers/${customerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      alert(err.error || 'ไม่สามารถบันทึกข้อมูลได้');
      return false;
    }

    const updated = await response.json();
    const idx = customersData.findIndex((c) => c.id === customerId);
    if (idx !== -1) customersData[idx] = updated;

    const searchInput = document.getElementById('searchInput');
    renderTable(filterCustomers(searchInput?.value || ''));

    return true;
  } catch (err) {
    alert('เกิดข้อผิดพลาดเครือข่าย กรุณาลองใหม่อีกครั้ง');
    console.error(err);
    return false;
  }
}

function restoreEditableDisplay(el, text) {
  el.innerHTML = '';
  el.textContent = text;
  endInlineEditSlot(el);
}

function rxCellDisplay(val) {
  return val == null || val === '' ? '-' : String(val);
}

function renderOldRxTable(rx) {
  OLD_RX_CELLS.forEach(([eye, key, tdId]) => {
    const td = document.getElementById(tdId);
    if (!td) return;
    const display = rxCellDisplay(rx?.[eye]?.[key]);
    td.innerHTML =
      `<span class="editable-rx inline-block w-full min-h-[28px] px-1 text-base rounded hover:bg-slate-200 cursor-text text-center" data-eye="${eye}" data-key="${key}">${escapeHtml(display)}</span>`;
  });
}

async function updateOldPrescriptionJson(customerId, rxObject) {
  try {
    const response = await fetch(`/api/customers/${customerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_prescription_json: rxObject }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      alert(err.error || 'ไม่สามารถบันทึกค่าสายตาเดิมได้');
      return false;
    }

    const updated = await response.json();
    const idx = customersData.findIndex((c) => c.id === customerId);
    if (idx !== -1) customersData[idx] = updated;

    return true;
  } catch (err) {
    alert('เกิดข้อผิดพลาดเครือข่าย กรุณาลองใหม่อีกครั้ง');
    console.error(err);
    return false;
  }
}

function setupRxInlineEditing(customerId, currentRxObject) {
  if (rxInlineEditAbortController) rxInlineEditAbortController.abort();
  rxInlineEditAbortController = new AbortController();
  const { signal } = rxInlineEditAbortController;

  document.querySelectorAll('#detailOldRxSection .editable-rx').forEach((span) => {
    span.addEventListener(
      'dblclick',
      (e) => {
        e.stopPropagation();
        if (document.body.classList.contains('read-only-active')) { alert('⛔ ระบบอยู่ในโหมดอ่านอย่างเดียว (Read-Only) เนื่องจากเวลาเครื่องไม่ตรง ไม่สามารถแก้ไขข้อมูลได้'); return; }
        if (span.querySelector('input')) return;

        const { eye, key } = span.dataset;
        if (!eye || !key) return;

        const originalText = span.textContent.trim();
        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalText === '-' ? '' : originalText;
        input.className = `${INLINE_EDIT_INNER_CLASS} text-center`;

        span.innerHTML = '';
        span.appendChild(input);
        input.focus();
        input.select();

        const restoreSpan = (text) => {
          span.innerHTML = '';
          span.textContent = rxCellDisplay(text);
        };

        let finished = false;
        const commit = async () => {
          if (finished) return;
          finished = true;

          const newVal = input.value.trim() || '-';
          if (newVal === originalText) {
            restoreSpan(originalText);
            return;
          }

          input.disabled = true;
          const prevStored = currentRxObject[eye]?.[key];
          if (!currentRxObject[eye]) currentRxObject[eye] = {};
          currentRxObject[eye][key] = newVal;

          const ok = await updateOldPrescriptionJson(customerId, currentRxObject);
          if (ok) {
            restoreSpan(newVal);
            span.classList.add('bg-green-100');
            setTimeout(() => span.classList.remove('bg-green-100'), 1000);
          } else {
            currentRxObject[eye][key] = prevStored;
            restoreSpan(originalText);
          }
        };

        input.addEventListener('blur', commit, { once: true });
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            input.removeEventListener('blur', commit);
            commit();
          } else if (ev.key === 'Escape') {
            ev.preventDefault();
            finished = true;
            input.removeEventListener('blur', commit);
            restoreSpan(originalText);
          }
        });
      },
      { signal }
    );
  });
}

function buildSelectOptions(el, currentValue) {
  const options = (el.dataset.options || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const result = [...options];
  if (!currentValue) {
    result.unshift('');
  } else if (!result.includes(currentValue)) {
    result.push(currentValue);
  }
  return result;
}

async function commitInlineEdit(el, customerId, field, originalText) {
  if (el.dataset.committing === 'true') return;

  const control = el.querySelector('input, select');
  if (!control) return;

  const newValue = control.value.trim();
  const previous = parseEditableValue(originalText);

  if (newValue === previous) {
    restoreEditableDisplay(el, displayCustomerValue(newValue));
    return;
  }

  el.dataset.committing = 'true';
  control.disabled = true;

  let parsedValue = newValue;
  if (field === 'birthdate' || field === 'created_at' || field === 'visit_date') {
    parsedValue = parseThaiDateInput(newValue);
  }

  const extraFields = {};
  if (field === 'glasses_experience') {
    if (newValue === 'ยังไม่เคยใส่แว่น') {
      extraFields.old_prescription_json = null;
    } else if (newValue === 'เคยใส่มาแล้ว') {
      extraFields.old_prescription_json = JSON.parse(JSON.stringify(EMPTY_OLD_RX));
    }
  }

  const ok = await updateCustomerField(customerId, field, parsedValue, extraFields);
  delete el.dataset.committing;

  if (ok) {
    if (field === 'glasses_experience') {
      await viewCustomer(customerId);
      return;
    }

    const display = displayCustomerValue(newValue);
    restoreEditableDisplay(el, display);
    el.classList.add('bg-green-100');
    setTimeout(() => el.classList.remove('bg-green-100'), 1000);

    if (field === 'first_name' || field === 'last_name') {
      const idx = customersData.findIndex((c) => c.id === customerId);
      if (idx !== -1) populateCustomerDetailFields(customersData[idx]);
    }
  } else {
    restoreEditableDisplay(el, originalText);
  }
}

function startInlineEdit(el, customerId) {
  if (document.body.classList.contains('read-only-active')) { alert('⛔ ระบบอยู่ในโหมดอ่านอย่างเดียว (Read-Only) เนื่องจากเวลาเครื่องไม่ตรง ไม่สามารถแก้ไขข้อมูลได้'); return; }
  if (el.querySelector('input, select')) return;

  const field = el.dataset.field;
  const originalText = el.textContent.trim();

  if (field === 'age') {
    console.log('[DEBUG] Double-click Edit. Populating Age:', originalText);
  }

  if (!field) return;

  const type = el.dataset.type || 'text';
  const currentValue = parseEditableValue(originalText);

  beginInlineEditSlot(el);
  el.innerHTML = '';

  if (type === 'select') {
    const select = document.createElement('select');
    select.className = INLINE_EDIT_INNER_CLASS;

    const optionValues = buildSelectOptions(el, currentValue);
    optionValues.forEach((val) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val || '—';
      if (val === currentValue) opt.selected = true;
      select.appendChild(opt);
    });

    if (!currentValue) select.value = '';

    el.appendChild(select);
    select.focus();

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      commitInlineEdit(el, customerId, field, originalText);
    };

    select.addEventListener('change', finish, { once: true });
    select.addEventListener('blur', finish, { once: true });
    select.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finished = true;
        restoreEditableDisplay(el, originalText);
      }
    });
    return;
  }

  const inputType = 'text';
  const input = document.createElement('input');
  input.type = inputType;
  if (field === 'birthdate' || field === 'created_at' || field === 'visit_date') {
    input.placeholder = 'วว/ดด/ปปปป';
    input.classList.add('thai-date-input');
  }
  input.value = currentValue;
  input.className = INLINE_EDIT_INNER_CLASS;
  el.appendChild(input);

  input.focus();
  if (inputType === 'text') input.select();

  const finish = () => commitInlineEdit(el, customerId, field, originalText);

  input.addEventListener('blur', finish, { once: true });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.removeEventListener('blur', finish);
      finish();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      input.removeEventListener('blur', finish);
      restoreEditableDisplay(el, originalText);
    }
  });
}

function setupInlineEditing(customerId) {
  if (inlineEditAbortController) inlineEditAbortController.abort();
  inlineEditAbortController = new AbortController();
  const { signal } = inlineEditAbortController;

  document.querySelectorAll('#customerDetailModal .editable-field').forEach((el) => {
    el.addEventListener(
      'dblclick',
      (e) => {
        e.stopPropagation();
        if (document.body.classList.contains('read-only-active')) { alert('⛔ ระบบอยู่ในโหมดอ่านอย่างเดียว (Read-Only) เนื่องจากเวลาเครื่องไม่ตรง ไม่สามารถแก้ไขข้อมูลได้'); return; }
        startInlineEdit(el, customerId);
      },
      { signal }
    );
  });
}

function openModal() {
  const form = document.getElementById('customerForm');
  form.reset();
  const now = new Date();
  document.getElementById('customer-date').value = formatDateToThaiBE(now);
  document.getElementById('customerModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('customerModal').classList.add('hidden');
}

function openDetailModal() {
  document.getElementById('customerDetailModal').classList.remove('hidden');
}

function closeDetailModal() {
  document.getElementById('customerDetailModal').classList.add('hidden');
  currentViewCustomerId = null;
}

async function viewCustomer(customerId) {
  try {
    const [customerRes, visitsRes] = await Promise.all([
      fetch(`/api/customers/${customerId}`),
      fetch(`/api/visits/customer/${customerId}`),
    ]);

    if (!customerRes.ok) throw new Error('Customer not found');
    const customer = await customerRes.json();
    const rawVisits = visitsRes.ok ? await visitsRes.json() : [];
    const visits = rawVisits.sort((a, b) => a.visit_number - b.visit_number);

    currentViewCustomerId = customerId;
    currentCustomerVisits = visits;

    populateCustomerDetailFields(customer);

    // Old Prescription
    const oldRxSection = document.getElementById('detailOldRxSection');
    if (customer.old_prescription_json) {
      try {
        const parsed = typeof customer.old_prescription_json === 'string'
          ? JSON.parse(customer.old_prescription_json)
          : customer.old_prescription_json;
        const rx = JSON.parse(JSON.stringify(parsed));
        renderOldRxTable(rx);
        oldRxSection.classList.remove('hidden');
        setupRxInlineEditing(customer.id, rx);
      } catch {
        oldRxSection.classList.add('hidden');
        if (rxInlineEditAbortController) rxInlineEditAbortController.abort();
      }
    } else {
      oldRxSection.classList.add('hidden');
      if (rxInlineEditAbortController) rxInlineEditAbortController.abort();
    }

    renderVisitTable(visits);
    openDetailModal();
    setupInlineEditing(customer.id);
  } catch (err) {
    alert('ไม่สามารถโหลดข้อมูลลูกค้าได้');
    console.error(err);
  }
}
window.viewCustomer = viewCustomer;

async function fetchCustomers() {
  try {
    const response = await fetch('/api/customers');
    if (!response.ok) throw new Error('Failed to fetch customers');
    customersData = await response.json();
    renderTable(customersData);
  } catch (err) {
    const tbody = document.getElementById('customerTableBody');
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-6 py-8 text-center text-red-500">
          เกิดข้อผิดพลาดในการโหลดข้อมูลลูกค้า กรุณาตรวจสอบว่าเซิร์ฟเวอร์ทำงานอยู่
        </td>
      </tr>
    `;
    console.error(err);
  }
}

function renderTable(data) {
  const tbody = document.getElementById('customerTableBody');

  if (!data || data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-6 py-12 text-center text-slate-400">
          <p class="font-medium">ไม่พบข้อมูลลูกค้า</p>
          <p class="text-sm mt-1">ลองปรับคำค้นหา หรือเพิ่มลูกค้าใหม่</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = data
    .map(
      (customer) => `
    <tr onclick="viewCustomer(${customer.id})" class="cursor-pointer hover:bg-blue-50 transition-colors">
      <td class="px-6 py-4 text-slate-500 font-mono text-xs">${escapeHtml(customer.id)}</td>
      <td class="px-6 py-4 font-medium text-slate-800">${escapeHtml(customer.first_name)}</td>
      <td class="px-6 py-4 text-slate-600">${escapeHtml(customer.last_name || '—')}</td>
      <td class="px-6 py-4 text-slate-600">${escapeHtml(getDisplayPhone(customer))}</td>
      <td class="px-6 py-4 text-right text-slate-300 text-xs">···</td>
    </tr>
  `
    )
    .join('');
}

function filterCustomers(query) {
  const q = query.trim().toLowerCase();
  if (!q) return customersData;

  return customersData.filter((customer) => {
    const firstName = (customer.first_name || '').toLowerCase();
    const lastName = (customer.last_name || '').toLowerCase();
    const phone = (customer.tel_mobile || '').toLowerCase();
    return firstName.includes(q) || lastName.includes(q) || phone.includes(q);
  });
}


window.currentViewCustomerId = null;
window.currentCustomerVisits = [];

function openVisitModal() {
  if (!currentViewCustomerId) {
    alert('ไม่ได้เลือกลูกค้า');
    return;
  }
  const form = document.getElementById('visitForm');
  form.reset();
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('visit-date').value = now.toISOString().slice(0, 10);
  document.getElementById('visitModal').classList.remove('hidden');
}

function closeVisitModal() {
  document.getElementById('visitModal').classList.add('hidden');
}

async function refreshCustomerVisits() {
  if (!currentViewCustomerId) return;
  const res = await fetch(`/api/visits/customer/${currentViewCustomerId}`);
  const visits = res.ok ? await res.json() : [];
  renderVisitTable(visits);
}

function renderVisitTable(visits) {
  const tbody = document.getElementById('visitTableBody');
  if (!visits.length) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="px-4 py-6 text-center text-slate-400">ไม่พบประวัติการมาร้าน</td></tr>';
    return;
  }

  tbody.innerHTML = visits
    .map(
      (v) => `
    <tr class="hover:bg-slate-50">
      <td class="px-4 py-3">${escapeHtml(v.visit_number ?? '—')}</td>
      <td class="px-4 py-3">${escapeHtml(v.visit_date ? new Date(v.visit_date).toLocaleDateString('th-TH') : '—')}</td>
      <td class="px-4 py-3">${escapeHtml(mapPrescriptionType(v.prescription_type) || '—')}</td>
      <td class="px-4 py-3">${escapeHtml(v.examiner || '—')}</td>
      <td class="px-4 py-3">${escapeHtml(v.salesperson || '—')}</td>
      <td class="px-4 py-3 text-right">
        <button
          type="button"
          onclick="viewVisit(${v.id})"
          class="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors mr-1.5"
        >
          ดู
        </button>
        <button
          type="button"
          onclick="editVisit(${v.id})"
          class="inline-flex items-center px-3 py-1.5 text-xs font-medium text-amber-600 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors${document.body.classList.contains('read-only-active') ? ' opacity-50 cursor-not-allowed' : ''}"
          ${document.body.classList.contains('read-only-active') ? 'disabled' : ''}
        >
          แก้ไข
        </button>
      </td>
    </tr>
  `
    )
    .join('');
}


// Shared list of all editable visit fields
const VISIT_FIELDS = [
  'visit_date', 'examiner', 'salesperson', 'dispenser',
  'va_empty_r', 'va_empty_l', 'va_empty_total',
  'rx_obj_r_sph', 'rx_obj_r_cyl', 'rx_obj_r_axis', 'rx_obj_r_add', 'rx_obj_r_pd', 'rx_obj_r_h',
  'rx_obj_l_sph', 'rx_obj_l_cyl', 'rx_obj_l_axis', 'rx_obj_l_add', 'rx_obj_l_pd', 'rx_obj_l_h',
  'rx_subj_r_sph', 'rx_subj_r_cyl', 'rx_subj_r_axis', 'rx_subj_r_add', 'rx_subj_r_pd', 'rx_subj_r_h',
  'rx_subj_l_sph', 'rx_subj_l_cyl', 'rx_subj_l_axis', 'rx_subj_l_add', 'rx_subj_l_pd', 'rx_subj_l_h',
  'prescription_type', 'recommended_lens',
  'lens_type', 'lens_color', 'lens_price',
  'glasses_type', 'frame_model', 'frame_price',
  'notes',
];

function populateVisitForm(visit) {
  const form = document.getElementById('visitForm');
  form.reset();
  VISIT_FIELDS.forEach((field) => {
    const el = form.elements[field];
    if (!el) return;
    if (field === 'visit_date' && visit[field]) {
      el.value = formatDateToThaiBE(visit[field]);
    } else if (field === 'prescription_type' && visit[field]) {
      el.value = mapPrescriptionType(visit[field]);
    } else {
      el.value = visit[field] ?? '';
    }
  });
}

function setVisitFormMode(isReadOnly) {
  const form = document.getElementById('visitForm');
  const controls = form.querySelectorAll('input:not([type="hidden"]), select, textarea');
  controls.forEach((el) => {
    el.disabled = isReadOnly;
  });
  const saveBtn = document.getElementById('saveVisitBtn');
  if (saveBtn) saveBtn.classList.toggle('hidden', isReadOnly);
}

function viewVisit(visitId) {
  const visit = currentCustomerVisits.find((v) => v.id === visitId);
  if (!visit) {
    alert('ไม่พบข้อมูลประวัติ');
    return;
  }
  populateVisitForm(visit);
  document.getElementById('visitId').value = '';
  document.getElementById('visitModalTitle').textContent =
    `รายละเอียดประวัติ ครั้งที่ ${visit.visit_number}`;
  setVisitFormMode(true);
  document.getElementById('visitModal').classList.remove('hidden');
}
window.viewVisit = viewVisit;

function editVisit(visitId) {
  if (document.body.classList.contains('read-only-active')) { alert('⛔ ระบบอยู่ในโหมดอ่านอย่างเดียว (Read-Only) เนื่องจากเวลาเครื่องไม่ตรง ไม่สามารถแก้ไขข้อมูลได้'); return; }
  const visit = currentCustomerVisits.find((v) => v.id === visitId);
  if (!visit) {
    alert('ไม่พบข้อมูลประวัติ');
    return;
  }
  populateVisitForm(visit);
  document.getElementById('visitId').value = visitId;
  document.getElementById('visitModalTitle').textContent =
    `แก้ไขประวัติ ครั้งที่ ${visit.visit_number}`;
  setVisitFormMode(false);
  document.getElementById('visitModal').classList.remove('hidden');
}
window.editVisit = editVisit;


document.addEventListener('DOMContentLoaded', () => {
  fetchCustomers();

  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', (e) => {
    const filtered = filterCustomers(e.target.value);
    renderTable(filtered);
  });

  const addCustomerBtn = document.getElementById('addCustomerBtn');
  const customerForm = document.getElementById('customerForm');
  const cancelCustomerBtn = document.getElementById('cancelCustomerBtn');

  addCustomerBtn.addEventListener('click', openModal);
  cancelCustomerBtn.addEventListener('click', closeModal);

  document.getElementById('closeDetailModalBtn').addEventListener('click', closeDetailModal);
  document.getElementById('closeDetailFooterBtn').addEventListener('click', closeDetailModal);

  document.getElementById('addNewVisitBtn').addEventListener('click', () => {
    if (document.body.classList.contains('read-only-active')) { alert('⛔ ระบบอยู่ในโหมดอ่านอย่างเดียว (Read-Only) เนื่องจากเวลาเครื่องไม่ตรง ไม่สามารถแก้ไขข้อมูลได้'); return; }
    if (!currentViewCustomerId) {
      alert('ไม่ได้เลือกลูกค้า');
      return;
    }
    const form = document.getElementById('visitForm');
    form.reset();
    document.getElementById('visitId').value = '';
    document.getElementById('visitModalTitle').textContent = '+ เพิ่มประวัติใหม่';
    const now = new Date();
    document.getElementById('visit-date').value = formatDateToThaiBE(now);
    setVisitFormMode(false);
    document.getElementById('visitModal').classList.remove('hidden');
  });
  document.getElementById('cancelVisitBtn').addEventListener('click', closeVisitModal);

  const visitForm = document.getElementById('visitForm');
  visitForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'กำลังบันทึก...';

    try {
      const payload = Object.fromEntries(new FormData(e.target).entries());
      if (payload.visit_date) payload.visit_date = parseThaiDateInput(payload.visit_date);
      const visitId = payload.visitId;
      delete payload.visitId;

      const isEdit = !!visitId;
      const url = isEdit ? `/api/visits/${visitId}` : '/api/visits';
      const method = isEdit ? 'PUT' : 'POST';

      if (!isEdit) {
        payload.customer_id = currentViewCustomerId;
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const expectedStatus = isEdit ? 200 : 201;
      if (response.status === expectedStatus || response.ok) {
        closeVisitModal();
        const visitsRes = await fetch(`/api/visits/customer/${currentViewCustomerId}`);
        const rawVisits = visitsRes.ok ? await visitsRes.json() : [];
        const visits = rawVisits.sort((a, b) => a.visit_number - b.visit_number);
        currentCustomerVisits = visits;
        renderVisitTable(visits);
      } else {
        const err = await response.json();
        alert(err.error || 'ไม่สามารถบันทึกประวัติได้');
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาดเครือข่าย กรุณาลองใหม่อีกครั้ง');
      console.error(err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });

  // --- Purpose toggle ---
  document.getElementById('purpose').addEventListener('change', (e) => {
    const otherInput = document.getElementById('purpose_other');
    if (e.target.value === 'อื่นๆ') {
      otherInput.classList.remove('hidden');
    } else {
      otherInput.classList.add('hidden');
      otherInput.value = '';
    }
  });

  // --- Glasses experience toggle ---
  document.querySelectorAll('input[name="glasses_experience"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      const section = document.getElementById('oldPrescriptionSection');
      if (e.target.value === 'เคยใส่มาแล้ว') {
        section.classList.remove('hidden');
      } else {
        section.classList.add('hidden');
        section.querySelectorAll('input[type="text"]').forEach((inp) => { inp.value = ''; });
      }
    });
  });


  customerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'กำลังบันทึก...';

    try {
      const formData = new FormData(e.target);
      const payload = Object.fromEntries(formData.entries());
      
      if (payload.created_at) payload.created_at = parseThaiDateInput(payload.created_at);
      if (payload.birthdate) payload.birthdate = parseThaiDateInput(payload.birthdate);

      // Resolve purpose_other override
      if (payload.purpose === 'อื่นๆ' && payload.purpose_other) {
        payload.purpose = payload.purpose_other;
      }
      delete payload.purpose_other;

      // Build old_prescription_json if glasses were worn before
      if (payload.glasses_experience === 'เคยใส่มาแล้ว') {
        const getVal = (id) => document.getElementById(id)?.value?.trim() || null;
        payload.old_prescription_json = {
          R: { SPH: getVal('old_r_sph'), CYL: getVal('old_r_cyl'), AXIS: getVal('old_r_axis'), ADD: getVal('old_r_add'), PD: getVal('old_r_pd'), H: getVal('old_r_h') },
          L: { SPH: getVal('old_l_sph'), CYL: getVal('old_l_cyl'), AXIS: getVal('old_l_axis'), ADD: getVal('old_l_add'), PD: getVal('old_l_pd'), H: getVal('old_l_h') },
        };
      } else {
        delete payload.old_prescription_json;
      }

      // Remove old_rx individual fields (not columns in customers table)
      ['old_r_sph','old_r_cyl','old_r_axis','old_r_add','old_r_pd','old_r_h',
       'old_l_sph','old_l_cyl','old_l_axis','old_l_add','old_l_pd','old_l_h'].forEach(k => delete payload[k]);

      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.status === 201) {
        closeModal();
        e.target.reset();
        // Reset dynamic sections
        document.getElementById('purpose_other').classList.add('hidden');
        document.getElementById('oldPrescriptionSection').classList.add('hidden');
        await fetchCustomers();
      } else {
        const err = await response.json();
        alert(err.error || 'ไม่สามารถบันทึกข้อมูลลูกค้าได้');
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาดเครือข่าย กรุณาลองใหม่อีกครั้ง');
      console.error(err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });
});
