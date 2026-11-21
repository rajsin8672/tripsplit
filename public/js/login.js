/**
 * Login form controller module
 */

import { loginUser, resetPassword, getFriendlyAuthErrorMessage } from './auth.js';
import { redirectIfAuth } from './auth-guard.js';
import { validateEmail } from './validation.js';
import { showAlert, clearAlert, setButtonLoading, togglePasswordVisibility } from './ui.js';

// Redirect if already authenticated
redirectIfAuth();

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  const submitBtn = document.getElementById('login-submit-btn');
  const alertContainer = document.getElementById('login-alert');

  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const togglePasswordBtn = document.getElementById('toggle-login-password');

  // Password reset modal elements
  const forgotPasswordLink = document.getElementById('forgot-password-link');
  const resetModal = document.getElementById('reset-modal');
  const closeResetModalBtn = document.getElementById('close-reset-modal');
  const resetForm = document.getElementById('reset-form');
  const resetEmailInput = document.getElementById('reset-email');
  const resetSubmitBtn = document.getElementById('reset-submit-btn');
  const resetAlert = document.getElementById('reset-alert');

  // Check URL parameters for any notification or config alerts
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('config') === 'missing') {
    showAlert(alertContainer, 'Firebase configuration is required to sign in. Please configure your .env credentials.', 'warning');
  }

  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
      togglePasswordVisibility(passwordInput, togglePasswordBtn);
    });
  }

  // Handle Login Submit
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert(alertContainer);

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!email) {
        showAlert(alertContainer, 'Please enter your email address.', 'danger');
        emailInput.focus();
        return;
      }

      if (!validateEmail(email)) {
        showAlert(alertContainer, 'Please enter a valid email address.', 'danger');
        emailInput.focus();
        return;
      }

      if (!password) {
        showAlert(alertContainer, 'Please enter your password.', 'danger');
        passwordInput.focus();
        return;
      }

      setButtonLoading(submitBtn, true, 'Signing In...');

      try {
        await loginUser(email, password);
        showAlert(alertContainer, 'Signed in successfully! Redirecting...', 'success');

        const params = new URLSearchParams(window.location.search);
        const redirectUrl = params.get('redirect') || '/dashboard.html';
        const safeRedirect = redirectUrl.startsWith('/') && !redirectUrl.startsWith('//') ? redirectUrl : '/dashboard.html';

        setTimeout(() => {
          window.location.href = safeRedirect;
        }, 600);
      } catch (err) {
        console.error('Login failed:', err);
        const friendlyMessage = getFriendlyAuthErrorMessage(err.code || '') || err.message;
        showAlert(alertContainer, friendlyMessage, 'danger');
        setButtonLoading(submitBtn, false);
      }
    });
  }

  // Handle Forgot Password Modal
  if (forgotPasswordLink && resetModal) {
    forgotPasswordLink.addEventListener('click', (e) => {
      e.preventDefault();
      clearAlert(resetAlert);
      if (emailInput.value.trim()) {
        resetEmailInput.value = emailInput.value.trim();
      }
      resetModal.classList.add('is-active');
      resetEmailInput.focus();
    });

    closeResetModalBtn.addEventListener('click', () => {
      resetModal.classList.remove('is-active');
    });

    resetModal.addEventListener('click', (e) => {
      if (e.target === resetModal) {
        resetModal.classList.remove('is-active');
      }
    });

    if (resetForm) {
      resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAlert(resetAlert);

        const email = resetEmailInput.value.trim();
        if (!email || !validateEmail(email)) {
          showAlert(resetAlert, 'Please enter a valid email address.', 'danger');
          resetEmailInput.focus();
          return;
        }

        setButtonLoading(resetSubmitBtn, true, 'Sending Email...');

        try {
          await resetPassword(email);
          showAlert(resetAlert, 'Password reset instructions have been sent to your email. Please check your inbox.', 'success');
          setButtonLoading(resetSubmitBtn, false);
          setTimeout(() => {
            resetModal.classList.remove('is-active');
          }, 3500);
        } catch (err) {
          console.error('Password reset error:', err);
          const friendlyMessage = getFriendlyAuthErrorMessage(err.code || '') || err.message;
          showAlert(resetAlert, friendlyMessage, 'danger');
          setButtonLoading(resetSubmitBtn, false);
        }
      });
    }
  }
});
