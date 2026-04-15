import logger from './logger.js';

let server = null;

export function setServerInstance(httpServer) {
  server = httpServer;
}

function gracefulShutdown(reason) {
  logger.fatal({ reason }, 'Process shutting down');

  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(1);
    });
    // Force exit after 5s if graceful shutdown hangs
    setTimeout(() => process.exit(1), 5000).unref();
  } else {
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled rejection');
  gracefulShutdown('unhandledRejection');
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM');
  gracefulShutdown('SIGTERM');
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT');
  gracefulShutdown('SIGINT');
});
