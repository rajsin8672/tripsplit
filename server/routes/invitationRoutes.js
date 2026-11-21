import express from 'express';
import { authenticate } from '../middleware/authenticate.js';
import {
  handleGetUserInvitations,
  handleAcceptInvitation,
  handleRejectInvitation,
  handleCancelInvitation
} from '../controllers/invitationController.js';

const router = express.Router();

router.use(authenticate);

router.get('/', handleGetUserInvitations);
router.post('/:invitationId/accept', handleAcceptInvitation);
router.post('/:invitationId/reject', handleRejectInvitation);
router.post('/:invitationId/cancel', handleCancelInvitation);

export default router;
