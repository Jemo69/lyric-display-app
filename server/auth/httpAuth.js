import { getClientPermissions } from './permissions.js';

export function createRequestAuthenticator({ verifyToken }) {
  return (requiredPermission) => (req, res, next) => {
    try {
      const authHeader = req.get('authorization') || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

      if (!token) {
        return res.status(401).json({ error: 'Authentication token required' });
      }

      const decoded = verifyToken(token);
      if (!decoded) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      const permissions = decoded.permissions || getClientPermissions(decoded.clientType);
      if (requiredPermission && !permissions.includes(requiredPermission) && !permissions.includes('admin:full')) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      req.user = { ...decoded, permissions };
      return next();
    } catch (error) {
      console.error('HTTP authentication error:', error);
      return res.status(401).json({ error: 'Authentication failed' });
    }
  };
}

