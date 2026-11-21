/**
 * TripSplit — Admin Console Controller
 * Manages administrative metrics, user inspection, and trip governance for authorized administrators.
 */

import { requireAuth } from './auth-guard.js';
import { api, setApiAuthUser } from './api.js';
import { logoutUser } from './auth.js';
import { showAlert, clearAlerts, escapeHtml } from './ui.js';

let allUsers = [];
let allTrips = [];
let currentTab = 'users';
let userSearchQuery = '';
let tripSearchQuery = '';

requireAuth(async (authUser) => {
  setApiAuthUser(authUser);
  await verifyAndLoadAdmin(authUser);
});

async function verifyAndLoadAdmin(authUser) {
  const loadingEl = document.getElementById('admin-loading');
  const deniedEl = document.getElementById('admin-denied');
  const contentEl = document.getElementById('admin-content');
  const deniedEmailEl = document.getElementById('denied-user-email');

  try {
    const checkRes = await api.get('/api/admin/check');
    if (!checkRes?.data?.isAdmin) {
      throw new Error('Not an admin');
    }

    // Authorized
    const adminEmailDisplay = document.getElementById('admin-email-display');
    if (adminEmailDisplay) adminEmailDisplay.textContent = authUser.displayName || authUser.email || 'Platform Administrator';

    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';

    setupAdminEventListeners();
    await loadAdminData();
  } catch (err) {
    console.warn('[Admin] Authorization check rejected:', err.message);
    if (deniedEmailEl) deniedEmailEl.textContent = authUser.email || 'Anonymous';
    if (loadingEl) loadingEl.style.display = 'none';
    if (deniedEl) deniedEl.style.display = 'block';
  }
}

async function loadAdminData() {
  try {
    const [statsRes, usersRes, tripsRes] = await Promise.all([
      api.get('/api/admin/stats').catch(() => ({ data: {} })),
      api.get('/api/admin/users').catch(() => ({ data: [] })),
      api.get('/api/admin/trips').catch(() => ({ data: [] }))
    ]);

    renderStats(statsRes?.data || {});
    allUsers = usersRes?.data || [];
    allTrips = tripsRes?.data || [];

    renderUsersTable();
    renderTripsTable();
  } catch (err) {
    console.error('Failed to load admin data:', err);
    const alertContainer = document.getElementById('admin-alert-container');
    showAlert(alertContainer, 'Failed to fetch updated platform metrics: ' + err.message, 'danger');
  }
}

function renderStats(stats) {
  // Users
  const usersTotalEl = document.getElementById('metric-users-total');
  if (usersTotalEl) usersTotalEl.textContent = stats.users?.total ?? 0;

  // Trips
  const tripsTotalEl = document.getElementById('metric-trips-total');
  const tripsActiveEl = document.getElementById('metric-trips-active');
  const tripsEndedEl = document.getElementById('metric-trips-ended');
  if (tripsTotalEl) tripsTotalEl.textContent = stats.trips?.total ?? 0;
  if (tripsActiveEl) tripsActiveEl.textContent = stats.trips?.active ?? 0;
  if (tripsEndedEl) tripsEndedEl.textContent = stats.trips?.ended ?? 0;

  // Expenses
  const expAmountEl = document.getElementById('metric-expenses-amount');
  const expCountEl = document.getElementById('metric-expenses-count');
  if (expAmountEl) expAmountEl.textContent = `₹${stats.expenses?.totalAmountRupees || '0.00'}`;
  if (expCountEl) expCountEl.textContent = stats.expenses?.total ?? 0;

  // Settlements
  const setTotalEl = document.getElementById('metric-settlements-total');
  const setPaidEl = document.getElementById('metric-settlements-paid');
  const setPendingEl = document.getElementById('metric-settlements-pending');
  if (setTotalEl) setTotalEl.textContent = stats.settlements?.total ?? 0;
  if (setPaidEl) setPaidEl.textContent = stats.settlements?.paid ?? 0;
  if (setPendingEl) setPendingEl.textContent = stats.settlements?.pending ?? 0;

  // Tab counts
  const tabUsersCount = document.getElementById('tab-users-count');
  const tabTripsCount = document.getElementById('tab-trips-count');
  if (tabUsersCount) tabUsersCount.textContent = stats.users?.total ?? 0;
  if (tabTripsCount) tabTripsCount.textContent = stats.trips?.total ?? 0;

  // System
  const sysEngine = document.getElementById('sys-engine-mode');
  const sysNode = document.getElementById('sys-node-env');
  if (sysEngine) sysEngine.textContent = stats.system?.engineMode || 'Local Development Engine';
  if (sysNode) sysNode.textContent = stats.system?.nodeEnv || 'development';
}

function renderUsersTable() {
  const tbody = document.getElementById('admin-users-tbody');
  if (!tbody) return;

  const query = userSearchQuery.trim().toLowerCase();
  const filtered = allUsers.filter(u => {
    if (!query) return true;
    return (
      (u.displayName && u.displayName.toLowerCase().includes(query)) ||
      (u.email && u.email.toLowerCase().includes(query)) ||
      (u.userCode && u.userCode.toLowerCase().includes(query))
    );
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          No registered users found matching "${escapeHtml(userSearchQuery)}".
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(u => `
    <tr>
      <td>
        <strong>${escapeHtml(u.displayName || 'TripSplit User')}</strong>
      </td>
      <td>${escapeHtml(u.email)}</td>
      <td><span class="badge badge-navy">${escapeHtml(u.userCode)}</span></td>
      <td><code style="font-size: 0.8rem;">${escapeHtml(u.upiId || 'Not linked')}</code></td>
      <td><span class="badge badge-cyan">${u.activeTripsCount} trips</span></td>
      <td style="color: var(--text-muted); font-size: 0.8rem;">
        ${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
      </td>
    </tr>
  `).join('');
}

function renderTripsTable() {
  const tbody = document.getElementById('admin-trips-tbody');
  if (!tbody) return;

  const query = tripSearchQuery.trim().toLowerCase();
  const filtered = allTrips.filter(t => {
    if (!query) return true;
    return (
      (t.name && t.name.toLowerCase().includes(query)) ||
      (t.destination && t.destination.toLowerCase().includes(query)) ||
      (t.creator?.name && t.creator.name.toLowerCase().includes(query)) ||
      (t.creator?.email && t.creator.email.toLowerCase().includes(query))
    );
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          No platform trips found matching "${escapeHtml(tripSearchQuery)}".
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(t => {
    const isActive = t.status === 'ACTIVE';
    return `
      <tr>
        <td>
          <a href="/trip.html?id=${escapeHtml(t.tripId)}" style="font-weight: 700; color: var(--color-navy); text-decoration: none;">
            ${escapeHtml(t.name)} &rarr;
          </a>
        </td>
        <td>${escapeHtml(t.destination)}</td>
        <td>
          <span class="badge ${isActive ? 'badge-success' : 'badge-navy'}">
            ${escapeHtml(t.status)}
          </span>
        </td>
        <td>
          <div style="font-size: 0.85rem;">${escapeHtml(t.creator?.name || 'Unknown')}</div>
          <div style="font-size: 0.75rem; color: var(--text-light);">${escapeHtml(t.creator?.email || '')}</div>
        </td>
        <td><span class="badge badge-cyan">${t.memberCount} members</span></td>
        <td><strong>₹${escapeHtml(t.totalExpenseRupees)}</strong></td>
        <td style="color: var(--text-muted); font-size: 0.8rem;">
          ${t.createdAt ? new Date(t.createdAt).toLocaleDateString() : 'N/A'}
        </td>
        <td>
          ${isActive ? `
            <button type="button" class="btn btn-outline btn-sm admin-end-trip-btn" data-id="${escapeHtml(t.tripId)}" style="color: var(--color-danger); border-color: var(--color-danger); font-size: 0.75rem; padding: 0.2rem 0.5rem;">
              End Trip
            </button>
          ` : `
            <span style="font-size: 0.8rem; color: var(--text-light);">Ended</span>
          `}
        </td>
      </tr>
    `;
  }).join('');

  // Attach End Trip actions
  tbody.querySelectorAll('.admin-end-trip-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const tripId = e.currentTarget.getAttribute('data-id');
      if (!confirm(`Are you sure you want to end trip "${tripId}" as platform administrator?`)) {
        return;
      }
      try {
        await api.post(`/api/admin/trips/${tripId}/end`);
        const alertEl = document.getElementById('admin-alert-container');
        showAlert(alertEl, `Trip ${tripId} has been successfully ended.`, 'success');
        await loadAdminData();
      } catch (endErr) {
        alert('Failed to end trip: ' + endErr.message);
      }
    });
  });
}

function setupAdminEventListeners() {
  const logoutBtn = document.getElementById('admin-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await logoutUser();
        window.location.href = '/index.html';
      } catch {
        window.location.href = '/login.html';
      }
    });
  }

  const refreshBtn = document.getElementById('admin-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = '↻ Refreshing...';
      await loadAdminData();
      refreshBtn.disabled = false;
      refreshBtn.textContent = '↻ Refresh Data';
    });
  }

  // Tab buttons
  const tabUsersBtn = document.getElementById('tab-users-btn');
  const tabTripsBtn = document.getElementById('tab-trips-btn');
  const tabSysBtn = document.getElementById('tab-system-btn');

  const secUsers = document.getElementById('section-users');
  const secTrips = document.getElementById('section-trips');
  const secSys = document.getElementById('section-system');

  const switchTab = (tab) => {
    currentTab = tab;
    [tabUsersBtn, tabTripsBtn, tabSysBtn].forEach(b => b?.classList.remove('active'));
    [secUsers, secTrips, secSys].forEach(s => { if (s) s.style.display = 'none'; });

    if (tab === 'users') {
      tabUsersBtn?.classList.add('active');
      if (secUsers) secUsers.style.display = 'block';
    } else if (tab === 'trips') {
      tabTripsBtn?.classList.add('active');
      if (secTrips) secTrips.style.display = 'block';
    } else if (tab === 'system') {
      tabSysBtn?.classList.add('active');
      if (secSys) secSys.style.display = 'block';
    }
  };

  if (tabUsersBtn) tabUsersBtn.addEventListener('click', () => switchTab('users'));
  if (tabTripsBtn) tabTripsBtn.addEventListener('click', () => switchTab('trips'));
  if (tabSysBtn) tabSysBtn.addEventListener('click', () => switchTab('system'));

  // Search inputs
  const searchUsers = document.getElementById('search-users-input');
  if (searchUsers) {
    searchUsers.addEventListener('input', (e) => {
      userSearchQuery = e.target.value;
      renderUsersTable();
    });
  }

  const searchTrips = document.getElementById('search-trips-input');
  if (searchTrips) {
    searchTrips.addEventListener('input', (e) => {
      tripSearchQuery = e.target.value;
      renderTripsTable();
    });
  }
}
