import { syncUserProfile } from '../services/userService.js';

export async function syncAuth(req, res, next) {
  try {
    const { displayName } = req.body || {};
    const profile = await syncUserProfile(req.user, { displayName });

    return res.status(200).json({
      success: true,
      data: profile
    });
  } catch (err) {
    next(err);
  }
}
