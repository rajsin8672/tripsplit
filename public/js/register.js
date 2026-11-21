/**
 * Registration form controller module
 */

import { registerUser, getFriendlyAuthErrorMessage } from './auth.js';
import { redirectIfAuth } from './auth-guard.js';
import { validateEmail, validateDisplayName, validatePassword } from './validation.js';
import { showAlert, clearAlert, setButtonLoading, togglePasswordVisibility } from './ui.js';

// Redirect if already authenticated
redirectIfAuth();

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('register-form');
  const submitBtn = document.getElementById('register-submit-btn');
  const alertContainer = document.getElementById('register-alert');

  const nameInput = document.getElementById('reg-name');
  const emailInput = document.getElementById('reg-email');
  const passwordInput = document.getElementById('reg-password');
  const confirmPasswordInput = document.getElementById('reg-confirm-password');
  const termsCheckbox = document.getElementById('reg-terms');

  const togglePasswordBtn = document.getElementById('toggle-reg-password');
  const toggleConfirmPasswordBtn = document.getElementById('toggle-reg-confirm-password');

  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
      togglePasswordVisibility(passwordInput, togglePasswordBtn);
    });
  }

  if (toggleConfirmPasswordBtn && confirmPasswordInput) {
    toggleConfirmPasswordBtn.addEventListener('click', () => {
      togglePasswordVisibility(confirmPasswordInput, toggleConfirmPasswordBtn);
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert(alertContainer);

      const displayName = nameInput.value.trim();
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const confirmPassword = confirmPasswordInput.value;
      const termsAccepted = termsCheckbox.checked;

      // Client-side validations
      if (!displayName) {
        showAlert(alertContainer, 'Please enter your full name.', 'danger');
        nameInput.focus();
        return;
      }

      if (!validateDisplayName(displayName)) {
        showAlert(alertContainer, 'Full name must be between 2 and 60 characters with valid letters.', 'danger');
        nameInput.focus();
        return;
      }

      if (!email) {
        showAlert(alertContainer, 'Please enter your email address.', 'danger');
        emailInput.focus();
        return;
      }

      if (!validateEmail(email)) {
        showAlert(alertContainer, 'Please enter a valid email address format (e.g. name@example.com).', 'danger');
        emailInput.focus();
        return;
      }

      if (!password) {
        showAlert(alertContainer, 'Please enter a password.', 'danger');
        passwordInput.focus();
        return;
      }

      if (!validatePassword(password)) {
        showAlert(alertContainer, 'Password must be at least 8 characters long.', 'danger');
        passwordInput.focus();
        return;
      }

      if (password !== confirmPassword) {
        showAlert(alertContainer, 'Passwords do not match. Please re-enter confirmation password.', 'danger');
        confirmPasswordInput.focus();
        return;
      }

      if (!termsAccepted) {
        showAlert(alertContainer, 'Please acknowledge and agree to the Terms of Service to continue.', 'danger');
        termsCheckbox.focus();
        return;
      }

      setButtonLoading(submitBtn, true, 'Creating Account...');

      try {
        await registerUser(displayName, email, password);
        showAlert(alertContainer, 'Account created successfully! Redirecting to dashboard...', 'success');
        setTimeout(() => {
          window.location.href = '/dashboard.html';
        }, 800);
      } catch (err) {
        console.error('Registration failed:', err);
        const friendlyMessage = getFriendlyAuthErrorMessage(err.code || '') || err.message;
        showAlert(alertContainer, friendlyMessage, 'danger');
        setButtonLoading(submitBtn, false);
      }
    });
  }
});
