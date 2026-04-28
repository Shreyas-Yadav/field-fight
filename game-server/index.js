import { createServer } from 'http';
import { Server } from 'socket.io';
import { randomUUID } from 'crypto';
import pino from 'pino';

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  base: { service: 'game-server' },
});

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// roomId → { players: [socketId, socketId?] }
const rooms = new Map();

io.on('connection', (socket) => {
  socket.on('create_room', () => {
    try {
      const roomId = randomUUID().slice(0, 6).toUpperCase();
      rooms.set(roomId, { players: [socket.id] });
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.emit('room_created', { roomId });
      logger.info({ roomId, socketId: socket.id }, 'Room created');
    } catch (err) {
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
      logger.error({ err, socketId: socket.id }, 'Error in place_magnet');
    }
  });

  socket.on('sync_state', (data) => {
    try {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      socket.to(roomId).emit('state_sync', data);
    } catch (err) {
      logger.error({ err, socketId: socket.id }, 'Error in sync_state');
    }
  });

  socket.on('disconnect', () => {
    try {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      socket.to(roomId).emit('opponent_disconnected');
      rooms.delete(roomId);
      logger.info({ roomId, socketId: socket.id }, 'Player disconnected');
    } catch (err) {
      logger.error({ err, socketId: socket.id }, 'Error in disconnect');
    }
  });

  socket.on('error', (err) => {
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
