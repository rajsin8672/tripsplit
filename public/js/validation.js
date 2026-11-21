/**
 * Client-side validation utilities for TripSplit
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
  const nameRegex = /^[\p{L}\p{M}\s.'\-]+$/u;
  return nameRegex.test(trimmed);
}

export function validatePassword(password) {
  if (!password || typeof password !== 'string') return false;
  return password.length >= 8 && password.length <= 128;
}

export function validateUpiId(upiId) {
  if (upiId === undefined || upiId === null || upiId === '') return true;
  if (typeof upiId !== 'string') return false;
  const trimmed = upiId.trim();
  if (trimmed === '') return true;
  if (trimmed.length < 3 || trimmed.length > 100) return false;
  const upiRegex = /^[a-zA-Z0-9.\-_]{2,60}@[a-zA-Z0-9]{2,30}$/;
  return upiRegex.test(trimmed);
}
