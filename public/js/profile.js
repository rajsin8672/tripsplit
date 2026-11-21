/**
 * User profile controller module
 */

import { requireAuth } from './auth-guard.js';
import { api, setApiAuthUser } from './api.js';
import { validateDisplayName, validateUpiId } from './validation.js';
import { showAlert, clearAlert, setButtonLoading } from './ui.js';

requireAuth((authUser) => {
  setApiAuthUser(authUser);
  initProfilePage(authUser);
});

async function initProfilePage(authUser) {
  const loadingContainer = document.getElementById('profile-loading');
  const contentContainer = document.getElementById('profile-content');
  const alertContainer = document.getElementById('profile-alert');

  const nameInput = document.getElementById('profile-name');
  const emailInput = document.getElementById('profile-email');
  const userCodeInput = document.getElementById('profile-usercode');
  const upiInput = document.getElementById('profile-upi');
  const avatarLetter = document.getElementById('profile-avatar-letter');
  const form = document.getElementById('profile-form');
  const saveBtn = document.getElementById('profile-save-btn');

  try {
    let profile = null;
    try {
      const response = await api.get('/api/users/me');
      profile = response?.data;
    } catch (fetchErr) {
      console.warn('[Profile] Initial fetch fallback:', fetchErr.message);
      profile = {
        displayName: authUser.displayName || '',
        email: authUser.email || '',
        userCode: 'TS-MEMBER',
        upiId: ''
      };
    }

    // Resolve best display name
    let resolvedName = profile?.displayName;
    if ((!resolvedName || resolvedName === 'TripSplit User') && authUser.displayName && authUser.displayName !== 'TripSplit User') {
      resolvedName = authUser.displayName;
    }

    // Populate profile inputs
    if (nameInput) nameInput.value = resolvedName || '';
    if (emailInput) emailInput.value = profile?.email || authUser.email || '';
    if (userCodeInput) userCodeInput.value = profile?.userCode || 'TS-MEMBER';
    if (upiInput) upiInput.value = profile?.upiId || '';

    if (avatarLetter) {
      avatarLetter.textContent = (resolvedName || 'U').charAt(0).toUpperCase();
    }

    if (loadingContainer) loadingContainer.style.display = 'none';
    if (contentContainer) contentContainer.style.display = 'grid';
  } catch (err) {
    console.error('Failed to load profile:', err);
    if (loadingContainer) loadingContainer.style.display = 'none';
    if (contentContainer) contentContainer.style.display = 'grid';
    showAlert(alertContainer, err.message || 'Unable to load profile from server. Please refresh.', 'danger');
  }

  // Handle Profile Update Form
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert(alertContainer);

      const displayName = nameInput.value.trim();
      const upiId = upiInput.value.trim();

      if (!displayName) {
        showAlert(alertContainer, 'Full name cannot be empty.', 'danger');
        nameInput.focus();
        return;
      }

      if (!validateDisplayName(displayName)) {
        showAlert(alertContainer, 'Full name must be between 2 and 60 valid characters.', 'danger');
        nameInput.focus();
        return;
      }

      if (upiId && !validateUpiId(upiId)) {
        showAlert(alertContainer, 'Invalid UPI ID format. Expected format: username@bank (e.g. rahul@okaxis).', 'danger');
        upiInput.focus();
        return;
      }

      setButtonLoading(saveBtn, true, 'Saving Changes...');

      try {
        const updateResponse = await api.patch('/api/users/me', {
          displayName,
          upiId
        });

        showAlert(alertContainer, 'Profile updated successfully!', 'success');
        if (avatarLetter) {
          avatarLetter.textContent = displayName.charAt(0).toUpperCase();
        }
        setButtonLoading(saveBtn, false);
      } catch (err) {
        console.error('Failed to update profile:', err);
        showAlert(alertContainer, err.message || 'Failed to update profile. Please try again.', 'danger');
        setButtonLoading(saveBtn, false);
      }
    });
  }
}
