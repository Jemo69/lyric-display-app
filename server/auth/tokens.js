import jwt from 'jsonwebtoken';
import { isControllerClient } from '../config/clientTypes.js';

export function createTokenService({ secrets, jwtSecret, tokenExpiry, adminTokenExpiry }) {
  const generateToken = (payload, expiresIn = tokenExpiry) => {
    return jwt.sign(payload, jwtSecret, { expiresIn });
  };

  const verifyToken = (token) => {
    const decode = (secret) => {
      try {
        return jwt.verify(token, secret);
      } catch (error) {
        return null;
      }
    };

    let decoded = decode(jwtSecret);

    if (!decoded && secrets.previousSecret && secrets.previousSecretExpiry) {
      const graceExpiry = new Date(secrets.previousSecretExpiry);
      if (new Date() < graceExpiry) {
        decoded = decode(secrets.previousSecret);
      }
    }

    if (!decoded) {
      return null;
    }

    if (isControllerClient(decoded.clientType)) {
      if (decoded.joinCode !== global.controllerJoinCode) {
        return null;
      }
    }

    return decoded;
  };

  const getExpiryForClient = (clientType) => clientType === 'desktop' ? adminTokenExpiry : tokenExpiry;

  return {
    generateToken,
    verifyToken,
    getExpiryForClient,
  };
}

