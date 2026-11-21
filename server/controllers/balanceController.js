import { getTripBalances } from '../services/balanceService.js';

export async function handleGetTripBalances(req, res, next) {
  try {
    const { tripId } = req.params;
    const balances = await getTripBalances(tripId, req.user.uid);
    return res.status(200).json({
      success: true,
      data: balances
    });
  } catch (err) {
    next(err);
  }
}
