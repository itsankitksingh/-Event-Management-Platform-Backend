require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');

const app = express();
const server = http.createServer(app);

// Store io instance in app for access in routes
const io = socketIO(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

app.set('io', io); // Make io accessible in routes

// Middleware
app.use(cors());
app.use(express.json());

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something broke!', error: err.message });
});

// Database connection with retry logic
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

connectDB();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('joinEvent', (eventId) => {
    console.log(`Socket ${socket.id} joining event room: ${eventId}`);
    socket.join(eventId);
    
    // Get updated viewer count
    const viewers = io.sockets.adapter.rooms.get(eventId)?.size || 0;
    
    // Emit updated viewer count to all clients in the room
    io.to(eventId).emit('viewerUpdate', {
      eventId,
      viewers,
      timestamp: new Date()
    });
  });

  socket.on('leaveEvent', (eventId) => {
    console.log(`Socket ${socket.id} leaving event room: ${eventId}`);
    socket.leave(eventId);
    
    // Get updated viewer count after leaving
    const viewers = io.sockets.adapter.rooms.get(eventId)?.size || 0;
    
    // Emit updated viewer count to remaining clients
    io.to(eventId).emit('viewerUpdate', {
      eventId,
      viewers,
      timestamp: new Date()
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 