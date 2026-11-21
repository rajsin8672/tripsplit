import { auth, isConfigured } from '../config/firebaseAdmin.js';

/**
 * Authentication middleware to verify Firebase ID tokens
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required. Please provide a valid Bearer token in Authorization header.'
        }
      });
    }

    const idToken = authHeader.split('Bearer ')[1]?.trim();

    if (!idToken) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Bearer token is empty or malformed.'
        }
      });
    }

    if (!isConfigured || !auth) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Firebase Admin authentication service is not configured. Please supply Firebase credentials in .env.'
        }
      });
    }

    // Verify token using Firebase Admin SDK
    const decodedToken = await auth.verifyIdToken(idToken);

    // Attach verified user identity to the request object
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      emailVerified: !!decodedToken.email_verified,
      name: decodedToken.name || ''
    };

    next();
  } catch (err) {
    let message = 'Invalid or expired authentication token.';
    let code = 'INVALID_TOKEN';

    if (err.code === 'auth/id-token-expired') {
      message = 'Authentication token has expired. Please refresh your session.';
      code = 'TOKEN_EXPIRED';
    } else if (err.code === 'auth/id-token-revoked') {
      message = 'Authentication token has been revoked. Please sign in again.';
      code = 'TOKEN_REVOKED';
    } else if (err.code === 'auth/argument-error') {
      message = 'Malformed authentication token provided.';
      code = 'MALFORMED_TOKEN';
    }

    return res.status(401).json({
      success: false,
      error: {
        code,
        message
      }
    });
  }
}
