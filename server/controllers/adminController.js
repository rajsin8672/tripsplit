/**
 * TripSplit — Admin Controller
 * Handles administrative requests for metrics, user inspection, and trip management.
 */

import {
  getAdminStats,
  getAdminUsers,
  getAdminTrips,
  adminEndTrip
} from '../services/adminService.js';

export async function handleCheckAdmin(req, res) {
  return res.status(200).json({
    success: true,
    data: {
      isAdmin: true,
      email: req.user.email
    }
  });
}

export async function handleGetAdminStats(req, res, next) {
  try {
    const stats = await getAdminStats();
    return res.status(200).json({
      success: true,
      data: stats
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetAdminUsers(req, res, next) {
  try {
    const users = await getAdminUsers();
    return res.status(200).json({
      success: true,
      data: users
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetAdminTrips(req, res, next) {
  try {
    const trips = await getAdminTrips();
    return res.status(200).json({
      success: true,
      data: trips
    });
  } catch (err) {
    next(err);
  }
}

export async function handleAdminEndTrip(req, res, next) {
  try {
    const { tripId } = req.params;
    const result = await adminEndTrip(tripId);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
}
