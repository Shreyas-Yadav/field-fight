import { createServer } from 'http';
import { Server } from 'socket.io';
import { randomUUID } from 'crypto';
import pino from 'pino';
import client from 'prom-client';

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  base: { service: 'game-server' },
});

// ── Metrics ───────────────────────────────────────────────────────────────────

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const gameRoomsActive = new client.Gauge({
  name: 'game_rooms_active',
  help: 'Number of active game rooms currently in the Map',
  registers: [register],
});

const gameRoomsCreatedTotal = new client.Counter({
  name: 'game_rooms_created_total',
  help: 'Total game rooms ever created',
  registers: [register],
});

const gamePlayersConnectedTotal = new client.Counter({
  name: 'game_players_connected_total',
  help: 'Total socket connections ever made',
  registers: [register],
});

const gameSocketErrorsTotal = new client.Counter({
  name: 'game_socket_errors_total',
  help: 'Total errors caught in socket event handlers',
  registers: [register],
});

const gameRoomLifetimeSeconds = new client.Histogram({
  name: 'game_room_lifetime_seconds',
  help: 'How long a game room lived from creation to teardown',
  buckets: [5, 15, 30, 60, 120, 300, 600],
  registers: [register],
});

let io; // declared before rooms so collect() closure can reference io

const gamePlayersOnline = new client.Gauge({
  name: 'game_players_online',
  help: 'Currently connected players',
  registers: [register],
  collect() {
    this.set(io?.engine?.clientsCount ?? 0);
  },
});

// roomId → { players: [socketId, socketId?], createdAt: timestamp }
const rooms = new Map();

// Register the /metrics handler BEFORE constructing new Server()
const httpServer = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/metrics') {
    register.metrics().then((data) => {
      res.writeHead(200, { 'Content-Type': register.contentType });
      res.end(data);
    }).catch((err) => {
      res.writeHead(500);
      res.end(String(err));
    });
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

io.on('connection', (socket) => {
  gamePlayersConnectedTotal.inc();

  socket.on('create_room', () => {
    try {
      const roomId = randomUUID().slice(0, 6).toUpperCase();
      const createdAt = Date.now();
      rooms.set(roomId, { players: [socket.id], createdAt });
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.emit('room_created', { roomId });
      gameRoomsCreatedTotal.inc();
      gameRoomsActive.set(rooms.size);
      logger.info({ roomId, socketId: socket.id }, 'Room created');
    } catch (err) {
      gameSocketErrorsTotal.inc();
      logger.error({ err, socketId: socket.id }, 'Error in create_room');
    }
  });

  socket.on('join_room', ({ roomId }) => {
    try {
      const room = rooms.get(roomId);
      if (!room) {
        socket.emit('join_error', { message: 'Room not found' });
        return;
      }
      if (room.players.length >= 2) {
        socket.emit('join_error', { message: 'Room is full' });
        return;
      }
      room.players.push(socket.id);
      socket.join(roomId);
      socket.data.roomId = roomId;

      const [p0, p1] = room.players;
      io.to(p0).emit('game_start', { playerIndex: 0 });
      io.to(p1).emit('game_start', { playerIndex: 1 });
      logger.info({ roomId, socketId: socket.id }, 'Player joined room');
    } catch (err) {
      logger.error({ err, socketId: socket.id }, 'Error in join_room');
    }
  });

  socket.on('place_magnet', ({ x, y }) => {
    try {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      socket.to(roomId).emit('opponent_placed', { x, y });
    } catch (err) {
      gameSocketErrorsTotal.inc();
      logger.error({ err, socketId: socket.id }, 'Error in place_magnet');
    }
  });

  socket.on('sync_state', (data) => {
    try {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      socket.to(roomId).emit('state_sync', data);
    } catch (err) {
      gameSocketErrorsTotal.inc();
      logger.error({ err, socketId: socket.id }, 'Error in sync_state');
    }
  });

  socket.on('disconnect', () => {
    try {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      socket.to(roomId).emit('opponent_disconnected');
      const room = rooms.get(roomId);
      if (room && room.createdAt) {
        const lifetimeSeconds = (Date.now() - room.createdAt) / 1000;
        gameRoomLifetimeSeconds.observe(lifetimeSeconds);
      }
      rooms.delete(roomId);
      gameRoomsActive.set(rooms.size);
      logger.info({ roomId, socketId: socket.id }, 'Player disconnected');
    } catch (err) {
      gameSocketErrorsTotal.inc();
      logger.error({ err, socketId: socket.id }, 'Error in disconnect');
    }
  });

  socket.on('error', (err) => {
    gameSocketErrorsTotal.inc();
    logger.error({ err, socketId: socket.id, roomId: socket.data.roomId }, 'Socket error');
  });
});

io.engine.on('connection_error', (err) => {
  logger.error({ err }, 'Engine connection error');
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  logger.info({ port: PORT }, 'game-server ready');
});
