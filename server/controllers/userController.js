import { getUserProfile, updateUserProfile, syncUserProfile } from '../services/userService.js';

export async function getMe(req, res, next) {
  try {
    let profile = await getUserProfile(req.user.uid);

    // If profile does not exist yet in Firestore, sync it automatically from verified auth identity
    if (!profile) {
      profile = await syncUserProfile(req.user);
    }

    return res.status(200).json({
      success: true,
      data: profile
    });
  } catch (err) {
    next(err);
  }
}

export async function updateMe(req, res, next) {
  try {
    const { displayName, upiId } = req.body || {};

    // Explicitly reject illegal attempts to modify immutable fields
    if (req.body.uid !== undefined || req.body.userCode !== undefined || req.body.email !== undefined) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ILLEGAL_FIELD_UPDATE',
          message: 'Modification of uid, userCode, or email is strictly prohibited.'
        }
      });
    }

    if (displayName === undefined && upiId === undefined) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_UPDATES_PROVIDED',
          message: 'At least one field (displayName or upiId) must be provided for update.'
        }
      });
    }

    const updatedProfile = await updateUserProfile(req.user.uid, { displayName, upiId });

    return res.status(200).json({
      success: true,
      data: updatedProfile
    });
  } catch (err) {
    next(err);
  }
}
