/**
 * TripSplit — Dashboard Controller
 * Handles user profile summary, trips exploration, invitations, and trip creation.
 */

import { requireAuth } from './auth-guard.js';
import { api, setApiAuthUser } from './api.js';
import { logoutUser } from './auth.js';
import { showAlert, clearAlerts, escapeHtml } from './ui.js';

let allTrips = [];
let pendingInvitations = [];
let currentFilter = 'all';
let currentSearch = '';
let currentUser = null;
let listenersInitialized = false;

// Initialize event listeners immediately so buttons (like modal openers) work right away
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupEventListeners);
} else {
  setupEventListeners();
}

requireAuth((authUser) => {
  currentUser = authUser;
  setApiAuthUser(authUser);
  loadDashboardData();
});

async function loadDashboardData() {
  const loadingContainer = document.getElementById('dashboard-loading');
  const contentContainer = document.getElementById('dashboard-content');
  const errorContainer = document.getElementById('dashboard-error');
  const errorMessageEl = document.getElementById('dashboard-error-message');
  const retryBtn = document.getElementById('dashboard-retry-btn');

  // Hard safety timer: ensure the spinner never stays visible for more than 2.5 seconds
  const safetyTimer = setTimeout(() => {
    if (loadingContainer && loadingContainer.style.display !== 'none') {
      console.warn('[Dashboard] Safety timer: revealing dashboard content');
      loadingContainer.style.display = 'none';
      if (contentContainer) contentContainer.style.display = 'block';
    }
  }, 2500);

  try {
    // 1. Fetch user profile (with fallback to currentUser if API is warming up)
    let profile = null;
    try {
      const profileRes = await api.get('/api/users/me');
      profile = profileRes?.data;
    } catch (profErr) {
      console.warn('[Dashboard] Profile fetch fallback:', profErr.message);
      profile = {
        displayName: currentUser?.displayName || 'Friend',
        userCode: 'TS-MEMBER'
      };
    }

    // Auto-heal: If profile displayName is generic "TripSplit User" but auth has a specific name
    if ((!profile?.displayName || profile.displayName === 'TripSplit User') && currentUser?.displayName && currentUser.displayName !== 'TripSplit User') {
      profile.displayName = currentUser.displayName;
      api.patch('/api/users/me', { displayName: currentUser.displayName }).catch(() => {});
    }

    renderProfileHeader(profile || {});

    // 2. Fetch user's trips and invitations in parallel
    const [tripsRes, invitesRes] = await Promise.all([
      api.get('/api/trips').catch(err => {
        console.warn('[Dashboard] Trips fetch fallback:', err.message);
        return { data: [] };
      }),
      api.get('/api/invitations').catch(err => {
        console.warn('[Dashboard] Invitations fetch fallback:', err.message);
        return { data: [] };
      })
    ]);

    allTrips = tripsRes?.data || [];
    pendingInvitations = (invitesRes?.data || []).filter(i => i.status === 'PENDING');

    updateStats();
    renderInvitations();
    renderTrips();
  } catch (err) {
    console.error('Failed to load dashboard data:', err);
    if (errorMessageEl) {
      errorMessageEl.textContent = err.message || 'Failed to fetch dashboard data from server.';
    }
    if (retryBtn) {
      retryBtn.onclick = () => loadDashboardData();
    }
  } finally {
    clearTimeout(safetyTimer);
    if (loadingContainer) loadingContainer.style.display = 'none';
    if (contentContainer) contentContainer.style.display = 'block';
  }
}

function renderProfileHeader(profile) {
  const nameEl = document.getElementById('dash-user-name');
  const codeEl = document.getElementById('dash-user-code');

  if (nameEl) nameEl.textContent = profile.displayName || currentUser?.displayName || 'Friend';
  if (codeEl) codeEl.textContent = profile.userCode || 'TS-MEMBER';
}

function updateStats() {
  const activeTrips = allTrips.filter(t => t.status === 'ACTIVE');
  const endedTrips = allTrips.filter(t => t.status === 'ENDED');

  const activeCountEl = document.getElementById('stat-active-trips');
  const endedCountEl = document.getElementById('stat-ended-trips');
  const invitesCountEl = document.getElementById('stat-pending-invitations');
  const totalExpEl = document.getElementById('stat-total-expenses');

  if (activeCountEl) activeCountEl.textContent = activeTrips.length;
  if (endedCountEl) endedCountEl.textContent = endedTrips.length;
  if (invitesCountEl) invitesCountEl.textContent = pendingInvitations.length;

  // Compute total expenses across active trips
  let totalPaise = 0;
  for (const t of activeTrips) {
    if (t.totalExpensesPaise) totalPaise += t.totalExpensesPaise;
  }
  if (totalExpEl) {
    const rupees = (totalPaise / 100).toFixed(2);
    totalExpEl.textContent = `₹${rupees}`;
  }
}

function renderInvitations() {
  const section = document.getElementById('invitations-section');
  const list = document.getElementById('invitations-list');
  const badge = document.getElementById('invitations-count-badge');

  if (!section || !list) return;

  if (pendingInvitations.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  if (badge) badge.textContent = `${pendingInvitations.length} Pending`;

  list.innerHTML = pendingInvitations.map(inv => `
    <div class="card" style="padding: 1.25rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; border-left: 4px solid var(--color-warning);">
      <div>
        <div style="font-weight: 700; font-size: 1.05rem; color: var(--color-navy); margin-bottom: 0.25rem;">
          ${escapeHtml(inv.tripName || 'Travel Trip')}
        </div>
        <div style="font-size: 0.85rem; color: var(--text-muted);">
          Destination: <strong>${escapeHtml(inv.tripDestination || 'Various')}</strong> &bull; Invited by <strong>${escapeHtml(inv.inviterName || 'A friend')}</strong>
        </div>
      </div>
      <div style="display: flex; gap: 0.5rem;">
        <button type="button" class="btn btn-primary btn-sm accept-invite-btn" data-id="${escapeHtml(inv.invitationId)}">
          Accept & Join
        </button>
        <button type="button" class="btn btn-outline btn-sm" id="reject-invite-${escapeHtml(inv.invitationId)}" data-id="${escapeHtml(inv.invitationId)}">
          Decline
        </button>
      </div>
    </div>
  `).join('');

  // Attach invite action handlers
  list.querySelectorAll('.accept-invite-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const invId = e.currentTarget.getAttribute('data-id');
      await respondToInvitation(invId, 'accept');
    });
  });

  list.querySelectorAll('[id^="reject-invite-"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const invId = e.currentTarget.getAttribute('data-id');
      await respondToInvitation(invId, 'reject');
    });
  });
}

async function respondToInvitation(invitationId, action) {
  const alertContainer = document.getElementById('dashboard-alert-container');
  try {
    await api.post(`/api/invitations/${invitationId}/${action}`);
    showAlert(alertContainer, `Invitation ${action === 'accept' ? 'accepted! Welcome to the trip.' : 'declined.'}`, 'success');
    loadDashboardData();
  } catch (err) {
    console.error(`Failed to ${action} invitation:`, err);
    showAlert(alertContainer, err.message || `Failed to ${action} invitation.`, 'danger');
  }
}

function renderTrips() {
  const container = document.getElementById('trips-container');
  const emptyState = document.getElementById('trips-empty-state');
  const emptyTitle = document.getElementById('empty-state-title');
  const emptyDesc = document.getElementById('empty-state-desc');

  if (!container || !emptyState) return;

  // Filter trips by status and search
  const filtered = allTrips.filter(t => {
    const matchesFilter = currentFilter === 'all' || t.status === currentFilter;
    const matchesSearch = !currentSearch ||
      t.name.toLowerCase().includes(currentSearch) ||
      t.destination.toLowerCase().includes(currentSearch);
    return matchesFilter && matchesSearch;
  });

  if (filtered.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'block';

    if (emptyTitle && emptyDesc) {
      if (currentSearch || currentFilter !== 'all') {
        emptyTitle.textContent = 'No Matching Trips';
        emptyDesc.textContent = 'No trips matched your search or filter criteria. Try adjusting your query.';
      } else {
        emptyTitle.textContent = 'No Trips Found';
        emptyDesc.textContent = 'You are not currently a member of any trips. Create your first trip to start splitting expenses with friends!';
      }
    }
    return;
  }

  emptyState.style.display = 'none';
  container.style.display = 'grid';

  container.innerHTML = filtered.map(trip => {
    const isOwner = trip.role === 'OWNER';
    const isEnded = trip.status === 'ENDED';
    const dates = trip.startDate
      ? `${new Date(trip.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${trip.endDate ? '– ' + new Date(trip.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}`
      : 'Dates flexible';

    return `
      <div class="trip-card">
        <div>
          <div class="trip-card-header">
            <div>
              <a href="/trip.html?id=${escapeHtml(trip.tripId)}" class="trip-card-title">
                ${escapeHtml(trip.name)}
              </a>
              <div class="trip-destination-pill">
                <span aria-hidden="true">&#128205;</span> ${escapeHtml(trip.destination)}
              </div>
            </div>
            <span class="badge ${isEnded ? 'badge-muted' : 'badge-success'}">
              ${isEnded ? 'ENDED' : 'ACTIVE'}
            </span>
          </div>

          <div class="trip-card-meta">
            <span class="badge ${isOwner ? 'badge-navy' : 'badge-cyan'}">
              ${isOwner ? '👑 Owner' : 'Member'}
            </span>
            <span class="badge badge-light">
              👥 ${trip.memberCount || 1} ${trip.memberCount === 1 ? 'member' : 'members'}
            </span>
            <span class="badge badge-light">
              📅 ${escapeHtml(dates)}
            </span>
          </div>

          ${trip.description ? `
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem; line-height: 1.4;">
              ${escapeHtml(trip.description)}
            </p>
          ` : ''}
        </div>

        <div class="trip-card-footer">
          <span style="font-size: 0.8rem; color: var(--text-muted);">
            ID: <strong class="user-code-pill">${escapeHtml(trip.tripId)}</strong>
          </span>
          <a href="/trip.html?id=${escapeHtml(trip.tripId)}" class="btn btn-outline btn-sm">
            View Trip &rarr;
          </a>
        </div>
      </div>
    `;
  }).join('');
}

function setupEventListeners() {
  if (listenersInitialized) return;
  listenersInitialized = true;

  const logoutBtn = document.getElementById('dash-logout-btn');
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
      renderTrips();
    });
  });

  // Search input
  const searchInput = document.getElementById('trip-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value.trim().toLowerCase();
      renderTrips();
    });
  }

  // Create Trip Modal controls
  const modal = document.getElementById('create-trip-modal');
  const openBtn = document.getElementById('open-create-trip-btn');
  const emptyOpenBtn = document.getElementById('empty-create-trip-btn');
  const closeBtn = document.getElementById('close-create-trip-btn');
  const cancelBtn = document.getElementById('cancel-create-trip-btn');
  const createForm = document.getElementById('create-trip-form');
  const alertEl = document.getElementById('create-trip-alert');
  const submitBtn = document.getElementById('submit-create-trip-btn');

  const openModal = () => {
    clearAlerts(alertEl);
    if (createForm) createForm.reset();
    if (modal) modal.classList.add('is-active');
  };

  const closeModal = () => {
    if (modal) modal.classList.remove('is-active');
  };

  if (openBtn) openBtn.addEventListener('click', openModal);
  if (emptyOpenBtn) emptyOpenBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  // Create Trip form submit
  if (createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlerts(alertEl);

      const name = document.getElementById('trip-name').value.trim();
      const destination = document.getElementById('trip-destination').value.trim();
      const startDate = document.getElementById('trip-start-date').value;
      const endDate = document.getElementById('trip-end-date').value;
      const currency = document.getElementById('trip-currency').value;
      const description = document.getElementById('trip-description').value.trim();

      if (!name) {
        showAlert(alertEl, 'Trip name is required.', 'danger');
        return;
      }
      if (!destination) {
        showAlert(alertEl, 'Destination is required.', 'danger');
        return;
      }
      if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
        showAlert(alertEl, 'End date cannot be earlier than start date.', 'danger');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating Trip...';

      try {
        const response = await api.post('/api/trips', {
          name,
          destination,
          startDate,
          endDate,
          currency,
          description
        });

        const newTrip = response.data;
        closeModal();
        // Redirect directly to the newly created trip details page!
        window.location.href = `/trip.html?id=${newTrip.tripId}`;
      } catch (err) {
        console.error('Failed to create trip:', err);
        showAlert(alertEl, err.message || 'Failed to create trip.', 'danger');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Trip';
      }
    });
  }
}
