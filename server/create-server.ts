import { createServer as createHttpServer } from 'node:http';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../shared/types.js';
import { GameService, type GameServiceOptions, withAck } from './game-service.js';

export function createGameServer(options: GameServiceOptions = {}) {
  const app = express();
  const clientOrigin = process.env.CLIENT_ORIGIN;
  app.disable('x-powered-by');
  app.use(cors({ origin: clientOrigin || true, credentials: true }));
  app.use(express.json({ limit: '32kb' }));
  app.get('/api/health', (_request, response) => {
    response.json({ ok: true, service: '数字牌局' });
  });

  const httpServer = createHttpServer(app);
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, {
    cors: { origin: clientOrigin || true, credentials: true },
    transports: ['websocket', 'polling'],
    pingTimeout: 30_000,
    pingInterval: 20_000,
  });
  const service = new GameService(io, options);

  io.on('connection', (socket) => {
    socket.on('room:create', (payload, ack) => {
      withAck(socket, ack, () => service.createRoom(socket, payload.nickname, payload.mode));
    });
    socket.on('room:join', (payload, ack) => {
      withAck(socket, ack, () => service.joinRoom(socket, payload));
    });
    socket.on('room:sync', (payload, ack) => {
      withAck(socket, ack, () => service.syncRoom(socket, payload));
    });
    socket.on('game:start', (ack) => withAck(socket, ack, () => service.startGame(socket)));
    socket.on('game:draw', (ack) => withAck(socket, ack, () => service.drawTile(socket)));
    socket.on('game:submit', (payload, ack) =>
      withAck(socket, ack, () => service.submitTurn(socket, payload)),
    );
    socket.on('game:rematch', (ack) => withAck(socket, ack, () => service.rematch(socket)));
    socket.on('game:returnLobby', (ack) =>
      withAck(socket, ack, () => service.returnToLobby(socket)),
    );
    socket.on('disconnect', () => service.disconnect(socket));
  });

  const webRoot = path.resolve(process.cwd(), 'dist');
  app.use(express.static(webRoot));
  app.get('*', (request, response, next) => {
    if (request.path.startsWith('/api/') || request.path.startsWith('/socket.io/')) {
      next();
      return;
    }
    response.sendFile(path.join(webRoot, 'index.html'), (error) => {
      if (error) next(error);
    });
  });

  return { app, httpServer, io, service };
}
