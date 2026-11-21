/**
 * TripSplit — Payments Controller
 * Manages user's sent and received payment claims, confirmation, and status auditing.
 */

import { requireAuth } from './auth-guard.js';
import { api, setApiAuthUser } from './api.js';
import { logoutUser } from './auth.js';
import { showAlert, clearAlerts, escapeHtml } from './ui.js';

let allPayments = [];
let currentFilter = 'all';
let currentUser = null;
let confirmCallback = null;
let listenersInitialized = false;

// Initialize event listeners immediately
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupEventListeners);
} else {
  setupEventListeners();
}

requireAuth((authUser) => {
  currentUser = authUser;
  setApiAuthUser(authUser);
  loadPaymentsData();
});

async function loadPaymentsData() {
  const loading = document.getElementById('payments-loading');
  const content = document.getElementById('payments-content');
  const errorBox = document.getElementById('payments-error');
  const errMsg = document.getElementById('payments-error-message');
  const retryBtn = document.getElementById('payments-retry-btn');

  const safetyTimer = setTimeout(() => {
    if (loading && loading.style.display !== 'none') {
      loading.style.display = 'none';
      if (content) content.style.display = 'block';
    }
  }, 2500);

  try {
    const res = await api.get('/api/payments').catch(err => {
      console.warn('[Payments] Fetch fallback:', err.message);
      return { data: [] };
    });
    allPayments = res.data || [];

    updateMetrics();
    renderPaymentsTable();
  } catch (err) {
    console.error('Failed to load payments:', err);
    if (errMsg) errMsg.textContent = err.message || 'Failed to load payments.';
    if (retryBtn) retryBtn.onclick = () => loadPaymentsData();
  } finally {
    clearTimeout(safetyTimer);
    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'block';
  }
}

function updateMetrics() {
  let pendingCount = 0;
  let confirmedReceivedPaise = 0;
  let confirmedPaidPaise = 0;

  for (const p of allPayments) {
    if (p.payeeId === currentUser?.uid && p.status === 'REPORTED') {
      pendingCount++;
    }
    if (p.status === 'CONFIRMED') {
      if (p.payeeId === currentUser?.uid) {
        confirmedReceivedPaise += p.amountPaise || 0;
      }
      if (p.payerId === currentUser?.uid) {
        confirmedPaidPaise += p.amountPaise || 0;
      }
    }
  }

  const pendingEl = document.getElementById('metric-pending-claims');
  const receivedEl = document.getElementById('metric-total-received');
  const paidEl = document.getElementById('metric-total-paid');

  if (pendingEl) pendingEl.textContent = pendingCount;
  if (receivedEl) receivedEl.textContent = `₹${(confirmedReceivedPaise / 100).toFixed(2)}`;
  if (paidEl) paidEl.textContent = `₹${(confirmedPaidPaise / 100).toFixed(2)}`;
}

function renderPaymentsTable() {
  const tbody = document.getElementById('payments-table-body');
  const emptyState = document.getElementById('payments-empty-state');
  const table = document.getElementById('payments-table');

  if (!tbody) return;

  const filtered = allPayments.filter(p => {
    if (currentFilter === 'all') return true;
    if (currentFilter === 'PENDING') return p.status === 'REPORTED';
    return p.status === currentFilter;
  });

  if (filtered.length === 0) {
    if (table) table.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (table) table.style.display = 'table';
  if (emptyState) emptyState.style.display = 'none';

  tbody.innerHTML = filtered.map(p => {
    const isPayer = p.payerId === currentUser?.uid;
    const isPayee = p.payeeId === currentUser?.uid;
    const isPending = p.status === 'REPORTED';
    const amountRs = ((p.amountPaise || 0) / 100).toFixed(2);
    const dateStr = p.createdAt ? new Date(p.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';

    let badgeClass = 'badge-light';
    let statusLabel = p.status;
    if (p.status === 'CONFIRMED') {
      badgeClass = 'badge-success';
      statusLabel = 'CONFIRMED';
    } else if (p.status === 'REJECTED') {
      badgeClass = 'badge-danger';
      statusLabel = 'REJECTED';
    } else if (p.status === 'REPORTED') {
      badgeClass = 'badge-warning';
      statusLabel = 'PENDING APPROVAL';
    }

    return `
      <tr>
        <td>
          <div style="font-weight: 600; color: var(--color-navy);">${escapeHtml(p.tripName || 'Travel Trip')}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">Ref: ${escapeHtml(p.paymentId || '')}</div>
        </td>
        <td>
          <div>${isPayer ? '<strong>You</strong>' : escapeHtml(p.payerName || 'Friend')} &rarr; ${isPayee ? '<strong>You</strong>' : escapeHtml(p.payeeName || 'Receiver')}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">Method: ${escapeHtml(p.paymentMethod || 'UPI')}</div>
        </td>
        <td>
          <div style="font-weight: 700; color: ${isPayer ? 'var(--color-danger)' : 'var(--color-success)'};">
            ${isPayer ? '-' : '+'}₹${amountRs}
          </div>
        </td>
        <td>
          <span class="user-code-pill" style="font-size: 0.8rem;">${escapeHtml(p.utr || 'N/A')}</span>
        </td>
        <td>
          <span class="badge ${badgeClass}">${statusLabel}</span>
          ${p.rejectionReason ? `<div style="font-size: 0.75rem; color: var(--color-danger); margin-top: 0.25rem;">Reason: ${escapeHtml(p.rejectionReason)}</div>` : ''}
        </td>
        <td style="font-size: 0.85rem; color: var(--text-muted);">
          ${escapeHtml(dateStr)}
        </td>
        <td>
          ${isPayee && isPending ? `
            <div style="display: flex; gap: 0.5rem;">
              <button type="button" class="btn btn-primary btn-sm confirm-payment-btn" data-id="${escapeHtml(p.paymentId)}">Confirm</button>
              <button type="button" class="btn btn-outline btn-sm reject-payment-btn" data-id="${escapeHtml(p.paymentId)}" style="color: var(--color-danger); border-color: var(--color-danger);">Reject</button>
            </div>
          ` : `
            <span style="font-size: 0.8rem; color: var(--text-light);">&mdash;</span>
          `}
        </td>
      </tr>
    `;
  }).join('');

  // Attach table button listeners
  tbody.querySelectorAll('.confirm-payment-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const pid = e.currentTarget.getAttribute('data-id');
      openConfirmModal(pid);
    });
  });

  tbody.querySelectorAll('.reject-payment-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const pid = e.currentTarget.getAttribute('data-id');
      openRejectModal(pid);
    });
  });
}

function openConfirmModal(paymentId) {
  const modal = document.getElementById('confirm-modal');
  const alertEl = document.getElementById('confirm-modal-alert');
  if (alertEl) clearAlerts(alertEl);
  confirmCallback = async () => {
    try {
      await api.post(`/api/payments/${paymentId}/confirm`);
      closeModals();
      loadPaymentsData();
    } catch (err) {
      if (alertEl) showAlert(alertEl, err.message || 'Failed to confirm payment.', 'danger');
    }
  };
  if (modal) modal.classList.add('is-active');
}

function openRejectModal(paymentId) {
  const modal = document.getElementById('reject-modal');
  const alertEl = document.getElementById('reject-modal-alert');
  const reasonInput = document.getElementById('reject-reason-input');
  if (alertEl) clearAlerts(alertEl);
  if (reasonInput) reasonInput.value = '';

  const confirmRejectBtn = document.getElementById('confirm-reject-btn');
  if (confirmRejectBtn) {
    confirmRejectBtn.onclick = async () => {
      const reason = reasonInput ? reasonInput.value.trim() : '';
      if (!reason) {
        if (alertEl) showAlert(alertEl, 'Please provide a reason for rejecting this claim.', 'danger');
        return;
      }
      try {
        await api.post(`/api/payments/${paymentId}/reject`, { reason });
        closeModals();
        loadPaymentsData();
      } catch (err) {
        if (alertEl) showAlert(alertEl, err.message || 'Failed to reject payment.', 'danger');
      }
    };
  }
  if (modal) modal.classList.add('is-active');
}

function closeModals() {
  document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('is-active'));
}

function setupEventListeners() {
  if (listenersInitialized) return;
  listenersInitialized = true;

  const logoutBtn = document.getElementById('pay-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await logoutUser();
        window.location.href = '/index.html';
      } catch (err) {
        console.error('Logout error:', err);
        window.location.href = '/login.html';
      }
    });
  }

  // Filter pills
  const filterPills = document.querySelectorAll('.filter-pill');
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => {
        p.classList.remove('active');
        p.setAttribute('aria-selected', 'false');
      });
      pill.classList.add('active');
      pill.setAttribute('aria-selected', 'true');
      currentFilter = pill.getAttribute('data-filter');
      renderPaymentsTable();
    });
  });

  // Modal close buttons
  document.querySelectorAll('.modal-close, .modal-cancel-btn').forEach(btn => {
    btn.addEventListener('click', closeModals);
  });

  const confirmActionBtn = document.getElementById('confirm-action-btn');
  if (confirmActionBtn) {
    confirmActionBtn.addEventListener('click', () => {
      if (confirmCallback) confirmCallback();
    });
  }
}
