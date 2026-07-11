export function registerOutputRoutes(app, { getOutputRegistry, hasOutput }) {
  app.get('/api/outputs', (_req, res) => {
    res.json({ success: true, ...getOutputRegistry() });
  });

  app.get('/api/outputs/:outputId', (req, res) => {
    const outputId = req.params.outputId;
    const exists = hasOutput(outputId);
    res.json({ success: true, output: outputId, exists });
  });
}

