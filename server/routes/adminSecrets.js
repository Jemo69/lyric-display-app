export function registerAdminSecretRoutes(app, { localhostOnly, secretManager }) {
  app.get('/api/admin/secrets/status', localhostOnly, async (req, res) => {
    const status = await secretManager.getSecretsStatus();
    res.json(status);
  });

  app.post('/api/admin/secrets/rotate', localhostOnly, async (req, res) => {
    try {
      const newSecrets = await secretManager.rotateJWTSecret();
      const status = await secretManager.getSecretsStatus();
      res.json({
        success: true,
        message: 'JWT secret rotated successfully. Server restart required.',
        lastRotated: newSecrets.lastRotated,
        status
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
}

