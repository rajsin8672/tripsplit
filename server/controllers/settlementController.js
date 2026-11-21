import {
  calculateAndSaveSettlements,
  getTripSettlements
} from '../services/settlementService.js';

export async function handleCalculateSettlements(req, res, next) {
  try {
    const { tripId } = req.params;
    const settlements = await calculateAndSaveSettlements(tripId, req.user.uid);
    return res.status(200).json({
      success: true,
      data: settlements
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetTripSettlements(req, res, next) {
  try {
    const { tripId } = req.params;
    const settlements = await getTripSettlements(tripId, req.user.uid);
    return res.status(200).json({
      success: true,
      data: settlements
    });
  } catch (err) {
    next(err);
  }
}
