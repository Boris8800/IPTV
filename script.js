(function(){
  'use strict';

  const IDB_DB = 'streamtv-db-v1';
  const IDB_VERSION = 1;

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_DB, IDB_VERSION);
      req.onupgradeneeded = function(e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('playlists')) {
          db.createObjectStore('playlists', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('favorites')) {
          const favStore = db.createObjectStore('favorites', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbPut(storeName, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet(storeName, key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGetAll(storeName) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbDelete(storeName, key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /* ---------------------------
     App State
  ----------------------------*/
  let playlists = [];
  // predefined YouTube live news channels
  const YOUTUBE_LIVE_CHANNELS = [
     { id: 'yt-cnn', name: 'CNN Live', url: 'https://www.youtube.com/channel/UCoMdktPbSTixAyNGwb-UYkQ/live', group: 'YouTube', lang: 'en' },
     { id: 'yt-france24', name: 'France 24 English', url: 'https://www.youtube.com/channel/UCQfwfsi5VrQ8yKZ-UWmAEFg/live', group: 'YouTube', lang: 'en' },
     { id: 'yt-dw', name: 'DW News', url: 'https://www.youtube.com/channel/UCknLrEdhRCp1aegoMqRaCZg/live', group: 'YouTube', lang: 'en' },
     { id: 'yt-bloomberg', name: 'Bloomberg', url: 'https://www.youtube.com/channel/UCIALMKvObZNtJ6AmdCLP7Lg/live', group: 'YouTube', lang: 'en' },
     { id: 'yt-aljazeera-eng', name: 'Al Jazeera English', url: 'https://www.youtube.com/channel/UCNye-wNBqNL5ZzHSJj3l8Bg/live', group: 'YouTube', lang: 'en' },
     { id: 'yt-abc', name: 'ABC News', url: 'https://www.youtube.com/channel/UCBi2mrWuNuyYy4gbM6fU18Q/live', group: 'YouTube', lang: 'en' },
     { id: 'yt-cbs', name: 'CBS News', url: 'https://www.youtube.com/channel/UC8p1vwvWtl6T73JiExfWs1g/live', group: 'YouTube', lang: 'en' },
     { id: 'yt-nbc', name: 'NBC News', url: 'https://www.youtube.com/channel/UCeY0bbntWzzVIaj2z3QigXg/live', group: 'YouTube', lang: 'en' },
     { id: 'yt-wion', name: 'WION', url: 'https://www.youtube.com/channel/UC_gUM8rL-Lrg6O3adPW9K1g/live', group: 'YouTube', lang: 'en' },
     { id: 'yt-trt', name: 'TRT World', url: 'https://www.youtube.com/channel/UC7fWeaHhqgM4Ry-RMpM2YYw/live', group: 'YouTube', lang: 'en' },
     { id: 'yt-nhk', name: 'NHK World', url: 'https://www.youtube.com/channel/UCVYamHliCI9rw1tHR1xbkfw/live', group: 'YouTube', lang: 'en' },
     { id: 'yt-nasa', name: 'NASA', url: 'https://www.youtube.com/channel/UCLA_DiR1FfKNvjuUpBHmylQ/live', group: 'YouTube', lang: 'en' },
     { id: 'yt-nasa-space', name: 'NASA Spaceflight', url: 'https://www.youtube.com/channel/UCSUu1lih2RifWkKtDOJdsBA/live', group: 'YouTube', lang: 'en' },
     { id: 'yt-weather', name: 'Weather News', url: 'https://www.youtube.com/channel/UCNsidkYpIA0gS1HUY8xP8ag/live', group: 'YouTube', lang: 'en' },
     { id: 'yt-euronews', name: 'EuroNews', url: 'https://www.youtube.com/channel/UCSrZ3UV4jOidv8ppoVuvW9Q/live', group: 'YouTube', lang: 'en' },
     { id: 'yt-telesur', name: 'TeleSUR', url: 'https://www.youtube.com/channel/UCmuTmply7Fz6F_JF4D3Z-2Q/live', group: 'YouTube', lang: 'es' },
     { id: 'yt-ndtv', name: 'NDTV', url: 'https://www.youtube.com/channel/UCZFMm1mMw0F81Z37aaEzTUA/live', group: 'YouTube', lang: 'en' },
     { id: 'yt-india-today', name: 'India Today', url: 'https://www.youtube.com/channel/UCYPvAwZP8pZhSMW8qs7cVCw/live', group: 'YouTube', lang: 'en' },
     { id: 'yt-aaj-tak', name: 'Aaj Tak', url: 'https://www.youtube.com/channel/UCt4t-jeY85JegMlZ-E5UWtA/live', group: 'YouTube', lang: 'en' },
     { id: 'yt-zee-news', name: 'Zee News', url: 'https://www.youtube.com/channel/UC16niRr50-MSBwiO3YDb3RA/live', group: 'YouTube', lang: 'en' }
  ];
  let favorites = new Set(); // Cambiar a Set para mejor rendimiento
  let currentPlaylistId = null;
  // start with two example channels for demonstration
  let currentPlaylist = [
    { id: 'ex-sky', name: 'Sky News', url: 'https://www.youtube.com/channel/UCoMdktPbSTixAyNGwb-UYkQ/live', group: 'Examples' },
    { id: 'ex-fr24', name: 'France 24 English', url: 'https://www.youtube.com/channel/UCQfwfsi5VrQ8yKZ-UWmAEFg/live', group: 'Examples' }
  ];
  let currentCategory = 'all';
  let hls = null;
    let currentChannelId = null;
    let currentChannelIndex = -1;
    let autoNextOnFail = true;
    let playbackWatchdog = null;
    let activePlaybackToken = 0;
    let handledFailureToken = -1;
    let retryCount = 0;
    let multiMode = false;
    let activeTileIndex = 0;
    const tiles = []; // will hold {video,hls}
  const CHANNEL_RENDER_BATCH = 60;

  /* ---------------------------
     DOM references
  ----------------------------*/
  const videoPlayer = document.getElementById('videoPlayer');
  const playBtn = document.getElementById('playBtn');
  const retryBtn = document.getElementById('retryBtn');
  const nextBtn = document.getElementById('nextBtn');
  const multiBtn = document.getElementById('multiBtn');
  const addScreenBtn = document.getElementById('addScreenBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const qualitySelector = document.getElementById('qualitySelector');
  const nowPlaying = document.getElementById('nowPlaying');
  const autoNextOnFailToggle = document.getElementById('autoNextOnFail');
  const groupsList = document.getElementById('groupsList');
  const channelsCount = document.getElementById('channelsCount');
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('fileInput');
  const uploadBtn = document.getElementById('uploadBtn');
  const addUrlModalBtn = document.getElementById('addUrlModalBtn');
  const addPlaylistBtn = document.getElementById('addPlaylistBtn');
  const playlistsGrid = document.getElementById('playlistsGrid');
  const emptyPlaylists = document.getElementById('emptyPlaylists');
  const categoryTabs = document.querySelectorAll('.category-tab');
  const urlModal = document.getElementById('urlModal');
  const closeUrlModal = document.getElementById('closeUrlModal');
  const loadUrlBtn = document.getElementById('loadUrlBtn');
  const testUrlBtn = document.getElementById('testUrlBtn');
  const playlistUrl = document.getElementById('playlistUrl');
  const customProxySection = document.getElementById('customProxySection');
  const customProxyUrlInput = document.getElementById('customProxyUrl');
  const saveCustomProxyBtn = document.getElementById('saveCustomProxy');
  const urlStatus = document.getElementById('urlStatus');
  const addUrlBtn = document.getElementById('addUrlBtn');
  const searchInput = document.getElementById('searchInput');
  const globalStatus = document.getElementById('globalStatus');
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const navLinks = document.getElementById('navLinks');
  const xtreamModalBtn = document.getElementById('xtreamModalBtn');

  const CORS_PROXIES = {
    direct: '',
    corsproxy: 'https://corsproxy.io/?',
    allorigins: 'https://api.allorigins.win/raw?url=',
    corsanywhere: 'https://cors-anywhere.herokuapp.com/',
    thingproxy: 'https://thingproxy.freeboard.io/fetch/',
    corscontainer: 'https://api.codetabs.com/v1/proxy?quest=',
    crossorigin: 'https://crossorigin.me/',
    corsbridge: 'https://corsbridge.org/',
    custom: ''
  };

  /* ---------------------------
     Init
  ----------------------------*/
  document.addEventListener('DOMContentLoaded', () => {
    // Add Playlist button logic
    const uploadBtn = document.getElementById('uploadBtn');
    const uploadModal = document.getElementById('uploadModal');
    const closeUploadModal = document.getElementById('closeUploadModal');
    const fileInput = document.getElementById('fileInput');

    if (uploadBtn && uploadModal && closeUploadModal) {
      uploadBtn.addEventListener('click', () => {
        uploadModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
      });
      closeUploadModal.addEventListener('click', () => {
        uploadModal.style.display = 'none';
        document.body.style.overflow = 'auto';
      });
      window.addEventListener('click', (e) => {
        if (e.target === uploadModal) {
          uploadModal.style.display = 'none';
          document.body.style.overflow = 'auto';
        }
      });
    }

    // Handle file upload from modal
    if (fileInput) {
      fileInput.addEventListener('change', function(event) {
        const file = event.target.files && event.target.files[0];
        if (file) {
          parseM3UFile(file);
          uploadModal.style.display = 'none';
          document.body.style.overflow = 'auto';
        }
        fileInput.value = '';
      });
    }

    // Add URL button
    const addUrlBtn = document.getElementById('addUrlBtn');
    const urlModal = document.getElementById('urlModal');
    const closeUrlModal = document.getElementById('closeUrlModal');
    const loadUrlBtn = document.getElementById('loadUrlBtn');
    if (addUrlBtn && urlModal) {
      addUrlBtn.addEventListener('click', () => {
        urlModal.style.display = 'flex';
        urlModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
      });
    }
    if (closeUrlModal && urlModal) {
      closeUrlModal.addEventListener('click', () => {
        urlModal.style.display = 'none';
        urlModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = 'auto';
      });
    }
    if (urlModal) {
      window.addEventListener('click', (e) => {
        if (e.target === urlModal) {
          urlModal.style.display = 'none';
          urlModal.setAttribute('aria-hidden', 'true');
          document.body.style.overflow = 'auto';
        }
      });
    }
    // Ensure Load Playlist from URL button works
    if (loadUrlBtn) {
      loadUrlBtn.addEventListener('click', async () => {
        loadUrlBtn.disabled = true;
        await loadUrlPlaylist();
        loadUrlBtn.disabled = false;
      });
    }

    // Xtream button
    const xtreamModalBtn = document.getElementById('xtreamModalBtn');
    if (xtreamModalBtn) {
      xtreamModalBtn.addEventListener('click', () => {
        window.open('xtream.html', '_blank');
      });
    }

    categoryTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        categoryTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentCategory = tab.dataset.category;
        renderGroups(currentPlaylist);
      });
      tab.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') tab.click(); });
    });

    // Fix: search bar filters channels in real time
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        const term = searchInput.value.trim().toLowerCase();
        if (!term) {
          renderGroups(currentPlaylist);
          return;
        }
        // support youtube category search
        if (currentCategory === 'youtube') {
          const filtered = YOUTUBE_LIVE_CHANNELS.filter(ch =>
            (ch.name || '').toLowerCase().includes(term)
          );
          renderGroups(filtered);
          return;
        }
        // Filter by channel name in current playlist
        const filtered = currentPlaylist.filter(ch =>
          (ch.name || '').toLowerCase().includes(term)
        );
        renderGroups(filtered);
      });
    }

    // Robust player buttons functionality for deployment
    if (playBtn && videoPlayer) {
      playBtn.onclick = function () {
        videoPlayer.play();
      };
    }
    if (retryBtn) {
      retryBtn.onclick = retryCurrentChannel;
    }
    if (nextBtn) {
      nextBtn.onclick = () => playNextChannel(false);
    }
    if (multiBtn) {
      multiBtn.onclick = toggleMultiMode;
    }
    if (addScreenBtn) {
      addScreenBtn.onclick = createTile;
    }
    if (pauseBtn && videoPlayer) {
      pauseBtn.onclick = function () {
        videoPlayer.pause();
      };
    }
    if (fullscreenBtn && videoPlayer) {
      fullscreenBtn.onclick = function () {
        if (videoPlayer.requestFullscreen) {
          videoPlayer.requestFullscreen();
        } else if (videoPlayer.webkitRequestFullscreen) {
          videoPlayer.webkitRequestFullscreen();
        } else if (videoPlayer.msRequestFullscreen) {
          videoPlayer.msRequestFullscreen();
        }
      };
    }
    if (autoNextOnFailToggle) {
      autoNextOnFail = autoNextOnFailToggle.checked;
      autoNextOnFailToggle.addEventListener('change', function() {
        autoNextOnFail = autoNextOnFailToggle.checked;
      });
    }
    if (videoPlayer) {
      videoPlayer.addEventListener('playing', clearPlaybackWatchdog);
      videoPlayer.addEventListener('loadeddata', clearPlaybackWatchdog);
      videoPlayer.addEventListener('waiting', () => {
        const currentChannel = getCurrentChannel();
        if (currentChannel && activePlaybackToken > 0) {
          startPlaybackWatchdog(currentChannel, activePlaybackToken);
        }
      });
      videoPlayer.addEventListener('error', () => {
        if (activePlaybackToken > 0) {
          handlePlaybackFailure(getVideoErrorMessage(), getCurrentChannel(), activePlaybackToken);
        }
      });
    }
  });

  /* ---------------------------
     Load/Save state in IDB - CORREGIDO
  ----------------------------*/
  async function loadStateFromIDB() {
    try {
      playlists = await idbGetAll('playlists') || [];
      playlists.sort((a,b) => b.id - a.id);
      
      // CARGAR FAVORITOS CORRECTAMENTE
      const favRecords = await idbGetAll('favorites');
      favorites = new Set();
      if (favRecords && favRecords.length > 0) {
        favRecords.forEach(fav => {
          if (fav.id) favorites.add(fav.id.toString());
        });
      }
      
      if (playlists.length > 0 && !currentPlaylistId) {
        currentPlaylistId = playlists[0].id;
      }
    } catch (error) {
      console.error('Error loading state:', error);
      playlists = [];
      favorites = new Set();
    }
  }

  async function savePlaylistsToIDB() {
    for (const pl of playlists) {
      await idbPut('playlists', pl);
    }
  }

  // GUARDAR FAVORITOS CORRECTAMENTE
  async function saveFavoritesToIDB() {
    try {
      // Limpiar todos los favoritos existentes
      const existingFavs = await idbGetAll('favorites');
      for (const fav of existingFavs) {
        await idbDelete('favorites', fav.id);
      }
      
      // Guardar cada favorito individualmente
      for (const favId of favorites) {
        await idbPut('favorites', { 
          id: favId.toString(),
          channelId: favId,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Error saving favorites:', error);
    }
  }

  async function saveSetting(key, value) {
    await idbPut('settings', { key, value });
  }

  /* ---------------------------
     Event listeners
  ----------------------------*/
  function setupEventListeners() {
    mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    playBtn.addEventListener('click', playVideo);
    pauseBtn.addEventListener('click', pauseVideo);
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    qualitySelector.addEventListener('change', onQualityChange);

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('keydown', e => { if (e.key === 'Enter') fileInput.click(); });
    uploadBtn.addEventListener('click', () => fileInput.click());
    addPlaylistBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);

    addUrlModalBtn.addEventListener('click', openUrlModal);
    addUrlBtn.addEventListener('click', openUrlModal);
    closeUrlModal.addEventListener('click', closeUrlModalFn);
    loadUrlBtn.addEventListener('click', loadUrlPlaylist);
    testUrlBtn.addEventListener('click', testUrl);
    saveCustomProxyBtn.addEventListener('click', saveCustomProxy);

    document.querySelectorAll('input[name="proxyOption"]').forEach(radio => {
      radio.addEventListener('change', function() {
        if (this.value === 'custom') customProxySection.style.display = 'block';
        else customProxySection.style.display = 'none';
      });
    });

    window.addEventListener('click', (e) => {
      if (e.target === urlModal) closeUrlModalFn();
    });

    searchInput.addEventListener('input', filterChannels);

    categoryTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        categoryTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentCategory = tab.dataset.category;
        renderGroups(currentPlaylist);
      });
      tab.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') tab.click(); });
    });

    document.addEventListener('keydown', globalKeyHandler);
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('drop', handleFileDrop);

    if (xtreamModalBtn) {
      xtreamModalBtn.addEventListener('click', openXtreamModal);
    }
  }

  function toggleMobileMenu() {
    mobileMenuBtn.classList.toggle('active');
    navLinks.classList.toggle('active');
    const isExpanded = mobileMenuBtn.getAttribute('aria-expanded') === 'true';
    mobileMenuBtn.setAttribute('aria-expanded', !isExpanded);
  }

  function globalKeyHandler(e) {
    if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      if (videoPlayer.paused) playVideo(); else pauseVideo();
    }
    if (e.code === 'KeyF' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      toggleFullscreen();
    }
    if (e.key === 'Escape') {
      if (urlModal.style.display === 'flex') closeUrlModalFn();
      if (navLinks.classList.contains('active')) toggleMobileMenu();
    }
  }

  /* ---------------------------
     File upload / parsing M3U
  ----------------------------*/
  function handleFileUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (file) parseM3UFile(file);
    fileInput.value = '';
  }

  function handleDragOver(e) { e.preventDefault(); uploadArea.style.backgroundColor = 'rgba(52,152,219,0.2)'; }
  function handleFileDrop(e) {
    e.preventDefault();
    uploadArea.style.backgroundColor = '';
    const files = e.dataTransfer.files;
    if (files.length > 0) parseM3UFile(files[0]);
  }

  function parseM3UFile(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const content = e.target.result;
      const channels = parseM3UContent(content);
      const newPlaylist = {
        id: Date.now(),
        name: file.name.replace('.m3u','').replace('.m3u8',''),
        date: new Date().toLocaleDateString(),
        channels: channels
      };
      playlists.unshift(newPlaylist);
      idbPut('playlists', newPlaylist).then(()=> {
        showStatus(`Playlist "${newPlaylist.name}" loaded with ${channels.length} channels`, 'success');
        currentPlaylistId = newPlaylist.id;
        currentPlaylist = channels;
        renderGroups(currentPlaylist);
        renderPlaylistsUI();
      }).catch(err => {
        console.error('IDB save error:', err);
        showStatus('Error saving playlist locally', 'error');
      });
    };
    reader.readAsText(file);
  }

  function parseM3UContent(content) {
    const lines = content.split(/\r?\n/);
    const channels = [];
    let currentChannel = null;
    
    for (let i=0;i<lines.length;i++){
      const line = lines[i].trim();
      if (!line) continue;
      
      if (line.startsWith('#EXTINF:')) {
        const info = line.substring(8);
        const nameSplit = info.split(',');
        const name = nameSplit.slice(1).join(',').trim() || `Channel ${channels.length+1}`;
        
        currentChannel = {
          id: `ch_${Date.now()}_${channels.length}`, // ID único y consistente
          name: name,
          group: 'General',
          url: '',
          logo: 'https://via.placeholder.com/30x30/3498db/ffffff?text=TV',
          resolution: 'HD'
        };
        
        const groupMatch = line.match(/group-title="([^"]*)"/i);
        if (groupMatch) currentChannel.group = groupMatch[1];
        
        const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
        if (logoMatch) currentChannel.logo = logoMatch[1];
        
      } else if (line.startsWith('http') || line.startsWith('rtmp') || line.includes('://')) {
        if (currentChannel) {
          currentChannel.url = line;
          channels.push(currentChannel);
          currentChannel = null;
        } else {
          channels.push({
            id: `ch_${Date.now()}_${channels.length}`,
            name: `Channel ${channels.length+1}`,
            group: 'General',
            url: line,
            logo: 'https://via.placeholder.com/30x30/3498db/ffffff?text=TV',
            resolution: 'HD'
          });
        }
      }
    }
    return channels;
  }

  /* ---------------------------
     Render Playlists UI
  ----------------------------*/
  function renderPlaylistsUI() {
    playlistsGrid.innerHTML = '';
    if (playlists.length === 0) {
      emptyPlaylists.classList.remove('hidden');
      return;
    }
    emptyPlaylists.classList.add('hidden');

    playlists.forEach(playlist => {
      const card = document.createElement('div');
      card.className = `playlist-card ${playlist.id === currentPlaylistId ? 'active' : ''}`;
      card.innerHTML = `
        <div class="playlist-icon"><i class="fas fa-list" aria-hidden="true"></i></div>
        <div class="playlist-info">
          <h4>${escapeHtml(playlist.name)}</h4>
          <p>${playlist.channels.length} channels</p>
          <p>Created: ${playlist.date}</p>
        </div>
        <div class="playlist-actions">
          <button class="btn btn-primary load-pl" data-id="${playlist.id}">Load</button>
          <button class="btn btn-outline edit-pl" data-id="${playlist.id}">Edit</button>
          <button class="btn btn-outline del-pl" data-id="${playlist.id}">Delete</button>
        </div>
      `;
      playlistsGrid.appendChild(card);

      card.querySelector('.load-pl').addEventListener('click', () => loadPlaylist(playlist.id));
      card.querySelector('.edit-pl').addEventListener('click', () => editPlaylistName(playlist.id));
      card.querySelector('.del-pl').addEventListener('click', () => deletePlaylist(playlist.id));
    });
  }

  function loadPlaylist(id) {
    const pl = playlists.find(p => p.id === id);
    if (!pl) return;
    currentPlaylistId = pl.id;
    currentPlaylist = pl.channels || [];
    renderGroups(currentPlaylist);
    renderPlaylistsUI();
  }

  function editPlaylistName(id) {
    const pl = playlists.find(p=>p.id===id);
    if (!pl) return;
    const newName = prompt('Enter new name for the playlist:', pl.name);
    if (newName) {
      pl.name = newName;
      idbPut('playlists', pl).then(()=> {
        renderPlaylistsUI();
        showStatus('Playlist renamed', 'success');
      });
    }
  }

  function deletePlaylist(id) {
    if (!confirm('Are you sure you want to delete this playlist?')) return;
    idbDelete('playlists', id).then(()=> {
      playlists = playlists.filter(p=>p.id!==id);
      renderPlaylistsUI();
      if (currentPlaylistId === id) {
        currentPlaylist = [];
        currentPlaylistId = playlists.length ? playlists[0].id : null;
        if (currentPlaylistId) {
          currentPlaylist = playlists.find(p=>p.id===currentPlaylistId).channels || [];
        }
        renderGroups(currentPlaylist);
      }
      showStatus('Playlist deleted', 'success');
    }).catch(err=>{
      console.error('Delete error', err);
      showStatus('Error deleting playlist', 'error');
    });
  }

  /* ---------------------------
     Render groups and channels - CORREGIDO FAVORITOS
  ----------------------------*/
  function renderGroups(channels) {
    groupsList.innerHTML = '';
    if (!channels || channels.length===0) {
      groupsList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-broadcast-tower" aria-hidden="true"></i>
          <h3>No channels loaded</h3>
          <p>Upload an M3U playlist to see your channels here</p>
        </div>
      `;
      channelsCount.textContent = '0 channels';
      return;
    }

    // Filter by category
    let filtered = channels;
    if (currentCategory === 'youtube') {
      // use static YouTube list
      filtered = YOUTUBE_LIVE_CHANNELS.slice();
    } else if (currentCategory === 'favorites') {
      filtered = channels.filter(ch => favorites.has(ch.id));
    } else if (currentCategory === 'movies') {
      // Movies: filter by group name containing 'movies' or 'vod'
      filtered = channels.filter(ch => {
        const group = (ch.group || '').toLowerCase();
        return group.includes('movies') || group.includes('vod');
      });
    } else if (currentCategory === 'series') {
      // Series: filter by group name containing 'series' or 'srs'
      filtered = channels.filter(ch => {
        const group = (ch.group || '').toLowerCase();
        return group.includes('series') || group.includes('srs');
      });
    } else if (currentCategory !== 'all') {
      // TV: filter by group name (case-insensitive, partial match)
      filtered = channels.filter(ch => (ch.group || '').toLowerCase().includes(currentCategory));
    }

    if (filtered.length === 0) {
      groupsList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-filter" aria-hidden="true"></i>
          <h3>No channels in this category</h3>
          <p>Try selecting a different category</p>
        </div>
      `;
      channelsCount.textContent = '0 channels';
      return;
    }

    const groups = {};
    filtered.forEach(ch => {
      const g = ch.group || 'General';
      if (!groups[g]) groups[g] = [];
      groups[g].push(ch);
    });

    channelsCount.textContent = `${filtered.length} channel${filtered.length!==1?'s':''}`;

    Object.keys(groups).forEach(groupName => {
      const groupChannels = groups[groupName];
      const groupItem = document.createElement('div');
      groupItem.className = 'group-item';
      groupItem.innerHTML = `
        <div class="group-header" role="button" tabindex="0" aria-expanded="false">
          <div class="group-name">${escapeHtml(groupName)}</div>
          <div class="group-count">${groupChannels.length}</div>
        </div>
        <div class="channels-list"></div>
      `;
      const channelsListEl = groupItem.querySelector('.channels-list');

      let offset = 0;
      function renderBatch() {
        const slice = groupChannels.slice(offset, offset + CHANNEL_RENDER_BATCH);
        slice.forEach(ch => {
          const chEl = document.createElement('div');
          chEl.className = 'channel-item';
          chEl.tabIndex = 0;
          chEl.dataset.channelId = ch.id;
          const isFavorite = favorites.has(ch.id);
          chEl.innerHTML = `
            <img src="${escapeHtml(ch.logo||'https://via.placeholder.com/30x30/3498db/ffffff?text=TV')}" alt="${escapeHtml(ch.name)}" class="channel-logo">
            <div class="channel-info">
              <div class="channel-name">${escapeHtml(ch.name)}</div>
              <div class="channel-resolution">${escapeHtml(ch.resolution || 'HD')}</div>
            </div>
            <button class="favorite-btn ${isFavorite ? 'active' : ''}" data-id="${ch.id}" aria-label="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
              <i class="${isFavorite ? 'fas' : 'far'} fa-heart" aria-hidden="true"></i>
            </button>
          `;
          chEl.addEventListener('click', (e) => {
            if (e.target.closest('.favorite-btn')) return;
            playChannel(ch);
            channelsListEl.querySelectorAll('.channel-item.active').forEach(i=>i.classList.remove('active'));
            chEl.classList.add('active');
          });
          chEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') chEl.click();
          });
          const favBtn = chEl.querySelector('.favorite-btn');
          favBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            toggleFavorite(ch.id, favBtn);
          });
          channelsListEl.appendChild(chEl);
        });

        offset += slice.length;
        const remaining = groupChannels.length - offset;
        const existingLoadMore = channelsListEl.querySelector('.load-more');
        if (existingLoadMore) existingLoadMore.remove();
        if (remaining > 0) {
          const lm = document.createElement('button');
          lm.className = 'btn btn-outline load-more';
          lm.textContent = `Load more (${remaining})`;
          lm.addEventListener('click', () => {
            lm.disabled = true;
            setTimeout(renderBatch, 10); // async batch for smoother UI
          });
          channelsListEl.appendChild(lm);
        }
      }

      const header = groupItem.querySelector('.group-header');
      header.addEventListener('click', () => {
        const isActive = groupItem.classList.toggle('active');
        header.setAttribute('aria-expanded', isActive ? 'true' : 'false');
        if (isActive && channelsListEl.children.length === 0) {
          setTimeout(renderBatch, 10); // async initial batch
        }
      });
      header.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') header.click(); });

      groupsList.appendChild(groupItem);
    });
  }

  /* ---------------------------
     Favorites handling - CORREGIDO
  ----------------------------*/
  async function toggleFavorite(channelId, buttonElement) {
    try {
      if (favorites.has(channelId)) {
        favorites.delete(channelId);
        buttonElement.classList.remove('active');
        buttonElement.innerHTML = '<i class="far fa-heart" aria-hidden="true"></i>';
        buttonElement.setAttribute('aria-label', 'Add to favorites');
        showStatus('Removed from favorites', 'success');
      } else {
        favorites.add(channelId);
        buttonElement.classList.add('active');
        buttonElement.innerHTML = '<i class="fas fa-heart" aria-hidden="true"></i>';
        buttonElement.setAttribute('aria-label', 'Remove from favorites');
        showStatus('Added to favorites', 'success');
      }
      
      await saveFavoritesToIDB();
      
      // Si estamos en la categoría de favoritos, actualizar la vista
      if (currentCategory === 'favorites') {
        renderGroups(currentPlaylist);
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      showStatus('Error updating favorites', 'error');
    }
  }

  function filterChannels() {
    const term = searchInput.value.trim().toLowerCase();
    if (!term) {
      renderGroups(currentPlaylist);
      return;
    }
    const filtered = currentPlaylist.filter(ch => (ch.name || '').toLowerCase().includes(term));
    renderGroups(filtered);
  }

  function clearPlaybackWatchdog() {
    if (playbackWatchdog) {
      clearTimeout(playbackWatchdog);
      playbackWatchdog = null;
    }
  }

  function startPlaybackWatchdog(channel, token) {
    clearPlaybackWatchdog();
    playbackWatchdog = setTimeout(() => {
      if (token !== activePlaybackToken) return;
      if (videoPlayer.readyState < 2) {
        handlePlaybackFailure('timeout', channel, token);
      }
    }, 12000);
  }

  function getVideoErrorMessage() {
    if (!videoPlayer || !videoPlayer.error) return 'unknown error';
    const code = videoPlayer.error.code;
    if (code === 1) return 'playback aborted';
    if (code === 2) return 'network error';
    if (code === 3) return 'decode error';
    if (code === 4) return 'unsupported format';
    return 'video error';
  }

  function resolveChannelIndex(channel) {
    if (!channel || !currentPlaylist || currentPlaylist.length === 0) return -1;
    if (channel.id) {
      const idxById = currentPlaylist.findIndex(ch => ch.id === channel.id);
      if (idxById !== -1) return idxById;
    }
    if (channel.url) {
      return currentPlaylist.findIndex(ch => ch.url === channel.url);
    }
    return -1;
  }

  function getCurrentChannel() {
    if (currentChannelIndex >= 0 && currentChannelIndex < currentPlaylist.length) {
      return currentPlaylist[currentChannelIndex];
    }
    if (currentChannelId) {
      return currentPlaylist.find(ch => ch.id === currentChannelId) || null;
    }
    return null;
  }

  function highlightActiveChannel(channelId) {
    document.querySelectorAll('.channel-item.active').forEach(item => item.classList.remove('active'));
    if (!channelId) return;
    const safeId = String(channelId).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const item = document.querySelector(`.channel-item[data-channel-id="${safeId}"]`);
    if (item) item.classList.add('active');
  }

  function retryCurrentChannel() {
    const channel = getCurrentChannel();
    if (!channel) {
      showStatus('No selected channel to retry', 'warning');
      return;
    }
    showStatus(`Retrying ${channel.name}...`, 'warning', 2500);
    playChannel(channel);
    highlightActiveChannel(channel.id);
  }

  function playNextChannel(fromFailure) {
    if (!currentPlaylist || currentPlaylist.length === 0) {
      if (!fromFailure) showStatus('No channels in current playlist', 'warning');
      return false;
    }

    const nextIndex = currentChannelIndex >= 0 ? currentChannelIndex + 1 : 0;
    if (nextIndex >= currentPlaylist.length) {
      if (fromFailure) {
        showStatus('Playback failed and there are no more channels to try', 'error', 5000);
      } else {
        showStatus('Reached end of playlist', 'warning');
      }
      return false;
    }

    const nextChannel = currentPlaylist[nextIndex];
    if (fromFailure) {
      showStatus(`Trying next channel: ${nextChannel.name}`, 'warning', 3500);
    }
    playChannel(nextChannel);
    highlightActiveChannel(nextChannel.id);
    return true;
  }

  function handlePlaybackFailure(reason, channel, token) {
    if (token !== activePlaybackToken) return;
    if (handledFailureToken === token) return;
    handledFailureToken = token;
    clearPlaybackWatchdog();

    if (autoNextOnFail) {
      if (retryCount < 5) {
        retryCount++;
        showStatus(`Auto-retrying ${channel.name} (${retryCount}/5)...`, 'warning', 2500);
        playChannel(channel);
        return;
      }
      playNextChannel(true);
      return;
    }

    const reasonText = reason ? `: ${reason}` : '';
    showStatus(`Playback failed${reasonText}. Use Retry or Next.`, 'error', 6000);
  }

  /* ---------------------------
     Multi‑screen helpers
  ----------------------------*/
  function toggleMultiMode() {
    multiMode = !multiMode;
    if (multiMode) enableMultiMode();
    else disableMultiMode();
  }

  function enableMultiMode() {
    document.querySelector('.video-container').classList.add('hidden');
    const mc = document.getElementById('multiContainer');
    mc.classList.remove('hidden');
    if (addScreenBtn) addScreenBtn.style.display = 'inline-flex';
    if (tiles.length === 0) {
      for (let i = 0; i < 4; i++) createTile();
    }
    createMultiOverlay();
  }

  function disableMultiMode() {
    // remove any embedded YouTube iframe from main container
    const container = videoPlayer.parentElement;
    const ifr = container.querySelector('iframe.youtube-frame');
    if (ifr) ifr.remove();
    document.querySelector('.video-container').classList.remove('hidden');
    const mc = document.getElementById('multiContainer');
    mc.classList.add('hidden');
    if (addScreenBtn) addScreenBtn.style.display = 'none';
    // destroy any hls instances and clear tiles
    tiles.forEach(t=>{ if (t.hls) { try { t.hls.destroy(); } catch(e){} } });
    tiles.length = 0;
    mc.innerHTML = '';
    activeTileIndex = 0;
    removeMultiOverlay();
  }

  function createTile() {
    const container = document.createElement('div');
    container.className = 'multi-player';
    const video = document.createElement('video');
    video.controls = true;
    video.dataset.index = tiles.length;

    // overlay controls for this tile
    const ctrl = document.createElement('div');
    ctrl.className = 'tile-controls';
    ctrl.innerHTML = `
      <button class="tile-btn delete-btn" title="Remove screen"><i class="fas fa-trash"></i></button>
      <button class="tile-btn expand-btn" title="View full"><i class="fas fa-expand"></i></button>
    `;
    container.appendChild(ctrl);

    container.appendChild(video);
    container.addEventListener('click', (e) => {
      if (e.target.closest('.tile-btn')) return; // ignore clicks on controls
      activeTileIndex = parseInt(video.dataset.index);
      updateTileHighlight();
    });

    document.getElementById('multiContainer').appendChild(container);
    tiles.push({video, hls: null, channel: null});
    updateTileHighlight();

    // button event wiring
    ctrl.querySelector('.delete-btn').onclick = () => removeTile(parseInt(video.dataset.index));
    const expBtn = ctrl.querySelector('.expand-btn');
    expBtn.onclick = () => toggleFocusTile(parseInt(video.dataset.index));
  }

  function updateTileHighlight() {
    document.querySelectorAll('.multi-player').forEach((c,i)=>{
      c.style.border = i===activeTileIndex ? '2px solid var(--primary)' : '2px solid transparent';
    });
  }

  function createMultiOverlay() {
    const mc = document.getElementById('multiContainer');
    if (!mc) return;
    if (document.getElementById('multiOverlayAdd')) return;
    const btn = document.createElement('button');
    btn.id = 'multiOverlayAdd';
    btn.innerHTML = '<i class="fas fa-plus-square"></i>';
    btn.title = 'Add screen';
    btn.onclick = createTile;
    mc.appendChild(btn);
  }

  function removeTile(idx) {
    if (!tiles[idx]) return;
    // destroy hls if exists
    if (tiles[idx].hls) {
      try { tiles[idx].hls.destroy(); } catch(e){}
    }
    // remove DOM element
    const container = document.querySelector(`.multi-player:nth-child(${idx+1})`);
    if (container && container.parentElement) container.parentElement.removeChild(container);
    tiles.splice(idx, 1);
    // reindex remaining
    tiles.forEach((t,i)=>{
      const vid = t.video;
      vid.dataset.index = i;
      const parent = vid.parentElement;
      if (parent) {
        const ctrl = parent.querySelector('.tile-controls');
        if (ctrl) {
          ctrl.querySelector('.delete-btn').onclick = () => removeTile(i);
          ctrl.querySelector('.expand-btn').onclick = () => expandTile(i);
        }
      }
    });
    if (activeTileIndex >= tiles.length) activeTileIndex = tiles.length - 1;
    updateTileHighlight();
  }

  // previously expandTile; now replaced by focus behaviour
  function expandTile(idx) {
    if (!tiles[idx] || !tiles[idx].channel) return;
    const ch = tiles[idx].channel;
    disableMultiMode();
    playChannel(ch);
  }

  function toggleFocusTile(idx) {
    const container = document.querySelector(`.multi-player:nth-child(${idx+1})`);
    if (!container) return;
    const focused = container.classList.toggle('tile-focused');
    const btn = container.querySelector('.expand-btn');
    if (btn) {
      btn.title = focused ? 'Unfocus' : 'Focus';
      btn.innerHTML = focused ? '<i class="fas fa-compress"></i>' : '<i class="fas fa-expand"></i>';
    }
  }

  function removeMultiOverlay() {
    const btn = document.getElementById('multiOverlayAdd');
    if (btn && btn.parentElement) btn.parentElement.removeChild(btn);
  }

  function playChannelInTile(channel, idx) {
    if (!tiles[idx]) return;
    // embed youtube inside tile if necessary
    if (channel.url && channel.url.includes('youtube.com')) {
      const {video} = tiles[idx];
      // remove any iframe existing
      let iframe = video.parentElement.querySelector('iframe.youtube-frame');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.className = 'youtube-frame';
        iframe.style.position = 'absolute';
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = '0';
        iframe.allow = 'autoplay; encrypted-media';
        video.parentElement.appendChild(iframe);
      }
      const vidId = channel.url.split('v=')[1] || '';
      iframe.src = 'https://www.youtube.com/embed/' + vidId + '?autoplay=1';
      tiles[idx].channel = channel;
      return;
    }
    tiles[idx].channel = channel;
    nowPlaying.textContent = `Tile ${idx+1}: ${channel.name}`;
    const {video, hls: oldHls} = tiles[idx];
    if (oldHls) { try { oldHls.destroy(); } catch(e){} }
    let newHls = null;
    if (channel.url && channel.url.includes('.m3u8')) {
      if (Hls.isSupported()) {
        newHls = new Hls({ enableWorker: true, autoStartLoad: true });
        newHls.loadSource(channel.url);
        newHls.attachMedia(video);
        newHls.on(Hls.Events.MANIFEST_PARSED, function() {
          video.play().catch(()=>{});
        });
        newHls.on(Hls.Events.ERROR, function(event,data){
          console.warn('HLS error in tile', idx, data);
          if (data.fatal) {
            try { newHls.recoverMediaError(); } catch(e){}
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = channel.url;
        video.addEventListener('loadedmetadata', function h() {
          video.removeEventListener('loadedmetadata', h);
          video.play().catch(()=>{});
        });
      }
    } else {
      video.src = channel.url;
      video.play().catch(()=>{});
    }
    tiles[idx].hls = newHls;
  }

  /* ---------------------------
     Player & hls.js integration
  ----------------------------*/
  function playChannel(channel) {
    // if the source is a YouTube link, embed via iframe
    if (channel.url && channel.url.includes('youtube.com')) {
      const container = videoPlayer.parentElement;
      // remove existing hls or src
      try { if (hls) { hls.destroy(); hls = null; } } catch(e){}
      videoPlayer.src = '';
      // remove any existing iframe
      let iframe = container.querySelector('iframe.youtube-frame');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.className = 'youtube-frame';
        iframe.style.position = 'absolute';
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = '0';
        iframe.allow = 'autoplay; encrypted-media';
        container.appendChild(iframe);
      }
      const vidId = channel.url.split('v=')[1] || '';
      const embedUrl = 'https://www.youtube.com/embed/' + vidId + '?autoplay=1';
      iframe.src = embedUrl;
      showStatus(`Playing ${channel.name}`, 'info', 3000);
      return;
    }
    if (multiMode) {
      playChannelInTile(channel, activeTileIndex);
      return;
    }
    // set active channel state for single player
    currentChannelId = channel.id || null;
    currentChannelIndex = resolveChannelIndex(channel);
    retryCount = 0;
    activePlaybackToken++;
    handledFailureToken = -1;

    nowPlaying.textContent = `Now Playing: ${channel.name}`;
    if (hls) {
      try { hls.destroy(); } catch(e){}
      hls = null;
    }
    
    populateQualitySelector([]);

    if (channel.url && channel.url.includes('.m3u8')) {
      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          autoStartLoad: true
        });
        hls.loadSource(channel.url);
        hls.attachMedia(videoPlayer);

        hls.on(Hls.Events.MANIFEST_PARSED, function() {
          const levels = hls.levels || [];
          const qualities = levels.map(l => (l.height ? `${l.height}p` : `${l.bitrate || 'unknown'}bps`));
          populateQualitySelector(qualities);
          videoPlayer.play().catch(()=>{});
        });

        hls.on(Hls.Events.LEVEL_UPDATED, () => {
          const levels = hls.levels || [];
          const qualities = levels.map(l => (l.height ? `${l.height}p` : `${l.bitrate || 'unknown'}bps`));
          populateQualitySelector(qualities);
        });

        hls.on(Hls.Events.ERROR, function(event, data) {
          console.warn('HLS error', data);
          if (data.fatal) {
            showStatus('Playback error: ' + data.type, 'error');
            try {
              hls.recoverMediaError();
            } catch(e){}
          }
        });
      } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
        videoPlayer.src = channel.url;
        videoPlayer.addEventListener('loadedmetadata', function() {
          videoPlayer.play();
        }, { once: true });
      } else {
        showStatus('HLS not supported in this browser', 'error');
      }
    } else {
      videoPlayer.src = channel.url;
      videoPlayer.load();
      videoPlayer.play().catch(()=>{});
    }
  }

  function playVideo() { videoPlayer.play().catch(()=>{}); }
  function pauseVideo() { videoPlayer.pause(); }
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      videoPlayer.requestFullscreen().catch(err => console.log('Fullscreen error', err));
    } else document.exitFullscreen();
  }

  function populateQualitySelector(qualities) {
    qualitySelector.innerHTML = '<option value="auto">Auto</option>';
    qualities.forEach((q, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = q;
      qualitySelector.appendChild(opt);
    });
    qualitySelector.style.display = qualities.length ? 'inline-block' : 'none';
  }

  function onQualityChange() {
    const val = qualitySelector.value;
    if (!hls) return;
    if (val === 'auto') {
      hls.currentLevel = -1;
      showStatus('Quality set to Auto', 'success');
    } else {
      const lvl = parseInt(val,10);
      if (!isNaN(lvl)) {
        hls.currentLevel = lvl;
        showStatus('Quality changed', 'success');
      }
    }
  }

  /* ---------------------------
     URL testing & loading
  ----------------------------*/
  async function testUrl() {
    const url = playlistUrl.value.trim();
    if (!url) {
      showInlineStatus('Please enter a URL', 'error', urlStatus);
      return;
    }
    const proxyOption = document.querySelector('input[name="proxyOption"]:checked').value;
    let testUrl = url;
    try {
      if (proxyOption !== 'direct') {
        // Always use the latest custom proxy value from input
        const proxyUrl = (proxyOption === 'custom')
          ? customProxyUrlInput.value.trim()
          : CORS_PROXIES[proxyOption];
        if (!proxyUrl) throw new Error('Proxy URL not configured');
        testUrl = proxyUrl + encodeURIComponent(url);
      }
      showInlineStatus('Testing URL...', 'warning', urlStatus);
      testUrlBtn.disabled = true; loadUrlBtn.disabled = true;
      const resp = await fetch(testUrl, { method: 'GET' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      showInlineStatus('✅ URL is accessible! You can now load the playlist.', 'success', urlStatus);
    } catch (err) {
      console.error('Test URL error', err);
      showInlineStatus('❌ Failed to access URL: ' + (err.message || err), 'error', urlStatus);
    } finally {
      testUrlBtn.disabled = false; loadUrlBtn.disabled = false;
    }
  }

  async function loadUrlPlaylist() {
    const url = playlistUrl.value.trim();
    if (!url) {
      showInlineStatus('Please enter a playlist URL', 'error', urlStatus);
      return;
    }
    const proxyOption = document.querySelector('input[name="proxyOption"]:checked').value;
    let fetchUrl = url;
    try {
      showInlineStatus('Loading playlist...', 'warning', urlStatus);
      loadUrlBtn.disabled = true; testUrlBtn.disabled = true;
      if (proxyOption !== 'direct') {
        // Always use the latest custom proxy value from input
        const proxyUrl = (proxyOption === 'custom')
          ? customProxyUrlInput.value.trim()
          : CORS_PROXIES[proxyOption];
        if (!proxyUrl) throw new Error('Proxy URL not configured');
        fetchUrl = proxyUrl + encodeURIComponent(url);
      }
      const resp = await fetch(fetchUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const content = await resp.text();
      if (!content.includes('#EXTM3U') && !content.includes('#EXTINF')) {
        throw new Error('This does not appear to be a valid M3U playlist');
      }
      const channels = parseM3UContent(content);
      const newPlaylist = {
        id: Date.now(),
        name: `Playlist from URL - ${new Date().toLocaleDateString()}`,
        date: new Date().toLocaleDateString(),
        channels
      };
      playlists.unshift(newPlaylist);
      await idbPut('playlists', newPlaylist);
      currentPlaylistId = newPlaylist.id;
      currentPlaylist = channels;
      renderGroups(currentPlaylist);
      renderPlaylistsUI();
      urlModal.style.display = 'none';
      document.body.style.overflow = 'auto';
      showStatus(`✅ Playlist loaded successfully with ${channels.length} channels`, 'success');
    } catch (err) {
      console.error('Load URL error', err);
      showInlineStatus(`❌ Failed to load playlist: ${err.message}`, 'error', urlStatus);
    } finally {
      loadUrlBtn.disabled = false; testUrlBtn.disabled = false;
    }
  }

  async function saveCustomProxy() {
    const url = customProxyUrlInput.value.trim();
    if (!url) {
      showInlineStatus('Please enter a custom proxy URL', 'error', urlStatus);
      return;
    }
    customProxyUrl = url;
    CORS_PROXIES.custom = url;
    await saveSetting('customProxyUrl', url);
    showInlineStatus('Custom proxy URL saved successfully', 'success', urlStatus);
  }

  function openUrlModal() {
    urlModal.style.display = 'flex';
    urlModal.setAttribute('aria-hidden','false');
    document.body.style.overflow = 'hidden';
    playlistUrl.focus();
  }
  
  function closeUrlModalFn() {
    urlModal.style.display = 'none';
    urlModal.setAttribute('aria-hidden','true');
    document.body.style.overflow = 'auto';
  }

  function openXtreamModal() {
    window.location.href = 'xtream.html';
  }

  function showStatus(message, type='success', timeout=4000) {
    const el = document.createElement('div');
    el.className = `status-message status-${type}`;
    el.innerHTML = `<i class="fas fa-${type==='success'?'check-circle': type==='warning'?'exclamation-triangle':'exclamation-circle'}" aria-hidden="true"></i><span>${escapeHtml(message)}</span>`;
    el.style.position = 'fixed'; el.style.top = '20px'; el.style.right = '20px'; el.style.zIndex = 1100; el.style.minWidth = '300px';
    document.body.appendChild(el);
    setTimeout(()=> el.remove(), timeout);
  }

  function showInlineStatus(message, type='success', container=urlStatus) {
    container.innerHTML = '';
    const s = document.createElement('div');
    s.className = `status-message status-${type}`;
    s.innerHTML = `<i class="fas fa-${type==='success'?'check-circle': type==='warning'?'exclamation-triangle':'exclamation-circle'}" aria-hidden="true"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(s);
  }

  function escapeHtml(s){ return (s+'').replace(/[&<>"']/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; }); }

  window.__streamtv_debug = { playlists, favorites };

})();