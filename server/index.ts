import { createGameServer } from './create-server.js';

const port = Number(process.env.PORT ?? 3001);
const { httpServer, io } = createGameServer();

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`数字牌局服务已启动：http://localhost:${port}`);
});

function shutdown(): void {
  io.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
