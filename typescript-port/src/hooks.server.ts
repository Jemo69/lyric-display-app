import type { Handle } from '@sveltejs/kit';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let io: Server | null = null;

function getSocketServer() {
  if (io) return io;

  // Socket.io server will be initialized when the HTTP server starts
  // This is handled in the server initialization
  return null;
}

export function setSocketServer(server: Server) {
  io = server;
}

export function getIO() {
  return io;
}

export const handle: Handle = async ({ event, resolve }) => {
  // Add socket.io instance to event locals
  event.locals.io = getIO();
  return resolve(event);
};
