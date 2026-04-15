import crypto from 'crypto';
import logger from '../utils/logger.js';

const isProduction = process.env.NODE_ENV === 'production';

export default function errorHandler(err, req, res, _next) {
  const errorId = crypto.randomUUID();

  logger.error(
    {
      errorId,
      err,
      method: req.method,
      url: req.originalUrl,
      statusCode: err.statusCode || err.status || 500,
      userId: req.user?.id,
    },
    `Unhandled error [${errorId}]`
  );

  const statusCode = err.statusCode || err.status || 500;

  res.status(statusCode).json({
    error: {
      message: isProduction && statusCode === 500 ? 'Internal Server Error' : err.message,
      errorId,
      ...(isProduction ? {} : { stack: err.stack }),
    },
  });
}
