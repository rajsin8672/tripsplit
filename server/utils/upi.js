/**
 * TripSplit UPI & Payment Utilities
 * Handles standard UPI payment URI generation and transaction reference validation.
 */

import { validateUpiId } from './validation.js';

/**
 * Generate a standard UPI payment URI
 * Example: upi://pay?pa=receiver@okaxis&pn=Receiver%20Name&am=1000.00&cu=INR&tn=TripSplit%20Settlement
 * 
 * @param {Object} params
 * @param {string} params.payeeVpa - Payee Virtual Payment Address (UPI ID)
 * @param {string} params.payeeName - Payee display name
 * @param {number} params.amountPaise - Amount in integer paise
 * @param {string} [params.transactionNote] - Note for payment
 * @param {string} [params.referenceId] - Settlement or transaction reference ID
 * @returns {string} Standard UPI URI
 */
export function generateUpiUri({ payeeVpa, payeeName, amountPaise, transactionNote, referenceId }) {
  if (!payeeVpa || !validateUpiId(payeeVpa)) {
    throw new Error('Valid payee UPI ID (VPA) is required to generate UPI payment URI.');
  }

  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new Error('Valid positive amount in paise is required.');
  }

  const amountRupees = (amountPaise / 100).toFixed(2);
  const cleanName = (payeeName || 'TripSplit Member').trim();
  const cleanNote = (transactionNote || `TripSplit Settlement ${referenceId || ''}`).trim();

  const queryParams = new URLSearchParams({
    pa: payeeVpa.trim(),
    pn: cleanName,
    am: amountRupees,
    cu: 'INR',
    tn: cleanNote
  });

  if (referenceId) {
    queryParams.set('tr', referenceId.trim());
  }

  return `upi://pay?${queryParams.toString()}`;
}

/**
 * Validate a user-submitted UPI Transaction Reference (UTR / Bank RRN)
 * Typically a 12-digit numeric reference or 8-32 char alphanumeric reference
 * @param {string} utr
 * @returns {boolean}
 */
export function validateUtr(utr) {
  if (!utr || typeof utr !== 'string') return false;
  const trimmed = utr.trim();
  if (trimmed.length < 6 || trimmed.length > 40) return false;
  // Allow alphanumeric characters, hyphens, and slashes commonly found in bank references
  const utrRegex = /^[a-zA-Z0-9\-_/]+$/;
  return utrRegex.test(trimmed);
}
