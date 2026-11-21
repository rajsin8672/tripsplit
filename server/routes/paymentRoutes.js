import express from 'express';
import { authenticate } from '../middleware/authenticate.js';
import {
  handleGetUserPayments,
  handleConfirmPayment,
  handleRejectPayment
} from '../controllers/paymentController.js';

const router = express.Router();

router.use(authenticate);

router.get('/', handleGetUserPayments);
router.post('/:paymentId/confirm', handleConfirmPayment);
router.post('/:paymentId/reject', handleRejectPayment);

export default router;
