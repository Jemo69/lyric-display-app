export function registerConnectionRoutes(app, { authenticateRequest }) {
  app.get('/api/connection/clients', authenticateRequest('lyrics:read'), (req, res) => {
    try {
      const connectedClientsData = global.getConnectedClients ? global.getConnectedClients() : [];

      res.json({
        success: true,
        clients: connectedClientsData,
        totalCount: connectedClientsData.length,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error fetching connected clients:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch connected clients'
      });
    }
  });
}

