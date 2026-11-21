/**
 * TripSplit — Admin Routes
 * Protected endpoints restricted to authorized administrators.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import {
  handleCheckAdmin,
  handleGetAdminStats,
  handleGetAdminUsers,
  handleGetAdminTrips,
  handleAdminEndTrip
} from '../controllers/adminController.js';

const router = Router();

// Enforce both JWT authentication and Administrator authorization
router.use(authenticate);
router.use(requireAdmin);

router.get('/check', handleCheckAdmin);
router.get('/stats', handleGetAdminStats);
router.get('/users', handleGetAdminUsers);
router.get('/trips', handleGetAdminTrips);
router.post('/trips/:tripId/end', handleAdminEndTrip);

export default router;
