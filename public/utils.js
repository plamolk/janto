function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

function formatMoney(amount) {
  const n = Number(amount) || 0;
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ═══════════════════════════════════════════════════════════════════════════
// Mission B — System Health Monitor & Read-Only Mode
// ═══════════════════════════════════════════════════════════════════════════

let _healthInterval = null;
let _isReadOnly = false;

// ─── IDs/classes that should NEVER be disabled by read-only mode ─────────
const READ_ONLY_EXEMPT = [
  'searchInput',           // Customer search bar
  'filterBillingText',     // Billing search bar
  'filterBillingDate',     // Billing date filter
  'filterBillingType',     // Billing type filter
  'navCustomers',          // Navigation link
  'navBilling',            // Navigation link
  'closeDetailModalBtn',   // Close modal buttons
  'closeDetailFooterBtn',
  'cancelCustomerBtn',
  'cancelVisitBtn',
  'cancelBillingBtn',
];

// ═══════════════════════════════════════════════════════════════════════════
// startSystemHealthMonitor()
// Polls GET /api/health every 10 seconds.
// ═══════════════════════════════════════════════════════════════════════════
function startSystemHealthMonitor() {
  // Run immediately on startup
  _checkHealth();

  // Then poll every 10 seconds
  _healthInterval = setInterval(_checkHealth, 10_000);

  console.log('🩺 System Health Monitor started (polling every 10s)');
}

async function _checkHealth() {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    updateGlobalAlert(data);
  } catch (err) {
    // Server is completely unreachable
    updateGlobalAlert({
      status: 'critical',
      alertType: 'api_error',
      message: '⛔ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ — ตรวจสอบว่าระบบยังทำงานอยู่',
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// updateGlobalAlert(healthData)
// Shows/hides the fixed top banner based on system health status.
// ═══════════════════════════════════════════════════════════════════════════
function updateGlobalAlert(healthData) {
  const banner = document.getElementById('global-alert-banner');
  if (!banner) return;

  const { status, alertType, message } = healthData;

  // ── All OK → hide banner & restore read-only if needed ────────────────
  if (status === 'ok') {
    banner.style.display = 'none';
    banner.textContent = '';
    document.body.style.paddingTop = '0';

    if (_isReadOnly) {
      disableReadOnlyMode();
    }
    return;
  }

  // ── Show the banner ───────────────────────────────────────────────────
  banner.textContent = message || 'ระบบมีปัญหา';
  banner.style.display = 'block';

  if (status === 'critical') {
    banner.style.backgroundColor = '#dc2626'; // red-600
    banner.style.color = '#ffffff';
  } else if (status === 'warning') {
    banner.style.backgroundColor = '#f59e0b'; // amber-500
    banner.style.color = '#1e293b';            // slate-800
  }

  // Push page content down so it's not hidden behind the fixed banner
  document.body.style.paddingTop = banner.offsetHeight + 'px';

  // ── Time desync → lock the entire UI into read-only mode ──────────────
  if (alertType === 'time_desync') {
    enableReadOnlyMode();
  } else if (_isReadOnly && alertType !== 'time_desync') {
    disableReadOnlyMode();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// enableReadOnlyMode()
// Surgically disables ONLY data-mutation controls:
//   • Buttons whose text contains CUD keywords (บันทึก, เพิ่ม, ลบ, แก้ไข,
//     Save, Delete, Edit, Create, Update, Submit)
//   • All inputs/selects/textareas inside forms tagged [data-edit-form]
// Explicitly NEVER disables:
//   • Search inputs (type=search, id contains 'search', has placeholder)
//   • Navigation buttons/links (inside nav, aside, or tagged [data-nav])
//   • View/detail/pagination buttons (tagged [data-view-btn])
//   • The global alert banner itself
// ═══════════════════════════════════════════════════════════════════════════
const MUTATION_KEYWORDS = [
  'บันทึก', 'เพิ่ม', 'ลบ', 'แก้ไข', 'ยืนยัน',
  'save', 'delete', 'edit', 'create', 'update', 'submit', 'add',
];

function _isMutationButton(el) {
  if (el.tagName !== 'BUTTON' && el.type !== 'submit') return false;
  const text = (el.textContent || el.value || el.title || '').toLowerCase().trim();
  return MUTATION_KEYWORDS.some((kw) => text.includes(kw));
}

function _isSearchInput(el) {
  if (el.type === 'search') return true;
  if ((el.id || '').toLowerCase().includes('search')) return true;
  if ((el.id || '').toLowerCase().includes('filter')) return true;
  if ((el.placeholder || '').length > 0 && el.type === 'text') {
    // Inputs with a search-flavored placeholder are exempt
    const ph = el.placeholder.toLowerCase();
    if (ph.includes('ค้นหา') || ph.includes('search') || ph.includes('filter')) return true;
  }
  return false;
}

function enableReadOnlyMode() {
  if (_isReadOnly) return;
  _isReadOnly = true;
  document.body.classList.add('read-only-active');

  // ── Target 1: Mutation buttons anywhere in the document ───────────────
  document.querySelectorAll('button, input[type="submit"]').forEach((el) => {
    if (el.closest('#global-alert-banner')) return;
    if (READ_ONLY_EXEMPT.includes(el.id)) return;
    if (el.dataset.viewBtn || el.dataset.navBtn) return;  // [data-view-btn], [data-nav-btn]
    if (el.closest('nav') || el.closest('aside')) return;
    if (!_isMutationButton(el)) return; // skip non-mutation buttons (view, nav, pagination)

    el.disabled = true;
    el.dataset.readOnlyDisabled = 'true';
    el.style.opacity = '0.5';
    el.style.cursor = 'not-allowed';
  });

  // ── Target 2: All inputs/selects/textareas inside designated edit forms ─
  document.querySelectorAll('form[data-edit-form] input, form[data-edit-form] select, form[data-edit-form] textarea').forEach((el) => {
    if (_isSearchInput(el)) return;
    if (READ_ONLY_EXEMPT.includes(el.id)) return;

    el.disabled = true;
    el.dataset.readOnlyDisabled = 'true';
    el.style.opacity = '0.5';
    el.style.cursor = 'not-allowed';
  });

  console.warn('🔒 Read-Only Mode ENABLED — mutation controls locked, search/nav/view untouched');
}

// ═══════════════════════════════════════════════════════════════════════════
// disableReadOnlyMode()
// Restores all elements that were disabled by enableReadOnlyMode().
// ═══════════════════════════════════════════════════════════════════════════
function disableReadOnlyMode() {
  if (!_isReadOnly) return;
  _isReadOnly = false;
  document.body.classList.remove('read-only-active');

  document.querySelectorAll('[data-read-only-disabled="true"]').forEach((el) => {
    el.disabled = false;
    el.removeAttribute('data-read-only-disabled');
    el.style.opacity = '';
    el.style.cursor = '';
  });

  console.log('🔓 Read-Only Mode DISABLED — inputs are unlocked');
}

// ─── Auto-start on page load ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  startSystemHealthMonitor();
});
