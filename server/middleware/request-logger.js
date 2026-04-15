import pinoHttp from 'pino-http';
import logger from '../utils/logger.js';

const EXCLUDED_PATHS = new Set(['/health', '/favicon.ico', '/sw.js']);

const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore(req) {
      return EXCLUDED_PATHS.has(req.url);
    },
  },
  customLogLevel(req, res, err) {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage(req, res) {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage(req, res, err) {
    return `${req.method} ${req.url} ${res.statusCode} - ${err.message}`;
  },
  customProps(req) {
    return {
      userAgent: req.headers['user-agent'],
    };
  },
});

export default requestLogger;
