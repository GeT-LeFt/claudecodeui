import logger from './logger.js';

let server = null;
let shutdownHook = null;

export function setServerInstance(httpServer) {
  server = httpServer;
}

export function setShutdownHook(hook) {
  shutdownHook = hook;
}

async function gracefulShutdown(reason, exitCode = 1) {
  logger.fatal({ reason }, 'Process shutting down');

  try {
    if (shutdownHook) await shutdownHook();
  } catch (err) {
    logger.error({ err }, 'Error during shutdown hook');
  }

  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(exitCode);
    });
    // Force exit after 5s if graceful shutdown hangs
    setTimeout(() => process.exit(exitCode), 5000).unref();
  } else {
    process.exit(exitCode);
  }
}

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  gracefulShutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled rejection');
  gracefulShutdown('unhandledRejection', 1);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM');
  gracefulShutdown('SIGTERM', 0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT');
  gracefulShutdown('SIGINT', 0);
});
