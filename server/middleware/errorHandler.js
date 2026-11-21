/**
 * Centralized error handler middleware
 */
export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || err.statusCode || 500;
  const code = err.code || (status === 404 ? 'NOT_FOUND' : status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : status === 400 ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR');
  const message = err.expose || status < 500 ? err.message : 'An unexpected error occurred. Please try again later.';

  // In development, log the error for diagnostics, but never print sensitive variables
  if (process.env.NODE_ENV !== 'production' && status >= 500) {
    console.error(`[Error] ${req.method} ${req.originalUrl}:`, err);
  }

  res.status(status).json({
    success: false,
    error: {
      code,
      message
    }
  });
}

/**
 * 404 Not Found handler for API routes
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist.`
    }
  });
}
