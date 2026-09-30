const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const parseMagnet = require('./parse-magnet');

let WebTorrent;
try {
  WebTorrent = require('webtorrent');
} catch (e) {
  WebTorrent = null;
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Set up storage for uploads
const upload = multer({ dest: path.join(__dirname, 'uploads') });

// Initialize WebTorrent Client
let client;
if (WebTorrent) {
  client = new WebTorrent();
  client.on('error', (err) => {
    console.error('WebTorrent Client Error:', err.message);
  });
}

// Helper to determine mime type & streamability
function getFileInfo(file, index) {
  const ext = path.extname(file.name).toLowerCase();
  const videoExts = ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.m4v', '.ts'];
  const audioExts = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac'];

  let mimeType = 'application/octet-stream';
  let isStreamable = false;

  if (videoExts.includes(ext)) {
    isStreamable = true;
    if (ext === '.mp4') mimeType = 'video/mp4';
    else if (ext === '.webm') mimeType = 'video/webm';
    else if (ext === '.mkv') mimeType = 'video/x-matroska';
    else if (ext === '.avi') mimeType = 'video/x-msvideo';
    else mimeType = 'video/mp4';
  } else if (audioExts.includes(ext)) {
    isStreamable = true;
    if (ext === '.mp3') mimeType = 'audio/mpeg';
    else if (ext === '.wav') mimeType = 'audio/wav';
    else if (ext === '.ogg') mimeType = 'audio/ogg';
    else mimeType = 'audio/mpeg';
  }

  return {
    index,
    name: file.name,
    path: file.path,
    length: file.length,
    mimeType,
    isStreamable
  };
}

// Helper to add or retrieve a torrent
function addTorrent(input) {
  return new Promise((resolve, reject) => {
    if (!client) {
      return reject(new Error('WebTorrent client not initialized'));
    }

    let existing;
    if (typeof input === 'string' && input.startsWith('magnet:')) {
      const parsed = parseMagnet(input);
      if (parsed && parsed.infoHash) {
        existing = client.get(parsed.infoHash);
      }
    } else if (typeof input === 'string') {
      existing = client.get(input);
    }

    if (existing) {
      if (existing.ready) {
        return resolve(existing);
      } else {
        existing.once('ready', () => resolve(existing));
        existing.once('error', reject);
        return;
      }
    }

    const options = { path: path.join(__dirname, 'downloads') };
    client.add(input, options, (torrent) => {
      torrent.on('error', (err) => {
        console.error('Torrent error:', err);
      });
      resolve(torrent);
    });
  });
}

// API: Process magnet or file upload
app.post('/api/torrent', upload.single('torrentFile'), async (req, res) => {
  try {
    let source;
    if (req.file) {
      source = req.file.path;
    } else if (req.body.magnet) {
      source = req.body.magnet.trim();
    } else {
      return res.status(400).json({ error: 'Please provide a magnet link or .torrent file.' });
    }

    const torrent = await addTorrent(source);

    const files = torrent.files.map((file, idx) => getFileInfo(file, idx));

    res.json({
      infoHash: torrent.infoHash,
      name: torrent.name,
      length: torrent.length,
      magnetURI: torrent.magnetURI,
      files
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to process torrent' });
  }
});

// API: Get status/metadata of existing torrent
app.get('/api/torrent/:infoHash', (req, res) => {
  if (!client) {
    return res.status(404).json({ error: 'Torrent not found' });
  }

  const torrent = client.get(req.params.infoHash);
  if (!torrent) {
    return res.status(404).json({ error: 'Torrent not found' });
  }

  const files = torrent.files.map((file, idx) => getFileInfo(file, idx));
  res.json({
    infoHash: torrent.infoHash,
    name: torrent.name,
    length: torrent.length,
    progress: torrent.progress,
    downloadSpeed: torrent.downloadSpeed,
    numPeers: torrent.numPeers,
    files
  });
});

// Streaming endpoint supporting HTTP Range requests
app.get('/api/stream/:infoHash/:fileIndex', (req, res) => {
  if (!client) return res.status(404).json({ error: 'Torrent not found' });

  const torrent = client.get(req.params.infoHash);
  if (!torrent) {
    return res.status(404).json({ error: 'Torrent not found' });
  }

  const fileIndex = parseInt(req.params.fileIndex, 10);
  const file = torrent.files[fileIndex];
  if (!file) {
    return res.status(404).json({ error: 'File not found in torrent' });
  }

  const info = getFileInfo(file, fileIndex);
  const total = file.length;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', info.mimeType);

  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
    const chunksize = (end - start) + 1;

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', chunksize);

    const stream = file.createReadStream({ start, end });
    stream.pipe(res);
  } else {
    res.setHeader('Content-Length', total);
    const stream = file.createReadStream();
    stream.pipe(res);
  }
});

// Direct file download endpoint
app.get('/api/download/:infoHash/:fileIndex', (req, res) => {
  if (!client) return res.status(404).json({ error: 'Torrent not found' });

  const torrent = client.get(req.params.infoHash);
  if (!torrent) {
    return res.status(404).json({ error: 'Torrent not found' });
  }

  const fileIndex = parseInt(req.params.fileIndex, 10);
  const file = torrent.files[fileIndex];
  if (!file) {
    return res.status(404).json({ error: 'File not found in torrent' });
  }

  const filename = path.basename(file.name);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.setHeader('Content-Length', file.length);

  const stream = file.createReadStream();
  stream.pipe(res);
});

// Share page route
app.get('/share/:infoHash/:fileIndex?', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Server listen if executed directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = { app, client, addTorrent, getFileInfo };
