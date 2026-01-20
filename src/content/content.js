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
          <p class="auth-hint">Sign in to discover creators</p>
          <button id="verality-auth-btn" class="verality-btn-primary">
            <svg width="18" height="18" viewBox="0 0 18 18" style="margin-right: 8px;">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9.003 18c2.43 0 4.467-.806 5.956-2.18L12.05 13.56c-.806.54-1.837.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9.003 18z" fill="#34A853"/>
              <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.426 0 9.003 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>
        </div>
      `;
      document.getElementById('verality-auth-btn').addEventListener('click', () => {
        safeSendMessage({ action: 'START_GOOGLE_AUTH' });
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
