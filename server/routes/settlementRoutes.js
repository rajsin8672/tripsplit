import express from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { handleSubmitPayment } from '../controllers/paymentController.js';

const router = express.Router();

router.use(authenticate);

// Submit payment claim for a specific settlement
router.post('/:settlementId/payments', handleSubmitPayment);

export default router;
