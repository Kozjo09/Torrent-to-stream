document.addEventListener('DOMContentLoaded', () => {
  const magnetForm = document.getElementById('magnet-form');
  const magnetInput = document.getElementById('magnet-input');
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const demoBtn = document.getElementById('demo-btn');

  const mediaSection = document.getElementById('media-section');
  const torrentTitle = document.getElementById('torrent-title');
  const statPeers = document.getElementById('stat-peers');
  const statSpeed = document.getElementById('stat-speed');
  const statProgress = document.getElementById('stat-progress');

  const playerContainer = document.getElementById('player-container');
  const videoPlayer = document.getElementById('video-player');
  const copyStreamBtn = document.getElementById('copy-stream-btn');
  const shareBtn = document.getElementById('share-btn');
  const fileList = document.getElementById('file-list');

  const shareModal = document.getElementById('share-modal');
  const modalClose = document.querySelector('.modal-close');
  const shareUrlInput = document.getElementById('share-url-input');
  const modalCopyBtn = document.getElementById('modal-copy-btn');

  let currentTorrent = null;
  let activeFileIndex = null;
  let statsInterval = null;
  let clientWebTorrent = null;

  const DEMO_MAGNET = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel";

  if (window.WebTorrent && WebTorrent.WEBRTC_SUPPORT) {
    clientWebTorrent = new WebTorrent();
  }

  // Check if URL path has /share/:infoHash/:fileIndex
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  if (pathParts[0] === 'share' && pathParts[1]) {
    const infoHash = pathParts[1];
    const fileIdx = pathParts[2] ? parseInt(pathParts[2], 10) : 0;
    fetchTorrentByInfoHash(infoHash, fileIdx);
  }

  // Event Listeners
  magnetForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const magnet = magnetInput.value.trim();
    if (magnet) {
      processMagnet(magnet);
    }
  });

  demoBtn.addEventListener('click', () => {
    magnetInput.value = DEMO_MAGNET;
    processMagnet(DEMO_MAGNET);
  });

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = '#e84393';
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = '#263352';
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = '#263352';
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      uploadFile(fileInput.files[0]);
    }
  });

  modalClose.addEventListener('click', () => {
    shareModal.classList.add('hidden');
  });

  modalCopyBtn.addEventListener('click', () => {
    shareUrlInput.select();
    navigator.clipboard.writeText(shareUrlInput.value);
    modalCopyBtn.textContent = 'Copied!';
    setTimeout(() => { modalCopyBtn.textContent = 'Copy'; }, 2000);
  });

  copyStreamBtn.addEventListener('click', () => {
    if (currentTorrent && activeFileIndex !== null) {
      const streamUrl = `${window.location.origin}/api/stream/${currentTorrent.infoHash}/${activeFileIndex}`;
      navigator.clipboard.writeText(streamUrl);
      copyStreamBtn.textContent = 'Copied Stream Link!';
      setTimeout(() => { copyStreamBtn.textContent = 'Copy Video Stream Link'; }, 2000);
    }
  });

  shareBtn.addEventListener('click', () => {
    if (currentTorrent && activeFileIndex !== null) {
      const shareUrl = `${window.location.origin}/share/${currentTorrent.infoHash}/${activeFileIndex}`;
      openShareModal(shareUrl);
    }
  });

  function processMagnet(magnet) {
    showLoading();
    fetch('/api/torrent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ magnet })
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        renderTorrent(data);
      })
      .catch(err => {
        if (clientWebTorrent) {
          processMagnetClientSide(magnet);
        } else {
          alert('Error: ' + err.message);
        }
      });
  }

  function processMagnetClientSide(magnet) {
    clientWebTorrent.add(magnet, (torrent) => {
      const files = torrent.files.map((file, idx) => ({
        index: idx,
        name: file.name,
        path: file.path,
        length: file.length,
        mimeType: 'video/mp4',
        isStreamable: true,
        _clientFile: file
      }));

      const data = {
        infoHash: torrent.infoHash,
        name: torrent.name,
        length: torrent.length,
        files
      };

      renderTorrent(data);
    });
  }

  function uploadFile(file) {
    showLoading();
    const formData = new FormData();
    formData.append('torrentFile', file);

    fetch('/api/torrent', {
      method: 'POST',
      body: formData
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        renderTorrent(data);
      })
      .catch(err => {
        if (clientWebTorrent) {
          clientWebTorrent.add(file, (torrent) => {
            const files = torrent.files.map((f, idx) => ({
              index: idx,
              name: f.name,
              path: f.path,
              length: f.length,
              mimeType: 'video/mp4',
              isStreamable: true,
              _clientFile: f
            }));
            renderTorrent({
              infoHash: torrent.infoHash,
              name: torrent.name,
              length: torrent.length,
              files
            });
          });
        } else {
          alert('Error: ' + err.message);
        }
      });
  }

  function fetchTorrentByInfoHash(infoHash, targetFileIdx = 0) {
    showLoading();
    fetch(`/api/torrent/${infoHash}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        renderTorrent(data, targetFileIdx);
      })
      .catch(err => {
        if (clientWebTorrent) {
          processMagnetClientSide(`magnet:?xt=urn:btih:${infoHash}`);
        } else {
          alert('Error fetching torrent: ' + err.message);
        }
      });
  }

  function renderTorrent(data, targetFileIdx = null) {
    currentTorrent = data;
    torrentTitle.textContent = data.name || 'Unnamed Torrent';
    mediaSection.classList.remove('hidden');

    if (statsInterval) clearInterval(statsInterval);
    statsInterval = setInterval(() => updateStats(data.infoHash), 2000);

    fileList.innerHTML = '';
    data.files.forEach((file, index) => {
      const li = document.createElement('li');
      li.className = 'file-item';

      const fileInfo = document.createElement('div');
      fileInfo.className = 'file-info';
      fileInfo.innerHTML = `
        <span class="file-name">${file.name}</span>
        <span class="file-size">(${formatBytes(file.length)})</span>
      `;

      const actions = document.createElement('div');
      actions.className = 'file-actions';

      if (file.isStreamable) {
        const streamBtn = document.createElement('button');
        streamBtn.className = 'btn-primary btn-xs';
        streamBtn.textContent = 'Stream';
        streamBtn.onclick = () => playFile(index, file);
        actions.appendChild(streamBtn);
      }

      const downloadLink = document.createElement('a');
      downloadLink.className = 'btn-secondary btn-xs';
      downloadLink.textContent = 'Download';
      if (file._clientFile) {
        file._clientFile.getBlobURL((err, url) => {
          if (!err) {
            downloadLink.href = url;
            downloadLink.download = file.name;
          }
        });
      } else {
        downloadLink.href = `/api/download/${data.infoHash}/${index}`;
        downloadLink.download = file.name;
      }
      actions.appendChild(downloadLink);

      const fileShareBtn = document.createElement('button');
      fileShareBtn.className = 'btn-secondary btn-xs';
      fileShareBtn.textContent = 'Share';
      fileShareBtn.onclick = () => {
        const shareUrl = `${window.location.origin}/share/${data.infoHash}/${index}`;
        openShareModal(shareUrl);
      };
      actions.appendChild(fileShareBtn);

      li.appendChild(fileInfo);
      li.appendChild(actions);
      fileList.appendChild(li);
    });

    if (targetFileIdx !== null && data.files[targetFileIdx]) {
      playFile(targetFileIdx, data.files[targetFileIdx]);
    } else {
      const firstStreamable = data.files.findIndex(f => f.isStreamable);
      if (firstStreamable !== -1) {
        playFile(firstStreamable, data.files[firstStreamable]);
      } else {
        playerContainer.classList.add('hidden');
      }
    }
  }

  function playFile(index, file) {
    activeFileIndex = index;
    if (file._clientFile) {
      file._clientFile.renderTo(videoPlayer, { autoplay: true });
    } else {
      const streamUrl = `/api/stream/${currentTorrent.infoHash}/${index}`;
      videoPlayer.src = streamUrl;
      videoPlayer.play().catch(() => {});
    }
    playerContainer.classList.remove('hidden');
  }

  function updateStats(infoHash) {
    fetch(`/api/torrent/${infoHash}`)
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          statPeers.textContent = `Peers: ${data.numPeers || 0}`;
          statSpeed.textContent = `Speed: ${formatBytes(data.downloadSpeed || 0)}/s`;
          statProgress.textContent = `Progress: ${((data.progress || 0) * 100).toFixed(1)}%`;
        }
      })
      .catch(() => {});
  }

  function openShareModal(url) {
    shareUrlInput.value = url;
    shareModal.classList.remove('hidden');
  }

  function showLoading() {
    torrentTitle.textContent = 'Loading torrent...';
    fileList.innerHTML = '<li>Processing...</li>';
    mediaSection.classList.remove('hidden');
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
});
