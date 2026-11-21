/**
 * Forgot / Reset Password Page Controller Module
 */

import { resetPassword, getFriendlyAuthErrorMessage } from './auth.js';
import { redirectIfAuth } from './auth-guard.js';
import { validateEmail } from './validation.js';
import { showAlert, clearAlert, setButtonLoading } from './ui.js';

// Redirect if already authenticated
redirectIfAuth();

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('forgot-password-form');
  const emailInput = document.getElementById('forgot-email');
  const submitBtn = document.getElementById('forgot-submit-btn');
  const alertContainer = document.getElementById('reset-alert');
  const successGuide = document.getElementById('reset-success-guide');

  // Pre-fill email from URL search params if provided (e.g. /forgot-password.html?email=user@test.com)
  const urlParams = new URLSearchParams(window.location.search);
  const emailParam = urlParams.get('email');
  if (emailParam && emailInput) {
    emailInput.value = emailParam.trim();
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert(alertContainer);
      if (successGuide) successGuide.style.display = 'none';

      const email = emailInput?.value.trim();

      if (!email || !validateEmail(email)) {
        showAlert(alertContainer, 'Please enter a valid email address.', 'danger');
        emailInput?.focus();
        return;
      }

      setButtonLoading(submitBtn, true, 'Sending Email...');

      try {
        await resetPassword(email);

        showAlert(
          alertContainer,
          'Password reset instructions have been sent to your email. Please check your inbox (and spam folder) to set your new password.',
          'success'
        );

        if (successGuide) {
          successGuide.style.display = 'block';
        }

        setButtonLoading(submitBtn, false, 'Reset Link Sent');
        submitBtn.disabled = true;

        // Re-enable after 30 seconds to allow retry if needed
        setTimeout(() => {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Resend Reset Link';
        }, 30000);

      } catch (err) {
        console.error('[Forgot Password Error]', err);
        const friendlyMessage = getFriendlyAuthErrorMessage(err.code || '') || err.message;
        showAlert(alertContainer, friendlyMessage, 'danger');
        setButtonLoading(submitBtn, false, 'Send Reset Link');
      }
    });
  }
});
