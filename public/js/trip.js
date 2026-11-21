/**
 * TripSplit — Trip Controller
 * Manages full trip ledger: Overview, Expenses, Members, Balances, Min-Cash-Flow Settlements,
 * UPI Deep Links, QR Code generation, and Receiver Payment Confirmations.
 */

import { requireAuth } from './auth-guard.js';
import { api, setApiAuthUser } from './api.js';
import { logoutUser } from './auth.js';
import { showAlert, clearAlerts, escapeHtml } from './ui.js';
import { generateQrSvg } from './qrcode.js';

let tripId = null;
let currentTrip = null;
let tripMembers = [];
let tripExpenses = [];
let tripBalances = null;
let tripSettlements = [];
let tripInvitations = [];
let incomingClaims = [];
let currentUser = null;
let activeSettlementForPayment = null;

// Parse trip ID from URL query parameters
const urlParams = new URLSearchParams(window.location.search);
tripId = urlParams.get('id');

if (!tripId) {
  window.location.href = '/dashboard.html';
}

requireAuth((authUser) => {
  currentUser = authUser;
  setApiAuthUser(authUser);
  initTripPage();
  setupGlobalEvents();
});

async function initTripPage() {
  const loadingContainer = document.getElementById('trip-loading');
  const contentContainer = document.getElementById('trip-content');
  const errorContainer = document.getElementById('trip-error');
  const errorMessageEl = document.getElementById('trip-error-message');

  loadingContainer.style.display = 'flex';
  contentContainer.style.display = 'none';
  errorContainer.style.display = 'none';

  try {
    // 1. Fetch Trip Details
    const tripRes = await api.get(`/api/trips/${tripId}`);
    currentTrip = tripRes.data;

    // 2. Fetch Members, Expenses, Balances, Settlements, Invitations in parallel
    const [membersRes, expRes, balRes, setRes, invRes, payRes] = await Promise.all([
      api.get(`/api/trips/${tripId}/members`),
      api.get(`/api/trips/${tripId}/expenses`),
      api.get(`/api/trips/${tripId}/balances`),
      api.get(`/api/trips/${tripId}/settlements`),
      api.get(`/api/trips/${tripId}/invitations`).catch(() => ({ data: [] })),
      api.get('/api/payments?type=received&status=REPORTED').catch(() => ({ data: [] }))
    ]);

    tripMembers = membersRes.data || [];
    tripExpenses = expRes.data || [];
    tripBalances = balRes.data || null;
    tripSettlements = setRes.data || [];
    tripInvitations = invRes.data || [];
    // Filter claims relevant to this trip
    incomingClaims = (payRes.data || []).filter(p => p.tripId === tripId);

    // 3. Render all views
    renderHeader();
    renderOverview();
    renderExpenses();
    renderMembers();
    renderBalances();
    renderSettlements();

    loadingContainer.style.display = 'none';
    contentContainer.style.display = 'block';
  } catch (err) {
    console.error('Failed to load trip:', err);
    loadingContainer.style.display = 'none';
    errorContainer.style.display = 'block';
    if (errorMessageEl) {
      errorMessageEl.textContent = err.message || 'You might not have permission to view this trip or it does not exist.';
    }
  }
}

// Format integer paise into standard formatted rupee string
function formatPaise(paise) {
  const isNegative = paise < 0;
  const abs = Math.abs(paise || 0);
  const rupees = (abs / 100).toFixed(2);
  return `${isNegative ? '-' : ''}₹${rupees}`;
}

function renderHeader() {
  const nameEl = document.getElementById('trip-name-display');
  const destEl = document.getElementById('trip-destination-display');
  const datesEl = document.getElementById('trip-dates-display');
  const creatorEl = document.getElementById('trip-creator-display');
  const statusBadge = document.getElementById('trip-status-badge');
  const roleBadge = document.getElementById('trip-role-badge');
  const endTripBtn = document.getElementById('end-trip-btn');
  const addExpBtn = document.getElementById('open-add-expense-btn');

  if (nameEl) nameEl.textContent = currentTrip.name;
  if (destEl) destEl.textContent = currentTrip.destination;

  if (datesEl) {
    if (currentTrip.startDate) {
      const s = new Date(currentTrip.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const e = currentTrip.endDate ? new Date(currentTrip.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      datesEl.textContent = `${s} ${e ? '– ' + e : ''}`;
    } else {
      datesEl.textContent = 'Dates flexible';
    }
  }

  if (creatorEl) creatorEl.textContent = currentTrip.creatorName || 'Trip Owner';

  const isEnded = currentTrip.status === 'ENDED';
  if (statusBadge) {
    statusBadge.textContent = isEnded ? 'ENDED' : 'ACTIVE';
    statusBadge.className = `badge ${isEnded ? 'badge-muted' : 'badge-success'}`;
  }

  if (roleBadge) {
    roleBadge.textContent = currentTrip.role === 'OWNER' ? '👑 Owner' : 'Member';
    roleBadge.className = `badge ${currentTrip.role === 'OWNER' ? 'badge-navy' : 'badge-cyan'}`;
  }

  // If trip has ended, disable financial actions
  if (isEnded) {
    if (endTripBtn) endTripBtn.style.display = 'none';
    if (addExpBtn) {
      addExpBtn.disabled = true;
      addExpBtn.title = 'Trip has ended. No new expenses can be added.';
    }
  } else {
    if (endTripBtn) endTripBtn.style.display = 'inline-flex';
    if (addExpBtn) addExpBtn.disabled = false;
  }

  // Update counts on tabs
  const expCountEl = document.getElementById('tab-expense-count');
  const memCountEl = document.getElementById('tab-member-count');
  const settleBadge = document.getElementById('tab-settle-badge');

  if (expCountEl) expCountEl.textContent = tripExpenses.length;
  if (memCountEl) memCountEl.textContent = tripMembers.filter(m => m.status === 'ACTIVE').length;

  const hasPendingSettlements = tripSettlements.some(s => s.status === 'PENDING');
  if (settleBadge) {
    settleBadge.style.display = hasPendingSettlements ? 'inline-flex' : 'none';
  }
}

function renderOverview() {
  const totalExpEl = document.getElementById('overview-total-expenses');
  const myPaidEl = document.getElementById('overview-my-paid');
  const myShareEl = document.getElementById('overview-my-share');
  const myNetEl = document.getElementById('overview-my-net');
  const netCard = document.getElementById('overview-net-card');
  const netHint = document.getElementById('overview-net-hint');

  const summary = tripBalances?.mySummary || { totalPaid: 0, totalShare: 0, netBalance: 0 };
  const totalTripExpenses = tripBalances?.totalTripExpenses || 0;

  if (totalExpEl) totalExpEl.textContent = formatPaise(totalTripExpenses);
  if (myPaidEl) myPaidEl.textContent = formatPaise(summary.totalPaid);
  if (myShareEl) myShareEl.textContent = formatPaise(summary.totalShare);

  if (myNetEl) {
    myNetEl.textContent = formatPaise(summary.netBalance);
    if (summary.netBalance > 0) {
      myNetEl.style.color = 'var(--color-success)';
      if (netCard) netCard.className = 'stat-card stat-success';
      if (netHint) netHint.textContent = 'You are owed money (Creditor)';
    } else if (summary.netBalance < 0) {
      myNetEl.style.color = 'var(--color-danger)';
      if (netCard) netCard.className = 'stat-card stat-danger';
      if (netHint) netHint.textContent = 'You owe money (Debtor)';
    } else {
      myNetEl.style.color = 'var(--color-navy)';
      if (netCard) netCard.className = 'stat-card';
      if (netHint) netHint.textContent = 'All settled up';
    }
  }

  // Recent 3 expenses
  const recentFeed = document.getElementById('overview-recent-expenses');
  if (recentFeed) {
    if (tripExpenses.length === 0) {
      recentFeed.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;margin:0;">No expenses added yet.</p>';
    } else {
      const recent = tripExpenses.slice(0, 3);
      recentFeed.innerHTML = recent.map(exp => `
        <div class="expense-item" style="padding: 0.75rem 1rem;">
          <div class="expense-item-left">
            <div class="expense-cat-badge" style="width:36px;height:36px;font-size:1rem;">
              ${getCategoryIcon(exp.category)}
            </div>
            <div>
              <div style="font-weight:700;font-size:0.95rem;color:var(--color-navy);">${escapeHtml(exp.title)}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">Paid by ${escapeHtml(exp.paidByName)}</div>
            </div>
          </div>
          <div class="expense-item-right">
            <div style="font-weight:700;font-size:1.05rem;color:var(--color-navy);">${formatPaise(exp.totalAmount)}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(exp.date)}</div>
          </div>
        </div>
      `).join('');
    }
  }
}

function getCategoryIcon(cat) {
  switch (cat) {
    case 'Accommodation': return '🏨';
    case 'Food': return '🍽️';
    case 'Transport': return '🚗';
    case 'Fuel': return '⛽';
    case 'Activities': return '🏄';
    case 'Shopping': return '🛍️';
    case 'Tickets': return '🎟️';
    default: return '💳';
  }
}

function renderExpenses() {
  const list = document.getElementById('expenses-list');
  const empty = document.getElementById('expenses-empty');
  const addBtn = document.getElementById('expenses-add-btn');

  if (!list || !empty) return;

  const isEnded = currentTrip?.status === 'ENDED';
  if (addBtn) addBtn.disabled = isEnded;

  if (tripExpenses.length === 0) {
    list.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  list.style.display = 'flex';

  list.innerHTML = tripExpenses.map(exp => {
    const isCreatorOrOwner = exp.createdBy === currentUser?.uid || currentTrip?.role === 'OWNER';
    const canModify = isCreatorOrOwner && !isEnded;

    const splitPills = (exp.splits || []).map(s => `
      <span class="badge badge-light" style="font-size: 0.75rem;">
        ${escapeHtml(s.userName)}: ${formatPaise(s.allocatedAmount)}
      </span>
    `).join(' ');

    return `
      <div class="expense-item">
        <div class="expense-item-left">
          <div class="expense-cat-badge">
            ${getCategoryIcon(exp.category)}
          </div>
          <div>
            <div class="expense-item-title">${escapeHtml(exp.title)}</div>
            <div class="expense-item-subtitle">
              Paid by <strong>${escapeHtml(exp.paidByName)}</strong> &bull;
              <span>${escapeHtml(exp.date)}</span> &bull;
              <span class="badge badge-navy" style="font-size: 0.7rem;">${escapeHtml(exp.splitType)} SPLIT</span>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.5rem;">
              ${splitPills}
            </div>
          </div>
        </div>

        <div class="expense-item-right">
          <div class="expense-item-amount">${formatPaise(exp.totalAmount)}</div>
          ${canModify ? `
            <div style="display: flex; gap: 0.35rem; margin-top: 0.5rem;">
              <button type="button" class="btn btn-outline btn-sm edit-expense-btn" data-id="${escapeHtml(exp.expenseId)}" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">
                Edit
              </button>
              <button type="button" class="btn btn-outline btn-sm delete-expense-btn" data-id="${escapeHtml(exp.expenseId)}" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; color: var(--color-danger); border-color: var(--color-danger);">
                Delete
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Attach edit and delete handlers
  list.querySelectorAll('.edit-expense-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const expId = e.target.getAttribute('data-id');
      const exp = tripExpenses.find(x => x.expenseId === expId);
      if (exp) openExpenseModal(exp);
    });
  });

  list.querySelectorAll('.delete-expense-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const expId = e.target.getAttribute('data-id');
      promptDeleteExpense(expId);
    });
  });
}

function promptDeleteExpense(expenseId) {
  openConfirmModal(
    'Delete Expense',
    'Are you sure you want to delete this expense and its split shares? This will recalculate all group balances.',
    async () => {
      try {
        await api.delete(`/api/trips/${tripId}/expenses/${expenseId}`);
        showAlert(document.getElementById('trip-alert-container'), 'Expense deleted successfully.', 'success');
        initTripPage();
      } catch (err) {
        console.error('Delete expense error:', err);
        showAlert(document.getElementById('trip-alert-container'), err.message || 'Failed to delete expense.', 'danger');
      }
    }
  );
}

function renderMembers() {
  const tbody = document.getElementById('members-table-body');
  if (!tbody) return;

  tbody.innerHTML = tripMembers.map(m => {
    const isOwner = m.role === 'OWNER';
    const isLeft = m.status === 'LEFT';
    const joined = m.joinedAt ? new Date(m.joinedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

    return `
      <tr>
        <td>
          <strong>${escapeHtml(m.displayName)}</strong>
          ${m.userId === currentUser?.uid ? '<span class="badge badge-light" style="margin-left:0.35rem;">You</span>' : ''}
          <div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(m.email)}</div>
        </td>
        <td><strong class="user-code-pill">${escapeHtml(m.userCode)}</strong></td>
        <td>
          <span class="badge ${isOwner ? 'badge-navy' : 'badge-light'}">
            ${isOwner ? '👑 Owner' : 'Member'}
          </span>
        </td>
        <td>
          <span class="badge ${isLeft ? 'badge-muted' : 'badge-success'}">
            ${isLeft ? 'Left Trip' : 'Active'}
          </span>
        </td>
        <td>${escapeHtml(joined)}</td>
        <td>
          ${m.upiId ? `<span style="font-family:var(--font-mono);font-size:0.85rem;">${escapeHtml(m.upiId)}</span>` : '<span style="color:var(--text-light);font-size:0.85rem;">Not added</span>'}
        </td>
      </tr>
    `;
  }).join('');

  // Render Sent Invitations
  const invContainer = document.getElementById('trip-invitations-container');
  const invList = document.getElementById('trip-invitations-list');
  if (invContainer && invList) {
    const pending = tripInvitations.filter(i => i.status === 'PENDING');
    if (pending.length === 0) {
      invContainer.style.display = 'none';
    } else {
      invContainer.style.display = 'block';
      invList.innerHTML = pending.map(inv => `
        <div class="card" style="padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center; background-color: var(--color-surface-alt);">
          <div style="font-size: 0.85rem;">
            Recipient: <strong>${escapeHtml(inv.inviteeEmail || inv.inviteeUserCode)}</strong> &bull;
            <span class="badge badge-warning" style="font-size:0.7rem;">Pending</span>
          </div>
          <button type="button" class="btn btn-outline btn-sm cancel-inv-btn" data-id="${escapeHtml(inv.invitationId)}" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; color: var(--color-danger); border-color: var(--color-danger);">
            Cancel Invite
          </button>
        </div>
      `).join('');

      invList.querySelectorAll('.cancel-inv-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const invId = e.target.getAttribute('data-id');
          try {
            await api.post(`/api/invitations/${invId}/cancel`);
            showAlert(document.getElementById('trip-alert-container'), 'Invitation cancelled.', 'success');
            initTripPage();
          } catch (err) {
            showAlert(document.getElementById('trip-alert-container'), err.message || 'Failed to cancel invitation.', 'danger');
          }
        });
      });
    }
  }
}

function renderBalances() {
  const tbody = document.getElementById('balances-table-body');
  const sumCheckEl = document.getElementById('balances-sum-check');

  if (!tbody || !tripBalances) return;

  const members = tripBalances.memberBalances || [];
  let netSum = 0;

  tbody.innerHTML = members.map(m => {
    netSum += m.netBalance;
    const isCreditor = m.netBalance > 0;
    const isDebtor = m.netBalance < 0;

    let badgeClass = 'badge-muted';
    let statusText = 'Settled';
    if (isCreditor) {
      badgeClass = 'badge-success';
      statusText = 'Should Receive';
    } else if (isDebtor) {
      badgeClass = 'badge-danger';
      statusText = 'Owes Money';
    }

    return `
      <tr>
        <td>
          <strong>${escapeHtml(m.displayName)}</strong>
          ${m.userId === currentUser?.uid ? '<span class="badge badge-light" style="margin-left:0.35rem;">You</span>' : ''}
          <div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(m.userCode)}</div>
        </td>
        <td style="font-weight: 600;">${formatPaise(m.totalPaid)}</td>
        <td style="font-weight: 600;">${formatPaise(m.totalShare)}</td>
        <td style="font-weight: 800; font-size: 1.05rem; color: ${isCreditor ? 'var(--color-success)' : isDebtor ? 'var(--color-danger)' : 'var(--color-navy)'};">
          ${formatPaise(m.netBalance)}
        </td>
        <td>
          <span class="badge ${badgeClass}">${statusText}</span>
        </td>
      </tr>
    `;
  }).join('');

  if (sumCheckEl) {
    sumCheckEl.textContent = formatPaise(netSum);
  }
}

function renderSettlements() {
  const list = document.getElementById('settlements-list');
  const empty = document.getElementById('settlements-empty');
  const claimsBox = document.getElementById('incoming-claims-container');
  const claimsList = document.getElementById('incoming-claims-list');

  if (!list || !empty) return;

  // Render Incoming Claims (Receiver verification)
  if (incomingClaims.length > 0 && claimsBox && claimsList) {
    claimsBox.style.display = 'block';
    claimsList.innerHTML = incomingClaims.map(c => `
      <div style="background:#FFF; padding:1rem; border-radius:var(--radius-md); border:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
        <div>
          <div style="font-weight:700; color:var(--color-navy); font-size:1.05rem;">
            ${escapeHtml(c.payerName)} reported paying ${formatPaise(c.amount)}
          </div>
          <div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.25rem;">
            UTR / Reference: <strong class="user-code-pill" style="font-family:var(--font-mono);">${escapeHtml(c.upiTransactionRef)}</strong>
            &bull; Submitted: ${new Date(c.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            ${c.notes ? `&bull; Note: "${escapeHtml(c.notes)}"` : ''}
          </div>
        </div>
        <div style="display:flex; gap:0.5rem;">
          <button type="button" class="btn btn-primary btn-sm confirm-claim-btn" data-id="${escapeHtml(c.paymentId)}">
            ✓ Confirm Receipt
          </button>
          <button type="button" class="btn btn-outline btn-sm reject-claim-btn" data-id="${escapeHtml(c.paymentId)}" style="color:var(--color-danger); border-color:var(--color-danger);">
            ✕ Reject
          </button>
        </div>
      </div>
    `).join('');

    claimsList.querySelectorAll('.confirm-claim-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const payId = e.target.getAttribute('data-id');
        promptConfirmPayment(payId);
      });
    });

    claimsList.querySelectorAll('.reject-claim-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const payId = e.target.getAttribute('data-id');
        promptRejectPayment(payId);
      });
    });
  } else if (claimsBox) {
    claimsBox.style.display = 'none';
  }

  // Render Settlements
  if (tripSettlements.length === 0) {
    list.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  list.style.display = 'block';

  list.innerHTML = tripSettlements.map(s => {
    const isPaid = s.status === 'PAID';
    const isDebtor = s.fromUser === currentUser?.uid;
    const isCreditor = s.toUser === currentUser?.uid;

    return `
      <div class="settlement-card ${isPaid ? 'settlement-paid' : ''}">
        <div class="settlement-flow">
          <span class="debtor-pill" style="color: var(--color-danger); font-weight: 700;">
            ${escapeHtml(s.fromUserName)} ${isDebtor ? '(You)' : ''}
          </span>
          <span class="settlement-arrow">&rarr; owes &rarr;</span>
          <span class="creditor-pill" style="color: var(--color-success); font-weight: 700;">
            ${escapeHtml(s.toUserName)} ${isCreditor ? '(You)' : ''}
          </span>
          <span style="font-size: 1.25rem; font-weight: 800; color: var(--color-navy); margin-left: 0.5rem;">
            ${formatPaise(s.amount)}
          </span>
        </div>

        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <span class="badge ${isPaid ? 'badge-success' : 'badge-warning'}">
            ${isPaid ? 'PAID & CONFIRMED' : 'PENDING'}
          </span>

          ${!isPaid && isDebtor ? `
            <button type="button" class="btn btn-primary btn-sm pay-upi-btn" data-id="${escapeHtml(s.settlementId)}">
              Pay via UPI &rarr;
            </button>
          ` : ''}

          ${!isPaid && !isDebtor ? `
            <span style="font-size: 0.8rem; color: var(--text-muted);">
              Awaiting external UPI transfer
            </span>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.pay-upi-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const sId = e.target.getAttribute('data-id');
      const settlement = tripSettlements.find(x => x.settlementId === sId);
      if (settlement) openUpiModal(settlement);
    });
  });
}

function promptConfirmPayment(paymentId) {
  openConfirmModal(
    'Confirm Payment Receipt',
    'Please verify that the settlement amount has successfully been credited to your bank account or UPI app. Once confirmed, this settlement will permanently be marked as PAID.',
    async () => {
      try {
        await api.post(`/api/payments/${paymentId}/confirm`);
        showAlert(document.getElementById('trip-alert-container'), 'Payment confirmed! Settlement is completed.', 'success');
        initTripPage();
      } catch (err) {
        console.error('Confirm payment error:', err);
        showAlert(document.getElementById('trip-alert-container'), err.message || 'Failed to confirm payment.', 'danger');
      }
    }
  );
}

function promptRejectPayment(paymentId) {
  const reason = prompt('Please specify why this payment claim is being rejected (e.g. UTR not found, amount mismatch):', 'Payment not credited to bank account');
  if (reason === null) return; // user cancelled prompt

  openConfirmModal(
    'Reject Payment Claim',
    `Are you sure you want to reject this claim? Reason: "${reason}". The debtor will be notified to submit a corrected reference.`,
    async () => {
      try {
        await api.post(`/api/payments/${paymentId}/reject`, { reason });
        showAlert(document.getElementById('trip-alert-container'), 'Payment claim rejected.', 'warning');
        initTripPage();
      } catch (err) {
        console.error('Reject payment error:', err);
        showAlert(document.getElementById('trip-alert-container'), err.message || 'Failed to reject payment.', 'danger');
      }
    }
  );
}

/* =========================================================================
   UPI Payment Modal & QR Code Generation
   ========================================================================= */
function openUpiModal(settlement) {
  activeSettlementForPayment = settlement;
  const modal = document.getElementById('upi-modal');
  const payeeNameEl = document.getElementById('upi-payee-name');
  const amountEl = document.getElementById('upi-amount-display');
  const vpaEl = document.getElementById('upi-payee-vpa');
  const qrContainer = document.getElementById('upi-qr-container');
  const deepLinkBtn = document.getElementById('upi-deep-link-btn');
  const copyUpiBtn = document.getElementById('copy-upi-btn');

  const payeeName = settlement.toUserName || 'TripSplit Member';
  const payeeVpa = settlement.toUserUpi || '';
  const amountRupees = (settlement.amount / 100).toFixed(2);

  if (payeeNameEl) payeeNameEl.textContent = payeeName;
  if (amountEl) amountEl.textContent = `₹${amountRupees}`;
  if (vpaEl) vpaEl.textContent = payeeVpa || 'Payee UPI ID not configured';

  // Construct standard UPI payment URI
  // upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...
  const note = `TripSplit ${currentTrip?.name || 'Trip'} Settlement`;
  const upiUri = `upi://pay?pa=${encodeURIComponent(payeeVpa)}&pn=${encodeURIComponent(payeeName)}&am=${amountRupees}&cu=INR&tn=${encodeURIComponent(note)}&tr=${encodeURIComponent(settlement.settlementId)}`;

  if (deepLinkBtn) {
    if (payeeVpa) {
      deepLinkBtn.href = upiUri;
      deepLinkBtn.style.display = 'inline-flex';
    } else {
      deepLinkBtn.style.display = 'none';
    }
  }

  // Generate QR code SVG
  if (qrContainer) {
    if (payeeVpa) {
      qrContainer.innerHTML = generateQrSvg(upiUri, 220);
    } else {
      qrContainer.innerHTML = `
        <div style="padding: 2rem; color: var(--color-danger); font-size: 0.9rem;">
          Payee has not linked their UPI ID yet.<br>Please ask ${escapeHtml(payeeName)} to add their UPI ID in their Profile.
        </div>
      `;
    }
  }

  if (copyUpiBtn) {
    copyUpiBtn.onclick = () => {
      if (payeeVpa) {
        navigator.clipboard.writeText(payeeVpa);
        copyUpiBtn.textContent = 'Copied!';
        setTimeout(() => { copyUpiBtn.textContent = 'Copy UPI ID'; }, 2000);
      }
    };
  }

  if (modal) modal.classList.add('is-active');
}

/* =========================================================================
   "I Paid" UTR Submission Flow
   ========================================================================= */
function openIPaidModal() {
  const upiModal = document.getElementById('upi-modal');
  if (upiModal) upiModal.classList.remove('is-active');

  const modal = document.getElementById('ipaid-modal');
  const alertEl = document.getElementById('ipaid-modal-alert');
  const form = document.getElementById('ipaid-form');
  const settleIdInput = document.getElementById('ipaid-settlement-id');

  clearAlerts(alertEl);
  if (form) form.reset();
  if (settleIdInput && activeSettlementForPayment) {
    settleIdInput.value = activeSettlementForPayment.settlementId;
  }

  if (modal) modal.classList.add('is-active');
}

/* =========================================================================
   Add / Edit Expense Form & Dynamic Splits
   ========================================================================= */
function openExpenseModal(expenseToEdit = null) {
  const modal = document.getElementById('expense-modal');
  const form = document.getElementById('expense-form');
  const titleEl = document.getElementById('expense-modal-title');
  const alertEl = document.getElementById('expense-modal-alert');
  const editIdEl = document.getElementById('expense-edit-id');

  clearAlerts(alertEl);
  if (form) form.reset();

  const activeMembers = tripMembers.filter(m => m.status === 'ACTIVE');

  // Populate Paid By dropdown
  const paidBySelect = document.getElementById('expense-paid-by');
  if (paidBySelect) {
    paidBySelect.innerHTML = activeMembers.map(m => `
      <option value="${escapeHtml(m.userId)}" ${m.userId === currentUser?.uid ? 'selected' : ''}>
        ${escapeHtml(m.displayName)} (${escapeHtml(m.userCode)})
      </option>
    `).join('');
  }

  // Populate Participants selection checkboxes and split input fields
  renderParticipantSplitControls(activeMembers, expenseToEdit);

  const dateInput = document.getElementById('expense-date');
  if (dateInput) {
    dateInput.value = expenseToEdit?.date || new Date().toISOString().split('T')[0];
  }

  if (expenseToEdit) {
    titleEl.textContent = 'Edit Expense';
    editIdEl.value = expenseToEdit.expenseId;
    document.getElementById('expense-title').value = expenseToEdit.title;
    document.getElementById('expense-amount').value = (expenseToEdit.totalAmount / 100).toFixed(2);
    document.getElementById('expense-category').value = expenseToEdit.category;
    document.getElementById('expense-paid-by').value = expenseToEdit.paidBy;
    document.getElementById('expense-description').value = expenseToEdit.description || '';

    // Split type radio
    const radio = document.querySelector(`input[name="splitType"][value="${expenseToEdit.splitType}"]`);
    if (radio) radio.checked = true;
  } else {
    titleEl.textContent = 'Add New Expense';
    editIdEl.value = '';
    document.getElementById('split-type-equal').checked = true;
  }

  recalculateLiveSplits();
  if (modal) modal.classList.add('is-active');
}

function renderParticipantSplitControls(activeMembers, expenseToEdit = null) {
  const container = document.getElementById('participants-selection-container');
  if (!container) return;

  const currentSplitType = document.querySelector('input[name="splitType"]:checked')?.value || 'EQUAL';
  const existingSplits = expenseToEdit?.splits || [];
  const selectedParticipantIds = expenseToEdit ? expenseToEdit.participantIds : activeMembers.map(m => m.userId);

  container.innerHTML = activeMembers.map(m => {
    const isChecked = selectedParticipantIds.includes(m.userId);
    const existingSplit = existingSplits.find(s => s.userId === m.userId);
    const defaultVal = existingSplit ? (currentSplitType === 'PERCENTAGE' ? existingSplit.percentage : (existingSplit.allocatedAmount / 100).toFixed(2)) : '';

    return `
      <div class="participant-row" data-user-id="${escapeHtml(m.userId)}" style="display:flex; justify-content:space-between; align-items:center; padding:0.35rem 0; border-bottom:1px solid var(--border-color);">
        <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; font-size:0.9rem; margin:0;">
          <input type="checkbox" class="participant-checkbox" value="${escapeHtml(m.userId)}" ${isChecked ? 'checked' : ''}>
          <span>${escapeHtml(m.displayName)} (${escapeHtml(m.userCode)})</span>
        </label>
        <div class="split-input-wrapper" style="display:${currentSplitType === 'EQUAL' ? 'none' : 'flex'}; align-items:center; gap:0.25rem;">
          <span class="split-unit">${currentSplitType === 'PERCENTAGE' ? '%' : '₹'}</span>
          <input
            type="number"
            class="form-input split-custom-value"
            style="width: 90px; padding: 0.35rem 0.5rem; font-size: 0.85rem;"
            step="${currentSplitType === 'PERCENTAGE' ? '0.1' : '0.01'}"
            min="0"
            placeholder="${currentSplitType === 'PERCENTAGE' ? '33.3' : '0.00'}"
            value="${defaultVal || ''}"
          >
        </div>
      </div>
    `;
  }).join('');

  // Attach input listeners
  container.querySelectorAll('.participant-checkbox').forEach(cb => {
    cb.addEventListener('change', recalculateLiveSplits);
  });
  container.querySelectorAll('.split-custom-value').forEach(inp => {
    inp.addEventListener('input', recalculateLiveSplits);
  });
}

function recalculateLiveSplits() {
  const amountVal = parseFloat(document.getElementById('expense-amount')?.value || 0);
  const totalAmountPaise = Math.round(amountVal * 100);
  const currentSplitType = document.querySelector('input[name="splitType"]:checked')?.value || 'EQUAL';
  const previewEl = document.getElementById('split-breakdown-preview');

  const selectedBoxes = Array.from(document.querySelectorAll('.participant-checkbox:checked'));
  const count = selectedBoxes.length;

  if (count === 0) {
    if (previewEl) previewEl.innerHTML = '<span style="color:var(--color-danger);">Select at least one participant.</span>';
    return;
  }

  if (totalAmountPaise <= 0) {
    if (previewEl) previewEl.innerHTML = 'Enter total amount to calculate split distribution.';
    return;
  }

  if (currentSplitType === 'EQUAL') {
    const baseShare = Math.floor(totalAmountPaise / count);
    const remainder = totalAmountPaise % count;
    const baseRupees = (baseShare / 100).toFixed(2);
    const extraRupees = ((baseShare + 1) / 100).toFixed(2);

    let text = `Each of the ${count} participants pays <strong>₹${baseRupees}</strong>.`;
    if (remainder > 0) {
      text += ` (${remainder} ${remainder === 1 ? 'member receives' : 'members receive'} ₹${extraRupees} due to deterministic integer remainder distribution of ${remainder} paise).`;
    }
    if (previewEl) previewEl.innerHTML = text;
  } else if (currentSplitType === 'EXACT') {
    let sumPaise = 0;
    selectedBoxes.forEach(cb => {
      const row = cb.closest('.participant-row');
      const val = parseFloat(row.querySelector('.split-custom-value')?.value || 0);
      sumPaise += Math.round(val * 100);
    });

    const diff = totalAmountPaise - sumPaise;
    const diffRupees = (Math.abs(diff) / 100).toFixed(2);

    if (diff === 0) {
      if (previewEl) previewEl.innerHTML = `<span style="color:var(--color-success); font-weight:600;">✓ Exact shares match total expense (₹${(sumPaise/100).toFixed(2)}) perfectly.</span>`;
    } else {
      const underOver = diff > 0 ? 'under by' : 'over by';
      if (previewEl) previewEl.innerHTML = `<span style="color:var(--color-danger); font-weight:600;">⚠️ Sum of shares (₹${(sumPaise/100).toFixed(2)}) is ${underOver} ₹${diffRupees}. Must equal ₹${amountVal.toFixed(2)}.</span>`;
    }
  } else if (currentSplitType === 'PERCENTAGE') {
    let sumPct = 0;
    selectedBoxes.forEach(cb => {
      const row = cb.closest('.participant-row');
      const val = parseFloat(row.querySelector('.split-custom-value')?.value || 0);
      sumPct += val;
    });

    const diffPct = Math.abs(100 - sumPct);
    if (diffPct <= 0.01) {
      if (previewEl) previewEl.innerHTML = '<span style="color:var(--color-success); font-weight:600;">✓ Percentages sum to 100.00%.</span>';
    } else {
      if (previewEl) previewEl.innerHTML = `<span style="color:var(--color-danger); font-weight:600;">⚠️ Total is ${sumPct.toFixed(2)}%. Must sum to exactly 100%.</span>`;
    }
  }
}

/* =========================================================================
   Global Confirm Dialog
   ========================================================================= */
let onConfirmCallback = null;

function openConfirmModal(title, message, onConfirm) {
  const modal = document.getElementById('generic-confirm-modal');
  const titleEl = document.getElementById('confirm-modal-title');
  const msgEl = document.getElementById('confirm-modal-message');

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  onConfirmCallback = onConfirm;

  if (modal) modal.classList.add('is-active');
}

function closeConfirmModal() {
  const modal = document.getElementById('generic-confirm-modal');
  if (modal) modal.classList.remove('is-active');
  onConfirmCallback = null;
}

/* =========================================================================
   Setup All Event Listeners
   ========================================================================= */
function setupGlobalEvents() {
  const logoutBtn = document.getElementById('trip-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await logoutUser();
        window.location.href = '/index.html';
      } catch (err) {
        window.location.href = '/login.html';
      }
    });
  }

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabTarget = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const targetPane = document.getElementById(`tab-${tabTarget}`);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // Switch to tab helper buttons
  document.querySelectorAll('.switch-to-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      const tabBtn = document.querySelector(`.tab-btn[data-tab="${target}"]`);
      if (tabBtn) tabBtn.click();
    });
  });

  // Add Expense Modal Triggers
  const openAddExpBtn = document.getElementById('open-add-expense-btn');
  const expAddBtn = document.getElementById('expenses-add-btn');
  const emptyAddBtn = document.getElementById('empty-add-expense-btn');
  const closeExpModalBtn = document.getElementById('close-expense-modal-btn');
  const cancelExpBtn = document.getElementById('cancel-expense-btn');
  const expModal = document.getElementById('expense-modal');

  const closeExpenseModal = () => {
    if (expModal) expModal.classList.remove('is-active');
  };

  if (openAddExpBtn) openAddExpBtn.addEventListener('click', () => openExpenseModal());
  if (expAddBtn) expAddBtn.addEventListener('click', () => openExpenseModal());
  if (emptyAddBtn) emptyAddBtn.addEventListener('click', () => openExpenseModal());
  if (closeExpModalBtn) closeExpModalBtn.addEventListener('click', closeExpenseModal);
  if (cancelExpBtn) cancelExpBtn.addEventListener('click', closeExpenseModal);

  // Split Type Radio changes
  document.querySelectorAll('input[name="splitType"]').forEach(radio => {
    radio.addEventListener('change', () => {
      renderParticipantSplitControls(tripMembers.filter(m => m.status === 'ACTIVE'));
      recalculateLiveSplits();
    });
  });

  const amountInput = document.getElementById('expense-amount');
  if (amountInput) amountInput.addEventListener('input', recalculateLiveSplits);

  // Save Expense Form Submit
  const expenseForm = document.getElementById('expense-form');
  const expAlertEl = document.getElementById('expense-modal-alert');
  const saveExpBtn = document.getElementById('save-expense-btn');

  if (expenseForm) {
    expenseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlerts(expAlertEl);

      const editId = document.getElementById('expense-edit-id')?.value;
      const title = document.getElementById('expense-title')?.value.trim();
      const amountVal = parseFloat(document.getElementById('expense-amount')?.value || 0);
      const category = document.getElementById('expense-category')?.value;
      const paidBy = document.getElementById('expense-paid-by')?.value;
      const date = document.getElementById('expense-date')?.value;
      const description = document.getElementById('expense-description')?.value.trim();
      const splitType = document.querySelector('input[name="splitType"]:checked')?.value || 'EQUAL';

      if (!title || title.length < 2) {
        showAlert(expAlertEl, 'Title must be at least 2 characters.', 'danger');
        return;
      }
      if (isNaN(amountVal) || amountVal <= 0) {
        showAlert(expAlertEl, 'Please enter a valid positive amount.', 'danger');
        return;
      }

      const selectedBoxes = Array.from(document.querySelectorAll('.participant-checkbox:checked'));
      const participantIds = selectedBoxes.map(cb => cb.value);

      if (participantIds.length === 0) {
        showAlert(expAlertEl, 'At least one participant must be selected.', 'danger');
        return;
      }

      const totalPaise = Math.round(amountVal * 100);
      const payload = {
        title,
        amount: amountVal,
        amountPaise: totalPaise,
        category,
        paidBy,
        date,
        description,
        splitType,
        participantIds
      };

      if (splitType === 'EXACT') {
        const customSplits = [];
        let runningPaise = 0;
        selectedBoxes.forEach(cb => {
          const row = cb.closest('.participant-row');
          const exactVal = parseFloat(row.querySelector('.split-custom-value')?.value || 0);
          const pPaise = Math.round(exactVal * 100);
          runningPaise += pPaise;
          customSplits.push({ userId: cb.value, allocatedAmount: pPaise });
        });

        if (runningPaise !== totalPaise) {
          showAlert(expAlertEl, `Exact shares (${(runningPaise/100).toFixed(2)}) must equal total amount (${amountVal.toFixed(2)}).`, 'danger');
          return;
        }
        payload.customSplits = customSplits;
      } else if (splitType === 'PERCENTAGE') {
        const customSplits = [];
        let runningPct = 0;
        selectedBoxes.forEach(cb => {
          const row = cb.closest('.participant-row');
          const pct = parseFloat(row.querySelector('.split-custom-value')?.value || 0);
          runningPct += pct;
          customSplits.push({ userId: cb.value, percentage: pct });
        });

        if (Math.abs(runningPct - 100) > 0.01) {
          showAlert(expAlertEl, `Percentages sum to ${runningPct.toFixed(2)}%. Must equal 100.00%.`, 'danger');
          return;
        }
        payload.customSplits = customSplits;
      }

      saveExpBtn.disabled = true;
      saveExpBtn.textContent = 'Saving Expense...';

      try {
        if (editId) {
          await api.patch(`/api/trips/${tripId}/expenses/${editId}`, payload);
          showAlert(document.getElementById('trip-alert-container'), 'Expense updated successfully.', 'success');
        } else {
          await api.post(`/api/trips/${tripId}/expenses`, payload);
          showAlert(document.getElementById('trip-alert-container'), 'Expense added successfully.', 'success');
        }

        closeExpenseModal();
        saveExpBtn.disabled = false;
        saveExpBtn.textContent = 'Save Expense';
        initTripPage();
      } catch (err) {
        console.error('Save expense error:', err);
        showAlert(expAlertEl, err.message || 'Failed to save expense.', 'danger');
        saveExpBtn.disabled = false;
        saveExpBtn.textContent = 'Save Expense';
      }
    });
  }

  // Invite Modal Triggers
  const openInviteBtn = document.getElementById('open-invite-modal-btn');
  const memInviteBtn = document.getElementById('members-invite-btn');
  const closeInviteModalBtn = document.getElementById('close-invite-modal-btn');
  const cancelInviteBtn = document.getElementById('cancel-invite-btn');
  const inviteModal = document.getElementById('invite-modal');
  const inviteForm = document.getElementById('invite-form');
  const inviteAlertEl = document.getElementById('invite-modal-alert');
  const submitInviteBtn = document.getElementById('submit-invite-btn');

  const closeInviteModal = () => {
    if (inviteModal) inviteModal.classList.remove('is-active');
  };

  const openInviteModal = () => {
    clearAlerts(inviteAlertEl);
    if (inviteForm) inviteForm.reset();
    document.getElementById('invite-by-code').checked = true;
    document.getElementById('usercode-input-group').style.display = 'block';
    document.getElementById('email-input-group').style.display = 'none';
    if (inviteModal) inviteModal.classList.add('is-active');
  };

  if (openInviteBtn) openInviteBtn.addEventListener('click', openInviteModal);
  if (memInviteBtn) memInviteBtn.addEventListener('click', openInviteModal);
  if (closeInviteModalBtn) closeInviteModalBtn.addEventListener('click', closeInviteModal);
  if (cancelInviteBtn) cancelInviteBtn.addEventListener('click', closeInviteModal);

  document.querySelectorAll('input[name="inviteTargetType"]').forEach(r => {
    r.addEventListener('change', (e) => {
      const isCode = e.target.value === 'userCode';
      document.getElementById('usercode-input-group').style.display = isCode ? 'block' : 'none';
      document.getElementById('email-input-group').style.display = isCode ? 'none' : 'block';
    });
  });

  if (inviteForm) {
    inviteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlerts(inviteAlertEl);

      const isCode = document.getElementById('invite-by-code').checked;
      const userCode = document.getElementById('invite-usercode')?.value.trim();
      const email = document.getElementById('invite-email')?.value.trim();

      const payload = isCode ? { userCode } : { email };

      submitInviteBtn.disabled = true;
      submitInviteBtn.textContent = 'Sending...';

      try {
        await api.post(`/api/trips/${tripId}/invitations`, payload);
        showAlert(document.getElementById('trip-alert-container'), 'Invitation sent successfully.', 'success');
        closeInviteModal();
        submitInviteBtn.disabled = false;
        submitInviteBtn.textContent = 'Send Invitation';
        initTripPage();
      } catch (err) {
        console.error('Invite error:', err);
        showAlert(inviteAlertEl, err.message || 'Failed to send invitation.', 'danger');
        submitInviteBtn.disabled = false;
        submitInviteBtn.textContent = 'Send Invitation';
      }
    });
  }

  // Recalculate Settlements button
  const recalcBtn = document.getElementById('recalculate-settlements-btn');
  if (recalcBtn) {
    recalcBtn.addEventListener('click', async () => {
      recalcBtn.disabled = true;
      recalcBtn.textContent = 'Optimizing Settlements...';
      try {
        await api.post(`/api/trips/${tripId}/settlements/calculate`);
        showAlert(document.getElementById('trip-alert-container'), 'Settlements recalculated via Min-Cash-Flow algorithm.', 'success');
        initTripPage();
      } catch (err) {
        console.error('Recalc settlements error:', err);
        showAlert(document.getElementById('trip-alert-container'), err.message || 'Failed to calculate settlements.', 'danger');
      } finally {
        recalcBtn.disabled = false;
        recalcBtn.textContent = '↻ Recalculate Settlements';
      }
    });
  }

  // UPI Modal & I Paid Modal Buttons
  const closeUpiModalBtn = document.getElementById('close-upi-modal-btn');
  const closeUpiBtn = document.getElementById('close-upi-btn');
  const openIPaidBtn = document.getElementById('open-i-paid-btn');
  const upiModal = document.getElementById('upi-modal');

  const closeUpiModal = () => {
    if (upiModal) upiModal.classList.remove('is-active');
  };
  if (closeUpiModalBtn) closeUpiModalBtn.addEventListener('click', closeUpiModal);
  if (closeUpiBtn) closeUpiBtn.addEventListener('click', closeUpiModal);
  if (openIPaidBtn) openIPaidBtn.addEventListener('click', openIPaidModal);

  // I Paid Form Submit
  const closeIPaidModalBtn = document.getElementById('close-ipaid-modal-btn');
  const cancelIPaidBtn = document.getElementById('cancel-ipaid-btn');
  const ipaidModal = document.getElementById('ipaid-modal');
  const ipaidForm = document.getElementById('ipaid-form');
  const ipaidAlertEl = document.getElementById('ipaid-modal-alert');
  const submitIPaidBtn = document.getElementById('submit-ipaid-btn');

  const closeIPaidModal = () => {
    if (ipaidModal) ipaidModal.classList.remove('is-active');
  };
  if (closeIPaidModalBtn) closeIPaidModalBtn.addEventListener('click', closeIPaidModal);
  if (cancelIPaidBtn) cancelIPaidBtn.addEventListener('click', closeIPaidModal);

  if (ipaidForm) {
    ipaidForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlerts(ipaidAlertEl);

      const sId = document.getElementById('ipaid-settlement-id')?.value;
      const utr = document.getElementById('ipaid-utr')?.value.trim();
      const notes = document.getElementById('ipaid-notes')?.value.trim();

      if (!utr || utr.length < 6) {
        showAlert(ipaidAlertEl, 'Please enter a valid UPI transaction reference (UTR) of at least 6 characters.', 'danger');
        return;
      }

      submitIPaidBtn.disabled = true;
      submitIPaidBtn.textContent = 'Submitting Claim...';

      try {
        await api.post(`/api/settlements/${sId}/payments`, {
          upiTransactionRef: utr,
          notes
        });

        showAlert(document.getElementById('trip-alert-container'), 'Payment claim submitted! Awaiting receiver confirmation.', 'success');
        closeIPaidModal();
        submitIPaidBtn.disabled = false;
        submitIPaidBtn.textContent = 'Submit Payment Claim';
        initTripPage();
      } catch (err) {
        console.error('Submit payment error:', err);
        showAlert(ipaidAlertEl, err.message || 'Failed to submit payment claim.', 'danger');
        submitIPaidBtn.disabled = false;
        submitIPaidBtn.textContent = 'Submit Payment Claim';
      }
    });
  }

  // End Trip Button
  const endTripBtn = document.getElementById('end-trip-btn');
  if (endTripBtn) {
    endTripBtn.addEventListener('click', () => {
      openConfirmModal(
        'End Trip',
        'Ending this trip will freeze all new expenses, invitations, and financial edits permanently while preserving the complete historical ledger. Are you sure?',
        async () => {
          try {
            await api.post(`/api/trips/${tripId}/end`);
            showAlert(document.getElementById('trip-alert-container'), 'Trip has been ended.', 'success');
            initTripPage();
          } catch (err) {
            console.error('End trip error:', err);
            showAlert(document.getElementById('trip-alert-container'), err.message || 'Failed to end trip.', 'danger');
          }
        }
      );
    });
  }

  // Leave Trip Button
  const leaveTripBtn = document.getElementById('leave-trip-btn');
  if (leaveTripBtn) {
    leaveTripBtn.addEventListener('click', () => {
      const myNet = tripBalances?.mySummary?.netBalance || 0;
      if (myNet !== 0) {
        const direction = myNet > 0 ? 'are owed' : 'owe';
        showAlert(
          document.getElementById('trip-alert-container'),
          `Cannot leave trip with an outstanding balance. You currently ${direction} ${formatPaise(Math.abs(myNet))}. All balances must be fully settled to ₹0.00 before leaving.`,
          'danger'
        );
        return;
      }

      openConfirmModal(
        'Leave Trip',
        'You have zero outstanding debt on this trip. Leaving will mark your membership as LEFT while preserving all historical expenses and splits. Are you sure you want to leave?',
        async () => {
          try {
            await api.post(`/api/trips/${tripId}/leave`);
            alert('You have left the trip. Redirecting to dashboard...');
            window.location.href = '/dashboard.html';
          } catch (err) {
            console.error('Leave trip error:', err);
            showAlert(document.getElementById('trip-alert-container'), err.message || 'Failed to leave trip.', 'danger');
          }
        }
      );
    });
  }

  // Confirm Modal Ok / Cancel
  const confirmOkBtn = document.getElementById('confirm-modal-ok-btn');
  const confirmCancelBtn = document.getElementById('confirm-modal-cancel-btn');
  if (confirmOkBtn) {
    confirmOkBtn.addEventListener('click', () => {
      if (onConfirmCallback) {
        const cb = onConfirmCallback;
        closeConfirmModal();
        cb();
      }
    });
  }
  if (confirmCancelBtn) confirmCancelBtn.addEventListener('click', closeConfirmModal);
}
