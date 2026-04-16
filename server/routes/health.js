import { Router } from 'express';
import logger from '../utils/logger.js';

const router = Router();

// Liveness probe — independent of DB and external services
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
  });
});

// Readiness probe — checks database connectivity
router.get('/api/health', async (req, res) => {
  let dbStatus = 'ok';
  try {
    const { db } = await import('../database/db.js');
    db.prepare('SELECT 1').get();
  } catch (err) {
    dbStatus = 'error';
    logger.error({ err }, 'Health check: database unreachable');
  }

  const status = dbStatus === 'ok' ? 'ok' : 'degraded';
  const statusCode = dbStatus === 'ok' ? 200 : 503;

  res.status(statusCode).json({
    status,
    database: dbStatus,
  });
});

export default router;
