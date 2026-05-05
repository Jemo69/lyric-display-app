import { getJoinCodeGuardSnapshot } from '../auth/joinCodeGuard.js';

export function registerHealthRoutes(app, {
  io,
  port,
  secretManager,
  startupSecretRotation,
  tokenRateLimit,
}) {
  const isDev = process.env.NODE_ENV === 'development';

  app.get('/api/health', async (req, res) => {
    const secretsStatus = await secretManager.getSecretsStatus();
    const joinCodeMetrics = getJoinCodeGuardSnapshot();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: isDev ? 'development' : 'production',
      security: {
        secretsLoaded: secretsStatus.exists,
        daysSinceRotation: secretsStatus.daysSinceRotation,
        needsRotation: secretsStatus.needsRotation,
        autoRotatedAtStartup: startupSecretRotation.rotated,
        joinCodeGuard: joinCodeMetrics,
      }
    });
  });

  app.get('/api/health/ready', async (req, res) => {
    try {
      const secretsStatus = await secretManager.getSecretsStatus();
      const checks = {
        serverListening: true,
        secretsLoaded: !!secretsStatus?.exists,
        joinCodeGenerated: !!global.controllerJoinCode,
        socketIOReady: !!(io && io.engine),
        rateLimiterActive: !!tokenRateLimit,
      };

      const allChecksPass = Object.values(checks).every(check => check === true);

      if (allChecksPass) {
        res.json({
          status: 'ready',
          serverListening: true,
          timestamp: new Date().toISOString(),
          checks,
          uptime: process.uptime(),
          port,
          autoRotatedSecretsAtStartup: startupSecretRotation.rotated,
          secretsStatus,
        });
      } else {
        res.status(503).json({
          status: 'not_ready',
          serverListening: true,
          timestamp: new Date().toISOString(),
          checks,
          failedChecks: Object.entries(checks)
            .filter(([_, passed]) => !passed)
            .map(([check]) => check),
          secretsStatus,
        });
      }
    } catch (error) {
      console.error('Health ready check error:', error);
      res.status(503).json({
        status: 'error',
        serverListening: true,
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  });
}
