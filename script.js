/* =====================================================================
   STREAMTV: Enhanced Single-File HTML
   - Replaces localStorage with IndexedDB (robust for big playlists)
   - Improved hls.js integration with real quality switching
   - Paginated group rendering ("Load more") to avoid huge DOM
   - Accessibility improvements (aria, keyboard)
   - Comments include example proxy implementations (PHP & Node)
   ===================================================================== */

(function(){
  'use strict';

  /* ---------------------------
     IndexedDB helper (simple promisified wrapper)
     Stores:
       - playlists (object store)
       - favs (single record)
       - settings (customProxy)
     Key design:
       - playlists store: keyPath = id (timestamp)
  ----------------------------*/
  const IDB_DB = 'streamtv-db-v1';
  const IDB_VERSION = 1;
  const IDB_STORES = ['playlists','settings','favorites'];

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_DB, IDB_VERSION);
      req.onupgradeneeded = function(e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('playlists')) {
          db.createObjectStore('playlists', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('favorites')) {
          db.createObjectStore('favorites', { keyPath: 'key' });
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
  let playlists = []; // loaded from IDB
  let favorites = []; // array of channelIds
  let currentPlaylistId = null;
  let currentPlaylist = [];
  let currentCategory = 'all';
  let hls = null;
  let customProxyUrl = null;
  const CHANNEL_RENDER_BATCH = 60; // cantidad por "paginación" en cada grupo

  /* ---------------------------
     DOM references
  ----------------------------*/
  const videoPlayer = document.getElementById('videoPlayer');
  const playBtn = document.getElementById('playBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const qualitySelector = document.getElementById('qualitySelector');
  const nowPlaying = document.getElementById('nowPlaying');
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

  /* ---------------------------
     Default CORS proxies (UI only)
     Nota: es recomendable montar tu propio proxy (ver comentarios abajo)
  ----------------------------*/
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
  document.addEventListener('DOMContentLoaded', async () => {
    await loadStateFromIDB();
    setupEventListeners();
    renderPlaylistsUI();
    if (currentPlaylistId) {
      const p = playlists.find(x => x.id === currentPlaylistId);
      if (p) {
        currentPlaylist = p.channels || [];
        renderGroups(currentPlaylist);
      }
    }
    // init custom proxy input if exists
    const s = await idbGet('settings', 'customProxyUrl');
    if (s && s.value) {
      customProxyUrl = s.value;
      CORS_PROXIES.custom = customProxyUrl;
      customProxyUrlInput.value = customProxyUrl;
    }
  });

  /* ---------------------------
     Load/Save state in IDB
  ----------------------------*/
  async function loadStateFromIDB() {
    playlists = await idbGetAll('playlists') || [];
    // idbGetAll returns array of playlist objects
    // Order newest first (id is timestamp)
    playlists.sort((a,b)=>b.id - a.id);
    const favRecord = await idbGet('favorites', 'favlist');
    favorites = (favRecord && favRecord.channels) ? favRecord.channels : [];
    // pick first playlist as current if not set
    if (playlists.length > 0 && !currentPlaylistId) {
      currentPlaylistId = playlists[0].id;
    }
  }

  async function savePlaylistsToIDB() {
    // Save each playlist object individually
    for (const pl of playlists) {
      await idbPut('playlists', pl);
    }
  }

  async function saveFavoritesToIDB() {
    await idbPut('favorites', { key: 'favlist', channels: favorites });
  }

  async function saveSetting(key, value) {
    await idbPut('settings', { key, value });
  }

  /* ---------------------------
     Event listeners
  ----------------------------*/
  function setupEventListeners() {
    // Mobile menu
    mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    
    // Player controls
    playBtn.addEventListener('click', playVideo);
    pauseBtn.addEventListener('click', pauseVideo);
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    qualitySelector.addEventListener('change', onQualityChange);

    // Upload
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('keydown', e => { if (e.key === 'Enter') fileInput.click(); });
    uploadBtn.addEventListener('click', () => fileInput.click());
    addPlaylistBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);

    // URL Modal
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

    // Search
    searchInput.addEventListener('input', filterChannels);

    // Categories
    categoryTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        categoryTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentCategory = tab.dataset.category;
        renderGroups(currentPlaylist);
      });
      tab.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') tab.click(); });
    });

    // Global keyboard
    document.addEventListener('keydown', globalKeyHandler);
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('drop', handleFileDrop);
  }

  /* ---------------------------
     Mobile Menu
  ----------------------------*/
  function toggleMobileMenu() {
    mobileMenuBtn.classList.toggle('active');
    navLinks.classList.toggle('active');
    const isExpanded = mobileMenuBtn.getAttribute('aria-expanded') === 'true';
    mobileMenuBtn.setAttribute('aria-expanded', !isExpanded);
  }

  /* ---------------------------
     Keyboard global handler
  ----------------------------*/
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
    // reset input so same file can be reselected
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
      // save each playlist individually to IDB
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
        // parse common attributes
        const nameSplit = info.split(',');
        const name = nameSplit.slice(1).join(',').trim() || `Channel ${channels.length+1}`;
        currentChannel = {
          id: Date.now() + channels.length, // unique-ish
          name: name,
          group: 'General',
          url: '',
          logo: 'https://via.placeholder.com/30x30/3498db/ffffff?text=TV',
          resolution: 'HD',
          isFavorite: false
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
          // In case file has raw URLs without EXTINF
          channels.push({
            id: Date.now() + channels.length,
            name: `Channel ${channels.length+1}`,
            group: 'General',
            url: line,
            logo: 'https://via.placeholder.com/30x30/3498db/ffffff?text=TV',
            resolution: 'HD',
            isFavorite: false
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
    // delete from IDB and from array
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
     Render groups and channels (paginated per group)
     Strategy: For each group render first N channels and add "Load more" button to append next N.
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
    if (currentCategory === 'favorites') {
      filtered = channels.filter(ch => favorites.includes(ch.tempId || ch.id));
    } else if (currentCategory !== 'all') {
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

    // Group by group-name
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

      // Keep an internal pointer for pagination
      let offset = 0;
      function renderBatch() {
        const slice = groupChannels.slice(offset, offset + CHANNEL_RENDER_BATCH);
        slice.forEach(ch => {
          const chEl = document.createElement('div');
          chEl.className = 'channel-item';
          chEl.tabIndex = 0;
          chEl.innerHTML = `
            <img src="${escapeHtml(ch.logo||'https://via.placeholder.com/30x30/3498db/ffffff?text=TV')}" alt="${escapeHtml(ch.name)}" class="channel-logo">
            <div class="channel-info">
              <div class="channel-name">${escapeHtml(ch.name)}</div>
              <div class="channel-resolution">${escapeHtml(ch.resolution || 'HD')}</div>
            </div>
            <button class="favorite-btn ${favorites.includes(ch.tempId || ch.id) ? 'active' : ''}" data-id="${ch.tempId || ch.id}" aria-label="Toggle favorite">
              <i class="${favorites.includes(ch.tempId || ch.id) ? 'fas' : 'far'} fa-heart" aria-hidden="true"></i>
            </button>
          `;
          // click to play (unless favorite button clicked)
          chEl.addEventListener('click', (e) => {
            if (e.target.closest('.favorite-btn')) return;
            playChannel(ch);
            // mark active UI
            channelsListEl.querySelectorAll('.channel-item.active').forEach(i=>i.classList.remove('active'));
            chEl.classList.add('active');
          });
          chEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') chEl.click();
          });

          // favorite toggle
          const favBtn = chEl.querySelector('.favorite-btn');
          favBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const cid = favBtn.dataset.id;
            toggleFavorite(cid);
            favBtn.classList.toggle('active');
            favBtn.innerHTML = `<i class="${favorites.includes(cid) ? 'fas' : 'far'} fa-heart" aria-hidden="true"></i>`;
          });

          channelsListEl.appendChild(chEl);
        });

        offset += slice.length;
        // add load more if remaining
        const remaining = groupChannels.length - offset;
        // remove existing load-more
        const existingLoadMore = channelsListEl.querySelector('.load-more');
        if (existingLoadMore) existingLoadMore.remove();
        if (remaining > 0) {
          const lm = document.createElement('button');
          lm.className = 'btn btn-outline load-more';
          lm.textContent = `Load more (${remaining})`;
          lm.addEventListener('click', () => renderBatch());
          channelsListEl.appendChild(lm);
        }
      }

      // Expand/collapse group
      const header = groupItem.querySelector('.group-header');
      header.addEventListener('click', () => {
        const isActive = groupItem.classList.toggle('active');
        header.setAttribute('aria-expanded', isActive ? 'true' : 'false');
        if (isActive && channelsListEl.children.length === 0) {
          renderBatch();
        }
      });
      header.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') header.click(); });

      // Append group
      groupsList.appendChild(groupItem);
    });
  }

  /* ---------------------------
     Favorites handling
  ----------------------------*/
  async function toggleFavorite(channelId) {
    const idx = favorites.indexOf(channelId);
    if (idx > -1) favorites.splice(idx,1);
    else favorites.push(channelId);
    await saveFavoritesToIDB();
  }

  /* ---------------------------
     Search/filter
  ----------------------------*/
  function filterChannels() {
    const term = searchInput.value.trim().toLowerCase();
    if (!term) {
      renderGroups(currentPlaylist);
      return;
    }
    const filtered = currentPlaylist.filter(ch => (ch.name || '').toLowerCase().includes(term));
    renderGroups(filtered);
  }

  /* ---------------------------
     Player & hls.js integration
  ----------------------------*/
  function playChannel(channel) {
    nowPlaying.textContent = `Now Playing: ${channel.name}`;
    if (hls) {
      try { hls.destroy(); } catch(e){}
      hls = null;
    }
    // Clean quality selector
    populateQualitySelector([]);

    // if HLS (.m3u8)
    if (channel.url && channel.url.includes('.m3u8')) {
      if (Hls.isSupported()) {
        hls = new Hls({
          // enable worker for performance
          enableWorker: true,
          // autoStartLoad true for autoplaying playlists
          autoStartLoad: true
        });
        hls.loadSource(channel.url);
        hls.attachMedia(videoPlayer);

        hls.on(Hls.Events.MANIFEST_PARSED, function() {
          // populate quality selector with available levels
          const levels = hls.levels || [];
          const qualities = levels.map(l => (l.height ? `${l.height}p` : `${l.bitrate || 'unknown'}bps`));
          populateQualitySelector(qualities);
          videoPlayer.play().catch(()=>{ /* ignore autoplay block */ });
        });

        // update selector if levels updated
        hls.on(Hls.Events.LEVEL_UPDATED, () => {
          const levels = hls.levels || [];
          const qualities = levels.map(l => (l.height ? `${l.height}p` : `${l.bitrate || 'unknown'}bps`));
          populateQualitySelector(qualities);
        });

        hls.on(Hls.Events.ERROR, function(event, data) {
          console.warn('HLS error', data);
          if (data.fatal) {
            showStatus('Playback error: ' + data.type, 'error');
            // attempt recover for network errors
            try {
              hls.recoverMediaError();
            } catch(e){}
          }
        });
      } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
        // native HLS (Safari)
        videoPlayer.src = channel.url;
        videoPlayer.addEventListener('loadedmetadata', function() {
          videoPlayer.play();
        }, { once: true });
      } else {
        showStatus('HLS not supported in this browser', 'error');
      }
    } else {
      // normal progressive stream
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

  /* Populate quality selector with levels; choose handler to set level */
  function populateQualitySelector(qualities) {
    // Clear existing, keep Auto option
    qualitySelector.innerHTML = '<option value="auto">Auto</option>';
    qualities.forEach((q, idx) => {
      const opt = document.createElement('option');
      opt.value = idx; // level index for hls
      opt.textContent = q;
      qualitySelector.appendChild(opt);
    });
    // show/hide selector based on availability
    qualitySelector.style.display = qualities.length ? 'inline-block' : 'none';
  }

  function onQualityChange() {
    const val = qualitySelector.value;
    if (!hls) return;
    if (val === 'auto') {
      hls.currentLevel = -1; // auto
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
     URL testing & loading (with proxy options)
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
        const proxyUrl = (proxyOption === 'custom') ? customProxyUrl : CORS_PROXIES[proxyOption];
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
        const proxyUrl = (proxyOption === 'custom') ? customProxyUrl : CORS_PROXIES[proxyOption];
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

  /* ---------------------------
     Custom proxy saving
  ----------------------------*/
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

  /* ---------------------------
     Modal open/close
  ----------------------------*/
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

  /* ---------------------------
     Utility: show status
  ----------------------------*/
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

  /* ---------------------------
     Escape HTML utility
  ----------------------------*/
  function escapeHtml(s){ return (s+'').replace(/[&<>"']/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; }); }

  /* ======================================================================
     PROXY EXAMPLES (copy these to your server). They are comments in runtime
     but here they are published for your convenience.

     PHP proxy (simple):
     -------------------
     <?php
     // proxy.php
     if (!isset($_GET['url'])) { http_response_code(400); echo 'No url'; exit; }
     $url = $_GET['url'];
     header('Access-Control-Allow-Origin: *');
     $ch = curl_init($url);
     curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
     curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
     curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (StreamTV Proxy)');
     $resp = curl_exec($ch);
     $info = curl_getinfo($ch);
     http_response_code($info['http_code'] ?? 200);
     foreach (['content-type','content-length'] as $h) {
       if (!empty($info[$h])) header($h.': '.$info[$h]);
     }
     echo $resp;
     ?>

     Node.js (Express) example:
     --------------------------
     // proxy.js
     const express = require('express');
     const fetch = require('node-fetch'); // or undici
     const app = express();
     app.get('/proxy', async (req,res)=>{
       const url = req.query.url;
       if (!url) return res.status(400).send('No url');
       try {
         const r = await fetch(url, { headers: { 'User-Agent': 'StreamTV-Proxy' }});
         r.headers.forEach((v,k)=> res.setHeader(k,v));
         res.status(r.status);
         r.body.pipe(res);
       } catch(err){
         res.status(502).send('Upstream error');
       }
     });
     app.listen(3000);

     IMPORTANT: Expose your proxy only to authorized users or add rate-limits and abuse protection.
     ====================================================================== */

  /* ---------------------------
     Small helper: sanitize for display in console/UI
  ----------------------------*/
  function safeLog(...args){ try { console.log(...args); } catch(e){} }

  /* Expose a quick debug method */
  window.__streamtv_debug = { playlists, favorites };

})();
