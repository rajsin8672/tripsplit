/**
 * TripSplit — Administrator Authorization Middleware
 * Enforces admin access for platform monitoring, user management, and system auditing.
 */

import { getUserProfile } from '../services/userService.js';

export function getAdminEmails() {
  const envAdmins = process.env.ADMIN_EMAILS || '';
  return envAdmins
    .toLowerCase()
    .split(',')
    .map(e => e.trim())
    .filter(Boolean);
}

export function isUserAdmin(email) {
  if (!email || typeof email !== 'string') return false;
  const admins = getAdminEmails();
  return admins.includes(email.toLowerCase().trim());
}

export async function requireAdmin(req, res, next) {
  if (!req.user || !req.user.uid) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Please sign in.'
      }
    });
  }

  let userEmail = (req.user.email || '').toLowerCase().trim();
  const admins = getAdminEmails();

  // If email was not in token payload, check user profile in database
  if ((!userEmail || !admins.includes(userEmail)) && req.user.uid) {
    try {
      const profile = await getUserProfile(req.user.uid);
      if (profile && profile.email) {
        userEmail = profile.email.toLowerCase().trim();
        req.user.email = profile.email;
      }
    } catch {}
  }

  if (!admins.includes(userEmail)) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN_NOT_ADMIN',
        message: 'Access denied. You do not have administrator privileges.'
      }
    });
  }

  next();
}
