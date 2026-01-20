const VER_ID = 'verality-sidebar-panel';
let refreshInterval = null;

function debugLog(...args) {
  console.log('[Verality]', ...args);
}

function safeSendMessage(message, callback) {
  try {
    if (!chrome.runtime?.id) {
      handleInvalidatedContext();
      return;
    }
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        if (chrome.runtime.lastError.message.includes('context invalidated')) {
          handleInvalidatedContext();
        }
        return;
      }
      if (callback) callback(response);
    });
  } catch (err) {
    if (err.message.includes('context invalidated')) handleInvalidatedContext();
  }
}

function handleInvalidatedContext() {
  if (refreshInterval) clearInterval(refreshInterval);
  const actionArea = document.getElementById('verality-discovery-actions');
  if (actionArea) {
    actionArea.innerHTML = `<button onclick="window.location.reload()" class="verality-btn-primary" style="background: #ef4444;">Refresh Required</button>`;
  }
}

function getSearchQuery() {
  const url = new URL(window.location.href);
  return url.searchParams.get('search_query') ||
    document.querySelector('h1.ytd-video-primary-info-renderer, ytd-watch-metadata h1')?.innerText ||
    null;
}

function injectVeralityUI() {
  if (document.getElementById(VER_ID)) return;

  const secondary = document.querySelector('ytd-search #secondary, ytd-watch-flexy #secondary, #secondary');
  const primary = document.querySelector('ytd-search #primary, ytd-watch-flexy #primary, #primary');

  if (!primary) return;

  debugLog('Injecting Sidebar...');

  const container = document.createElement('div');
  container.id = VER_ID;
  container.className = 'verality-sidebar-card';
  container.innerHTML = `
    <div class="verality-panel-header">
      <div class="verality-brand">
        <img src="${chrome.runtime.getURL('public/icons/V.png')}" class="verality-logo-img">
        <span class="verality-logo-text">Verality AI</span>
      </div>
      <div class="verality-status-indicator">
        <span class="pulse-dot"></span>
        <span id="verality-live-status" class="status-label">Checking...</span>
      </div>
    </div>
    <div id="verality-discovery-actions" class="verality-panel-body">
      <div class="loading-state">
         <div class="verality-spinner"></div>
         <p class="auth-hint">Syncing connection...</p>
      </div>
    </div>
    <div id="verality-results-container" class="verality-panel-body hidden">
       <div id="verality-sidebar-results" class="sidebar-list"></div>
    </div>
    <div id="verality-loading-state" class="verality-panel-body hidden">
        <div class="verality-spinner"></div>
        <p>Ranking creators...</p>
    </div>
  `;

  if (secondary && secondary.offsetWidth > 0) {
    secondary.prepend(container);
  } else {
    container.style.maxWidth = '400px';
    container.style.marginBottom = '20px';
    primary.prepend(container);
  }

  updateActionButtons();
}

let isUserAuthenticated = false;

function updateActionButtons() {
  const actionArea = document.getElementById('verality-discovery-actions');
  const statusLabel = document.getElementById('verality-live-status');
  if (!actionArea) return;

  safeSendMessage({ action: 'GET_USER' }, (response) => {
    if (response && response.user) {
      if (isUserAuthenticated) return;
      isUserAuthenticated = true;
      statusLabel.textContent = 'Live';
      actionArea.innerHTML = `
        <div class="discovery-header">
          <h2>Creator Discovery</h2>
          <p>Analyzing <span class="highlight">"${getSearchQuery() || 'this niche'}"</span></p>
        </div>
        <button id="verality-run-btn" class="verality-btn-primary">Analyze Niche</button>
      `;
      document.getElementById('verality-run-btn').addEventListener('click', () => {
        startDiscovery(getSearchQuery() || "creators");
      });
    } else {
      isUserAuthenticated = false;
      const errorMsg = response?.error || 'Offline';
      statusLabel.textContent = errorMsg === 'UNAUTHENTICATED' ? 'Offline' : errorMsg;

      actionArea.innerHTML = `
        <div class="auth-required-state">
          <p class="auth-hint">Log in to verality.io to use the extension</p>
          <button id="verality-auth-btn" class="verality-btn-primary">Log in to Verality</button>
          <p style="font-size: 11px; color: #999; margin-top: 10px;">After logging in, refresh this page</p>
        </div>
      `;
      document.getElementById('verality-auth-btn').addEventListener('click', () => {
        window.open('http://localhost:3000/login', '_blank');
      });
    }
  });
}

function startDiscovery(query) {
  document.getElementById('verality-discovery-actions').classList.add('hidden');
  document.getElementById('verality-loading-state').classList.remove('hidden');
  safeSendMessage({ action: 'FETCH_CREATORS', query });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'UPDATE_CREATORS') {
    const list = document.getElementById('verality-sidebar-results');
    const load = document.getElementById('verality-loading-state');
    const res = document.getElementById('verality-results-container');
    if (message.error) {
      load.innerHTML = `<p class="error-text">${message.error}</p><button onclick="window.location.reload()">Retry</button>`;
    } else {
      load.classList.add('hidden');
      res.classList.remove('hidden');
      list.innerHTML = message.creators.map(c => `<div class="sidebar-creator-item"><b>${c.title}</b><br>${c.subscriberCount} subs</div>`).join('');
    }
  } else if (message.action === 'AUTH_COMPLETE') {
    updateActionButtons();
  }
});

setInterval(() => {
  if (!document.getElementById(VER_ID)) injectVeralityUI();
  else if (!isUserAuthenticated) updateActionButtons();
}, 3000);
