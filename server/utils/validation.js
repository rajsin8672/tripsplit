/**
 * Validation utilities for TripSplit server
 */

export function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length > 254 || trimmed.length < 5) return false;
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(trimmed);
}

export function validateDisplayName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 60) return false;
  // Disallow angle brackets or script injection characters
  const nameRegex = /^[\p{L}\p{M}\s.'\-]+$/u;
  return nameRegex.test(trimmed);
}

export function validatePassword(password) {
  if (!password || typeof password !== 'string') return false;
  // Minimum 8 characters, maximum 128 characters
  if (password.length < 8 || password.length > 128) return false;
  return true;
}

export function validateUpiId(upiId) {
  // Empty UPI ID is allowed initially
  if (upiId === undefined || upiId === null || upiId === '') return true;
  if (typeof upiId !== 'string') return false;
  const trimmed = upiId.trim();
  if (trimmed === '') return true;
  if (trimmed.length < 3 || trimmed.length > 100) return false;
  // Format: handle@bank or handle@psp (e.g. username@okhdfcbank, 9876543210@paytm)
  const upiRegex = /^[a-zA-Z0-9.\-_]{2,60}@[a-zA-Z0-9]{2,30}$/;
  return upiRegex.test(trimmed);
}

export function generateUserCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // base32 without easily confused chars (0, 1, I, O)
  let code = 'TS-';
  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    code += chars[randomIndex];
  }
  return code;
}
