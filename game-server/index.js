import { createServer } from 'http';
import { Server } from 'socket.io';
import { randomUUID } from 'crypto';

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// roomId → { players: [socketId, socketId?] }
const rooms = new Map();

io.on('connection', (socket) => {
  socket.on('create_room', () => {
    const roomId = randomUUID().slice(0, 6).toUpperCase();
    rooms.set(roomId, { players: [socket.id] });
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.emit('room_created', { roomId });
  });

  socket.on('join_room', ({ roomId }) => {
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
  });

  socket.on('place_magnet', ({ x, y }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.to(roomId).emit('opponent_placed', { x, y });
  });

  // Authoritative state sync: relay final magnet positions after each turn
  socket.on('sync_state', (data) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.to(roomId).emit('state_sync', data);
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.to(roomId).emit('opponent_disconnected');
    rooms.delete(roomId);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`game-server listening on :${PORT}`);
});
