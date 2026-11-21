/**
 * UI helper utilities for safe DOM manipulation and feedback states
 */

export function showAlert(target, message, type = 'danger') {
  const container = typeof target === 'string' ? document.getElementById(target) : target;
  if (!container) return;

  container.innerHTML = '';
  const alertDiv = document.createElement('div');
  alertDiv.className = `alert alert-${type}`;

  const iconSpan = document.createElement('span');
  iconSpan.setAttribute('aria-hidden', 'true');
  iconSpan.textContent = type === 'success' ? '✓' : type === 'warning' ? '⚠' : '✕';

  const textSpan = document.createElement('span');
  textSpan.textContent = message;

  alertDiv.appendChild(iconSpan);
  alertDiv.appendChild(textSpan);
  container.appendChild(alertDiv);
  container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function clearAlert(target) {
  const container = typeof target === 'string' ? document.getElementById(target) : target;
  if (container) {
    container.innerHTML = '';
  }
}

export const clearAlerts = clearAlert;

export function setButtonLoading(btn, isLoading, loadingText = 'Processing...') {
  if (!btn) return;

  if (isLoading) {
    btn.dataset.originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" aria-hidden="true"></span> <span>${escapeHtml(loadingText)}</span>`;
  } else {
    btn.disabled = false;
    if (btn.dataset.originalHtml) {
      btn.innerHTML = btn.dataset.originalHtml;
    }
  }
}

export function togglePasswordVisibility(inputEl, toggleBtn) {
  if (!inputEl || !toggleBtn) return;
  const isPassword = inputEl.type === 'password';
  inputEl.type = isPassword ? 'text' : 'password';
  toggleBtn.textContent = isPassword ? 'Hide' : 'Show';
  toggleBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
}

export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
