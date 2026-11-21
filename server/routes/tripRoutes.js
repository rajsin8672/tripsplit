import express from 'express';
import { authenticate } from '../middleware/authenticate.js';
import {
  handleCreateTrip,
  handleGetUserTrips,
  handleGetTripById,
  handleUpdateTrip,
  handleEndTrip,
  handleLeaveTrip
} from '../controllers/tripController.js';
import { handleGetTripMembers } from '../controllers/memberController.js';
import {
  handleCreateInvitation,
  handleGetTripInvitations
} from '../controllers/invitationController.js';
import {
  handleCreateExpense,
  handleGetTripExpenses,
  handleGetExpenseById,
  handleUpdateExpense,
  handleDeleteExpense
} from '../controllers/expenseController.js';
import { handleGetTripBalances } from '../controllers/balanceController.js';
import {
  handleCalculateSettlements,
  handleGetTripSettlements
} from '../controllers/settlementController.js';

const router = express.Router();

router.use(authenticate);

// Trip routes
router.post('/', handleCreateTrip);
router.get('/', handleGetUserTrips);
router.get('/:tripId', handleGetTripById);
router.patch('/:tripId', handleUpdateTrip);
router.post('/:tripId/end', handleEndTrip);
router.post('/:tripId/leave', handleLeaveTrip);

// Member routes
router.get('/:tripId/members', handleGetTripMembers);

// Invitation routes for trip
router.post('/:tripId/invitations', handleCreateInvitation);
router.get('/:tripId/invitations', handleGetTripInvitations);

// Expense routes
router.post('/:tripId/expenses', handleCreateExpense);
router.get('/:tripId/expenses', handleGetTripExpenses);
router.get('/:tripId/expenses/:expenseId', handleGetExpenseById);
router.patch('/:tripId/expenses/:expenseId', handleUpdateExpense);
router.delete('/:tripId/expenses/:expenseId', handleDeleteExpense);

// Balance routes
router.get('/:tripId/balances', handleGetTripBalances);

// Settlement routes
router.post('/:tripId/settlements/calculate', handleCalculateSettlements);
router.get('/:tripId/settlements', handleGetTripSettlements);

export default router;
