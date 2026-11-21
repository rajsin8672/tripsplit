import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { syncAuth } from '../controllers/authController.js';

const router = Router();

// Protected sync endpoint
router.post('/sync', authenticate, syncAuth);

export default router;
