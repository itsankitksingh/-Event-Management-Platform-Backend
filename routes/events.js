const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const auth = require('../middleware/auth');

// Get event by ID
router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('creator', 'username email')
      .populate('attendees', 'username email');
    
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Broadcast to all clients in the event room that someone is viewing
    const viewers = req.app.get('io').sockets.adapter.rooms.get(req.params.id)?.size || 0;
    
    const eventWithViewers = {
      ...event.toObject(),
      currentViewers: viewers
    };

    // Emit to all clients in the room
    req.app.get('io').to(req.params.id).emit('eventUpdated', eventWithViewers);
    
    res.json(eventWithViewers);
  } catch (error) {
    console.error('Error fetching event:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Event not found' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all events
router.get('/', async (req, res) => {
  try {
    const events = await Event.find()
      .populate('creator', 'username')
      .sort({ date: 1 });
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create event
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, date, location, category, capacity, imageUrl } = req.body;
    const event = new Event({
      title,
      description,
      date,
      location,
      category,
      capacity,
      imageUrl,
      creator: req.userId,
      attendees: [req.userId] // Add creator as first attendee
    });
    await event.save();
    
    const populatedEvent = await Event.findById(event._id)
      .populate('creator', 'username email')
      .populate('attendees', 'username email');
    
    // Emit socket event for real-time updates
    req.app.get('io').emit('eventUpdated', populatedEvent);
    
    res.status(201).json(populatedEvent);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update event
router.put('/:id', auth, async (req, res) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, creator: req.userId });
    if (!event) {
      return res.status(404).json({ message: 'Event not found or unauthorized' });
    }

    Object.assign(event, req.body);
    await event.save();
    
    // Emit socket event for real-time updates
    req.app.get('io').to(req.params.id).emit('eventUpdated', event);
    
    res.json(event);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete event
router.delete('/:id', auth, async (req, res) => {
  try {
    const event = await Event.findOneAndDelete({ _id: req.params.id, creator: req.userId });
    if (!event) {
      return res.status(404).json({ message: 'Event not found or unauthorized' });
    }
    
    // Emit socket event for real-time updates
    req.app.get('io').emit('eventDeleted', req.params.id);
    
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Join event
router.post('/:id/join', auth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('creator', 'username email')
      .populate('attendees', 'username email');

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (event.attendees.some(attendee => attendee._id.toString() === req.userId)) {
      return res.status(400).json({ message: 'Already joined this event' });
    }

    if (event.attendees.length >= event.capacity) {
      return res.status(400).json({ message: 'Event is full' });
    }

    event.attendees.push(req.userId);
    await event.save();

    // Get the updated event with populated attendees
    const updatedEvent = await Event.findById(req.params.id)
      .populate('creator', 'username email')
      .populate('attendees', 'username email');
    
    // Emit socket event for real-time updates
    req.app.get('io').to(req.params.id).emit('eventUpdated', updatedEvent);
    
    res.json(updatedEvent);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Add leave event route
router.post('/:id/leave', auth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('creator', 'username email')
      .populate('attendees', 'username email');

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (!event.attendees.some(attendee => attendee._id.toString() === req.userId)) {
      return res.status(400).json({ message: 'Not joined this event' });
    }

    event.attendees = event.attendees.filter(
      attendee => attendee._id.toString() !== req.userId
    );
    await event.save();

    // Get the updated event with populated attendees
    const updatedEvent = await Event.findById(req.params.id)
      .populate('creator', 'username email')
      .populate('attendees', 'username email');
    
    // Emit socket event for real-time updates
    req.app.get('io').to(req.params.id).emit('eventUpdated', updatedEvent);
    
    res.json(updatedEvent);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router; 