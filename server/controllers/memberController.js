import { getTripMembers } from '../services/memberService.js';

export async function handleGetTripMembers(req, res, next) {
  try {
    const { tripId } = req.params;
    const members = await getTripMembers(tripId, req.user.uid);
    return res.status(200).json({
      success: true,
      data: members
    });
  } catch (err) {
    next(err);
  }
}
