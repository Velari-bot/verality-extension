const VER_ID = 'verality-sidebar-panel';
let refreshInterval = null;

function debugLog(...args) {
  console.log('[Verality]', ...args);
}

/**
 * Safe message sender to handle "Extension context invalidated" errors
 */
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
        } else {
          console.warn('[Verality] Runtime error:', chrome.runtime.lastError.message);
        }
        return;
      }
      if (callback) callback(response);
    });
  } catch (err) {
    if (err.message.includes('context invalidated')) {
      handleInvalidatedContext();
    } else {
      console.error('[Verality] unexpected error:', err);
    }
  }
}

function handleInvalidatedContext() {
  debugLog('Extension context invalidated. Stopping refresh loop.');
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }

  const panel = document.getElementById(VER_ID);
  if (panel) {
    const statusLabel = document.getElementById('verality-live-status');
    if (statusLabel) {
      statusLabel.textContent = 'Extension Reloaded';
      statusLabel.parentElement.style.background = '#fee2e2';
      statusLabel.style.color = '#ef4444';
    }

    const actionArea = document.getElementById('verality-discovery-actions');
    if (actionArea) {
      actionArea.innerHTML = `
        <div class="error-container" style="padding: 15px; background: #fff1f2; border-radius: 12px; border: 1px solid #fecaca;">
          <p style="color: #be123c; font-weight: 800; margin-bottom: 5px;">Refresh Required</p>
          <p style="color: #e11d48; font-size: 11px; margin-bottom: 10px;">The extension was updated. Please refresh this page to continue.</p>
          <button onclick="window.location.reload()" class="verality-btn-primary" style="background: #e11d48; width: 100%;">Refresh Page</button>
        </div>
      `;
    }
  }
}

// Function to extract search query or context
function getSearchQuery() {
  const url = new URL(window.location.href);
  if (url.pathname === '/results') {
    return url.searchParams.get('search_query');
  }
  if (url.pathname === '/watch') {
    const videoTitle = document.querySelector('h1.ytd-video-primary-info-renderer, ytd-watch-metadata h1')?.innerText;
    return videoTitle || null;
  }
  return null;
}

// Function to inject the Verality panel into the sidebar
function injectVeralityUI() {
  const query = getSearchQuery();
  if (document.getElementById(VER_ID)) return;

  // 1. Try to find the standard YouTube sidebar containers
  let secondaryColumn = document.querySelector('ytd-search #secondary') ||
    document.querySelector('ytd-watch-flexy #secondary') ||
    document.querySelector('#secondary.ytd-watch-flexy');

  // 2. If no sidebar exists or it's hidden, find the primary content and force a sidebar layout
  if (!secondaryColumn || secondaryColumn.offsetWidth === 0) {
    const primary = document.querySelector('ytd-search #primary') ||
      document.querySelector('ytd-watch-flexy #primary') ||
      document.querySelector('#primary');

    if (primary && primary.parentElement) {
      debugLog('Sidebar column missing or hidden, forcing Verality host...');
      let customSec = primary.parentElement.querySelector('#verality-custom-secondary');
      if (!customSec) {
        customSec = document.createElement('div');
        customSec.id = 'verality-custom-secondary';
        customSec.style.width = '426px';
        customSec.style.marginLeft = '24px';
        customSec.style.flexShrink = '0';
        primary.parentElement.style.display = 'flex';
        primary.parentElement.appendChild(customSec);
      }
      secondaryColumn = customSec;
    }
  }

  if (!secondaryColumn) return;

  const container = document.createElement('div');
  container.id = VER_ID;
  container.className = 'verality-sidebar-card';
  container.innerHTML = `
    <div class="verality-panel-header">
      <div class="verality-brand">
        <img src="${chrome.runtime.getURL('public/icons/V.png')}" class="verality-logo-img" alt="V">
        <span class="verality-logo-text">Verality AI</span>
      </div>
      <div class="verality-status-indicator">
        <span class="pulse-dot"></span>
        <span id="verality-live-status" class="status-label">Live</span>
      </div>
    </div>
    <div class="verality-panel-body">
      <div class="discovery-header">
        <h2>Creator Discovery</h2>
        <p>Find the best creators for <span class="highlight">"${query || 'this niche'}"</span></p>
      </div>
      
    <div id="verality-discovery-actions" class="action-area">
      <div class="loading-state">
         <div class="verality-spinner"></div>
         <p class="auth-hint">Checking connection...</p>
      </div>
    </div>

      <div id="verality-results-container" class="results-area hidden">
        <div class="results-header">
          <div class="results-stats">
            <span id="creator-count">0</span> Creators Found
          </div>
          <button class="verality-btn-text">Export All</button>
        </div>
        <div id="verality-sidebar-results" class="sidebar-list"></div>
      </div>

      <div id="verality-loading-state" class="loading-area hidden">
        <div class="verality-spinner"></div>
        <p>Ranking best creators...</p>
      </div>
    </div>
  `;

  secondaryColumn.prepend(container);
  updateActionButtons(query);
}

let isUserAuthenticated = false;

function updateActionButtons(query) {
  const actionArea = document.getElementById('verality-discovery-actions');
  if (!actionArea) return;

  safeSendMessage({ action: 'GET_USER' }, (response) => {
    if (response && response.user) {
      if (isUserAuthenticated) return;
      isUserAuthenticated = true;

      actionArea.innerHTML = `
        <button id="verality-run-btn" class="verality-btn-primary">
          <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z"/></svg>
          Analyze Niche
        </button>
      `;
      document.getElementById('verality-run-btn').addEventListener('click', () => {
        startDiscovery(query || "creators");
      });
      document.getElementById('verality-live-status').textContent = 'Live';
    } else {
      isUserAuthenticated = false;
      actionArea.innerHTML = `
        <div class="auth-required-state">
          <p class="auth-hint">Advanced data requires connection</p>
          <button id="verality-auth-btn" class="verality-btn-primary">
            Connect Account
          </button>
        </div>
      `;
      document.getElementById('verality-auth-btn').addEventListener('click', () => {
        window.open('https://verality.io/extension-auth', '_blank');
      });
      document.getElementById('verality-live-status').textContent = 'Offline';
    }
  });
}

function startDiscovery(query) {
  debugLog('Starting discovery for:', query);
  const actionArea = document.getElementById('verality-discovery-actions');
  const loadingArea = document.getElementById('verality-loading-state');
  if (actionArea) actionArea.classList.add('hidden');
  if (loadingArea) loadingArea.classList.remove('hidden');

  safeSendMessage({ action: 'FETCH_CREATORS', query: query });
}

function handleError(error) {
  const loadingState = document.getElementById('verality-loading-state');
  if (!loadingState) return;

  if (error.includes('sign in') || error.includes('Session expired') || error.includes('UNAUTHENTICATED')) {
    isUserAuthenticated = false;
    loadingState.innerHTML = `
      <div class="error-container">
        <p class="error-text">Authentication Error</p>
        <p class="error-subtext">${error}</p>
        <button id="verality-auth-btn-err" class="verality-btn-primary" style="margin-top: 10px;">
          Connect Account
        </button>
      </div>
    `;
    const btn = document.getElementById('verality-auth-btn-err');
    if (btn) btn.addEventListener('click', () => {
      window.open('https://verality.io/extension-auth', '_blank');
    });
  } else {
    loadingState.innerHTML = `
      <div class="error-container">
        <p class="error-text">Request Failed</p>
        <p class="error-subtext">${error}</p>
        <button onclick="window.location.reload()" class="verality-btn-text" style="margin-top: 10px;">Try Refreshing</button>
      </div>
    `;
  }
}

function renderCreators(creators) {
  const listContainer = document.getElementById('verality-sidebar-results');
  const resultsContainer = document.getElementById('verality-results-container');
  const loadingState = document.getElementById('verality-loading-state');
  const countSpan = document.getElementById('creator-count');

  if (!listContainer) return;

  loadingState.classList.add('hidden');
  resultsContainer.classList.remove('hidden');
  countSpan.textContent = creators.length;

  listContainer.innerHTML = creators.map((c, i) => `
    <div class="sidebar-creator-item" style="animation-delay: ${i * 0.05}s">
      <div class="creator-pfp-container">
        <img src="${c.thumbnail}" class="creator-pfp" alt="${c.title}">
        <div class="rank-badge">${i + 1}</div>
      </div>
      <div class="creator-content">
        <div class="creator-name-row">
          <span class="creator-name">${c.title}</span>
          <div class="title-actions">
            ${c.email ? `<div class="email-indicator" title="Found: ${c.email}"><span class="status-dot green"></span></div>` : ''}
            <a href="https://youtube.com/channel/${c.channelId}" target="_blank" class="ext-link">
              <svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z"/></svg>
            </a>
          </div>
        </div>
        <div class="creator-metrics">
          <span>${formatNumber(c.subscriberCount)} subs</span>
          <span class="sep"></span>
          <span>${formatNumber(c.avgViews)} views</span>
        </div>
        <div class="creator-reason">
          <span class="reason-tag">${c.reason}</span>
        </div>
      </div>
    </div>
  `).join('');
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num;
}

// Observe URL changes
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(injectVeralityUI, 1500);
  }
}).observe(document, { subtree: true, childList: true });

// Background message listener
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'UPDATE_CREATORS') {
    if (message.error) handleError(message.error);
    else renderCreators(message.creators);
  }
});

// Periodic check loop
refreshInterval = setInterval(() => {
  if (!document.getElementById(VER_ID)) {
    injectVeralityUI();
  } else if (!isUserAuthenticated) {
    updateActionButtons(getSearchQuery());
  }
}, 3000);
