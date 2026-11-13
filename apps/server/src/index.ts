import { createServer } from 'node:http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@dya/shared';

const port = Number(process.env.PORT ?? 3001);

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404).end();
});

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);

io.on('connection', (socket) => {
  console.log(`[socket] conectado ${socket.id}`);
  socket.on('disconnect', (reason) => {
    console.log(`[socket] desconectado ${socket.id} (${reason})`);
  });
});

httpServer.listen(port, () => {
  console.log(`[server] escuchando en http://localhost:${port}`);
});
