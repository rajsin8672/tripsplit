import {
  createTrip,
  getUserTrips,
  getTripById,
  updateTrip,
  endTrip,
  leaveTrip
} from '../services/tripService.js';

export async function handleCreateTrip(req, res, next) {
  try {
    const { name, destination, startDate, endDate, currency, description } = req.body || {};
    const trip = await createTrip(req.user.uid, {
      name,
      destination,
      startDate,
      endDate,
      currency,
      description
    });
    return res.status(201).json({
      success: true,
      data: trip
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetUserTrips(req, res, next) {
  try {
    const { status, q } = req.query;
    const trips = await getUserTrips(req.user.uid, { status, query: q });
    return res.status(200).json({
      success: true,
      data: trips
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetTripById(req, res, next) {
  try {
    const { tripId } = req.params;
    const trip = await getTripById(tripId, req.user.uid);
    return res.status(200).json({
      success: true,
      data: trip
    });
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateTrip(req, res, next) {
  try {
    const { tripId } = req.params;
    const updated = await updateTrip(tripId, req.user.uid, req.body || {});
    return res.status(200).json({
      success: true,
      data: updated
    });
  } catch (err) {
    next(err);
  }
}

export async function handleEndTrip(req, res, next) {
  try {
    const { tripId } = req.params;
    const ended = await endTrip(tripId, req.user.uid);
    return res.status(200).json({
      success: true,
      data: ended
    });
  } catch (err) {
    next(err);
  }
}

export async function handleLeaveTrip(req, res, next) {
  try {
    const { tripId } = req.params;
    const result = await leaveTrip(tripId, req.user.uid);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
}
