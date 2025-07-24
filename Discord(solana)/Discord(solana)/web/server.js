const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path'); // Added for serving static files

function startWebServer() {
  const app = express();
  app.use(cors());
  app.use(bodyParser.json());
  app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));

  // Simple request logger
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  app.get('/phantom/connect', (req, res) => {
    try {
      res.sendFile(path.join(__dirname, 'public', 'connect.html'));
    } catch (err) {
      console.error('Error serving connect.html:', err);
      res.status(500).send('Internal server error');
    }
  });

  // Serve the send.html page
  app.get('/phantom/send', (req, res) => {
    try {
      res.sendFile(path.join(__dirname, 'public', 'send.html'));
    } catch (err) {
      console.error('Error serving send.html:', err);
      res.status(500).send('Internal server error');
    }
  });

  // Provide bundle data for a session
  app.get('/phantom/send/session', (req, res) => {
    const { session } = req.query;
    if (!session || !global.sendSessions || !global.sendSessions[session]) {
      console.warn('Session not found:', session);
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(global.sendSessions[session]);
  });

  // Helper to save sessions if available
  function saveSessions() {
    try {
      if (global.sendSessions) {
        fs.writeFileSync(path.join(__dirname, '..', 'sessions.json'), JSON.stringify(global.sendSessions, null, 2));
      }
    } catch (err) {
      console.error('Failed to save sessions.json:', err);
    }
  }

  // Receive transaction signatures for a session
  app.post('/phantom/send/signed', (req, res) => {
    const { session, signatures } = req.body;
    if (!session || !Array.isArray(signatures) || !global.sendSessions || !global.sendSessions[session]) {
      console.warn('Invalid session or signatures:', { session, signatures });
      return res.status(400).json({ error: 'Invalid session or signatures' });
    }
    // Store signatures in the session
    if (typeof global.sendSessions[session] === 'object' && !Array.isArray(global.sendSessions[session])) {
      global.sendSessions[session].signatures = signatures;
    } else {
      // If the session is just the bundle array, convert to object
      global.sendSessions[session] = { bundle: global.sendSessions[session], signatures };
    }
    saveSessions();
    res.json({ success: true });
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Web server listening on port ${port}`);
  });
}

module.exports = startWebServer; 