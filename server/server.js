import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import healthRoutes from './routes/healthRoutes.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import tripRoutes from './routes/tripRoutes.js';
import invitationRoutes from './routes/invitationRoutes.js';
import settlementRoutes from './routes/settlementRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://www.gstatic.com',
          'https://apis.google.com'
        ],
        connectSrc: [
          "'self'",
          'https://identitytoolkit.googleapis.com',
          'https://securetoken.googleapis.com',
          'https://firestore.googleapis.com',
          'https://*.googleapis.com',
          'https://*.firebaseio.com',
          'wss://*.firebaseio.com'
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com'
        ],
        fontSrc: [
          "'self'",
          'https://fonts.gstatic.com'
        ],
        imgSrc: ["'self'", 'data:', 'blob:'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

// Standard CORS and body parsing
app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// API request logger for development visibility
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api')) {
      console.log(`[API] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`);
    }
  });
  next();
});

// Rate limiting for auth and API endpoints (relaxed in development)
const isDev = process.env.NODE_ENV !== 'production';
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 10000 : 150, // Relaxed in dev to prevent 429
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests from this IP, please try again after 15 minutes.'
    }
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 5000 : 30, // Relaxed in dev
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many authentication attempts, please try again later.'
    }
  }
});

app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);

// Public Firebase client configuration endpoint
// Never expose server admin credentials or private keys
app.get('/api/config/firebase', (req, res) => {
  const config = {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || ''
  };

  const isConfigured = Boolean(config.apiKey && config.projectId);

  res.status(200).json({
    success: true,
    data: {
      isConfigured,
      config
    }
  });
});

// Mount API routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/settlements', settlementRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);

// Serve static frontend files
app.use(express.static(publicDir, {
  extensions: ['html'],
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : '0',
  setHeaders: (res) => {
    if (process.env.NODE_ENV !== 'production') {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    }
  }
}));

// API 404 handler
app.all('/api/*', notFoundHandler);

// Clean URL / fallback handler for frontend pages
app.get('*', (req, res) => {
  res.status(404).sendFile(path.join(publicDir, '404.html'), (err) => {
    if (err) {
      res.status(404).send('Page not found');
    }
  });
});

// Centralized error handler
app.use(errorHandler);

// Only listen if executed directly as main script and not imported into tests
let serverInstance = null;
const isMainScript = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMainScript && process.env.NODE_ENV !== 'test') {
  serverInstance = app.listen(PORT, HOST, () => {
    console.log(`[TripSplit] Server running in ${process.env.NODE_ENV || 'development'} mode`);
    console.log(`[TripSplit] Local URL: http://localhost:${PORT}`);
  });

  serverInstance.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[TripSplit Error] Port ${PORT} is already in use by another process.`);
      console.error(`Please terminate the process using port ${PORT} or specify a different PORT environment variable (e.g. PORT=3002 npm start).`);
    } else {
      console.error('[TripSplit Server Error]', err);
    }
    process.exit(1);
  });
}

// Graceful shutdown
const shutdown = () => {
  console.log('\n[TripSplit] Gracefully shutting down...');
  if (serverInstance) {
    serverInstance.close(() => {
      console.log('[TripSplit] Server closed.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
