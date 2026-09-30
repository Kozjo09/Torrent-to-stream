const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { app, getFileInfo } = require('../server');

let server;
let baseUrl;

test.before(() => {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

test.after(() => {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
});

test('getFileInfo correctly classifies video and audio files', () => {
  const mp4File = { name: 'movie.mp4', path: 'movie.mp4', length: 1000000 };
  const mp4Info = getFileInfo(mp4File, 0);
  assert.strictEqual(mp4Info.mimeType, 'video/mp4');
  assert.strictEqual(mp4Info.isStreamable, true);

  const txtFile = { name: 'read.txt', path: 'read.txt', length: 500 };
  const txtInfo = getFileInfo(txtFile, 1);
  assert.strictEqual(txtInfo.mimeType, 'application/octet-stream');
  assert.strictEqual(txtInfo.isStreamable, false);
});

test('POST /api/torrent without magnet or file returns 400', async () => {
  const res = await fetch(`${baseUrl}/api/torrent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.strictEqual(res.status, 400);
  const json = await res.json();
  assert.strictEqual(json.error, 'Please provide a magnet link or .torrent file.');
});

test('GET /api/torrent/:infoHash returns 404 for non-existent torrent', async () => {
  const res = await fetch(`${baseUrl}/api/torrent/0000000000000000000000000000000000000000`);
  assert.strictEqual(res.status, 404);
});

test('GET /share/:infoHash returns 200 HTML page', async () => {
  const res = await fetch(`${baseUrl}/share/08ada5a7a6183aae1e09d831df6748d566095a10/0`);
  assert.strictEqual(res.status, 200);
  const text = await res.text();
  assert.ok(text.includes('<!DOCTYPE html>'));
});
