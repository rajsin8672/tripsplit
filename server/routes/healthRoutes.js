import { Router } from 'express';
import { isConfigured, configError } from '../config/firebaseAdmin.js';

const router = Router();

router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'healthy',
      service: 'tripsplit-api',
      version: '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      firebaseAdminConfigured: isConfigured,
      firebaseStatus: isConfigured ? 'connected' : (configError || 'pending configuration')
    }
  });
});

export default router;
