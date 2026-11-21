import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { getMe, updateMe } from '../controllers/userController.js';

const router = Router();

// Protected user routes
router.get('/me', authenticate, getMe);
router.patch('/me', authenticate, updateMe);

export default router;
