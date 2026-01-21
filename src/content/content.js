const VER_ID = 'verality-sidebar-panel';
let refreshInterval = null;
let lastSearchQuery = null;
let isUserAuthenticated = false;

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

  const isWatchPage = window.location.pathname === '/watch';
  const isSearchPage = window.location.pathname === '/results';

  debugLog('Page type:', { isWatchPage, isSearchPage });

  if (isWatchPage) {
    // Watch page - use existing #secondary sidebar
    const secondary = document.querySelector('#secondary.style-scope.ytd-watch-flexy, ytd-watch-flexy #secondary, #secondary');

    if (!secondary) {
      debugLog('Watch page sidebar not ready yet, waiting...');
      return;
    }

    debugLog('Injecting into watch page sidebar...');
    const container = createVeralityPanel();
    secondary.prepend(container);
    updateActionButtons();

  } else if (isSearchPage) {
    // Search page - create our own sidebar
    const primary = document.querySelector('ytd-search #primary, ytd-two-column-search-results-renderer #primary, #primary');

    if (!primary) {
      debugLog('Search page primary not ready yet, waiting...');
      return;
    }

    debugLog('Injecting custom sidebar on search page...');

    // Check if we already created a sidebar wrapper
    let sidebarWrapper = document.querySelector('.verality-custom-sidebar-wrapper');

    if (!sidebarWrapper) {
      // Create a flex container to hold primary + our sidebar
      const parent = primary.parentElement;
      sidebarWrapper = document.createElement('div');
      sidebarWrapper.className = 'verality-custom-sidebar-wrapper';
      sidebarWrapper.style.cssText = 'display: flex; gap: 24px; width: 100%; max-width: 1754px; margin: 0 auto;';

      // Wrap the primary content
      parent.insertBefore(sidebarWrapper, primary);
      sidebarWrapper.appendChild(primary);

      // Adjust primary width to make room for sidebar
      primary.style.flex = '1';
      primary.style.minWidth = '0';

      // Create sidebar container
      const sidebarContainer = document.createElement('div');
      sidebarContainer.className = 'verality-custom-sidebar';
      sidebarContainer.style.cssText = 'width: 402px; flex-shrink: 0;';
      sidebarWrapper.appendChild(sidebarContainer);
    }

    const sidebarContainer = document.querySelector('.verality-custom-sidebar');
    if (sidebarContainer && !document.getElementById(VER_ID)) {
      const container = createVeralityPanel();
      sidebarContainer.appendChild(container);
      updateActionButtons();
    }
  }
}

function createVeralityPanel() {
  const container = document.createElement('div');
  container.id = VER_ID;
  container.className = 'verality-sidebar-card';
  container.innerHTML = `
    <div class="verality-panel-header">
      <div class="verality-brand">
        <img src="${chrome.runtime.getURL('public/icons/V.png')}" class="verality-logo-img">
        <span class="verality-logo-text">Verality AI</span>
      </div>
      <div class="verality-header-actions">
        <div id="verality-credit-display" class="verality-credit-badge hidden">
          <span class="label">Credits</span>
          <span id="verality-credit-count" class="count">0</span>
        </div>
        <div class="verality-header-top-row">
          <div class="verality-status-indicator">
            <span class="pulse-dot"></span>
            <span id="verality-live-status" class="status-label">Checking...</span>
          </div>
          <button id="verality-signout-btn" class="verality-signout-btn hidden" title="Sign Out">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        </div>
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

  return container;
}

function switchView(view) {
  const actionArea = document.getElementById('verality-discovery-actions');
  const loadingArea = document.getElementById('verality-loading-state');
  const resultsArea = document.getElementById('verality-results-container');

  if (!actionArea || !loadingArea || !resultsArea) return;

  actionArea.classList.toggle('hidden', view !== 'actions');
  loadingArea.classList.toggle('hidden', view !== 'loading');
  resultsArea.classList.toggle('hidden', view !== 'results');
}

function updateActionButtons() {
  const actionArea = document.getElementById('verality-discovery-actions');
  const statusLabel = document.getElementById('verality-live-status');
  const signoutBtn = document.getElementById('verality-signout-btn');
  if (!actionArea) return;

  const currentQuery = getSearchQuery();
  const queryChanged = currentQuery !== lastSearchQuery;

  // If query changed, reset view and clear results
  if (queryChanged) {
    lastSearchQuery = currentQuery;
    switchView('actions');
    const list = document.getElementById('verality-sidebar-results');
    if (list) list.innerHTML = '';
  }

  if (isUserAuthenticated && document.getElementById('verality-run-btn') && !queryChanged) {
    return;
  }

  safeSendMessage({ action: 'GET_USER' }, (response) => {
    const creditDisplay = document.getElementById('verality-credit-display');
    const creditCount = document.getElementById('verality-credit-count');

    if (response && response.user) {
      isUserAuthenticated = true;
      statusLabel.textContent = 'Live';

      // Update Credits
      if (creditDisplay && creditCount) {
        creditCount.textContent = response.user.credits || '0';
        creditDisplay.classList.remove('hidden');
      }

      // Show sign-out button
      if (signoutBtn) {
        signoutBtn.classList.remove('hidden');
        signoutBtn.onclick = () => {
          if (confirm('Sign out of Verality extension?')) {
            safeSendMessage({ action: 'SIGN_OUT' }, () => {
              isUserAuthenticated = false;
              if (signoutBtn) signoutBtn.classList.add('hidden');
              updateActionButtons();
            });
          }
        };
      }

      actionArea.innerHTML = `
        <div class="discovery-header">
          <h2>Creator Discovery</h2>
          <p>Find the best creators for <span class="highlight">"${currentQuery || 'this niche'}"</span></p>
        </div>
        <button id="verality-run-btn" class="verality-btn-primary">Analyze Niche</button>
      `;
      document.getElementById('verality-run-btn').addEventListener('click', () => {
        startDiscovery(currentQuery || "creators");
      });
    } else {
      isUserAuthenticated = false;

      // Hide credits
      if (creditDisplay) creditDisplay.classList.add('hidden');

      // Hide sign-out button
      if (signoutBtn) signoutBtn.classList.add('hidden');

      const errorMsg = response?.error || 'Offline';
      statusLabel.textContent = errorMsg === 'UNAUTHENTICATED' ? 'Offline' : errorMsg;

      actionArea.innerHTML = `
        <div class="auth-required-state">
          <p class="auth-hint">Connect your Verality account</p>
          <button id="verality-auth-btn" class="verality-btn-primary">Connect Extension</button>
          <p style="font-size: 11px; color: #999; margin-top: 10px;">Opens connection page</p>
        </div>
      `;
      document.getElementById('verality-auth-btn').addEventListener('click', () => {
        window.open('http://localhost:3000/extension-connect', '_blank');
      });
    }
  });
}

function formatSubs(count) {
  if (!count) return '0';
  if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
  if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
  return count.toString();
}

function startDiscovery(query) {
  switchView('loading');
  safeSendMessage({ action: 'FETCH_CREATORS', query });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'UPDATE_CREATORS') {
    const list = document.getElementById('verality-sidebar-results');
    const load = document.getElementById('verality-loading-state');
    const res = document.getElementById('verality-results-container');

    if (message.error) {
      if (load) {
        load.innerHTML = `<p class="error-text">${message.error}</p><button id="verality-retry-btn" class="verality-btn-primary" style="margin-top: 10px; padding: 8px;">Retry</button>`;
        document.getElementById('verality-retry-btn').addEventListener('click', () => {
          updateActionButtons();
        });
      }
    } else {
      // 1. Update Credits Immediately if provided
      if (message.creditsRemaining !== undefined) {
        const creditCount = document.getElementById('verality-credit-count');
        const creditDisplay = document.getElementById('verality-credit-display');
        if (creditCount) creditCount.textContent = message.creditsRemaining;
        if (creditDisplay) creditDisplay.classList.remove('hidden');
      }

      // 2. Full UI Refresh to ensure everything is in sync
      updateActionButtons();

      if (!message.creators || message.creators.length === 0) {
        switchView('results');
        if (list) {
          list.innerHTML = `
          <div style="text-align: center; padding: 40px 20px;">
            <p style="font-weight:700; color:#1a1a1a;">No creators found for this search.</p>
            <button id="verality-reset-search-btn" class="verality-btn-primary" style="margin-top: 16px; width: auto; padding: 10px 24px;">Try again</button>
          </div>`;
          document.getElementById('verality-reset-search-btn').addEventListener('click', () => {
            updateActionButtons();
          });
        }
      } else {
        switchView('results');

        const count = message.creators.length;
        const headerHtml = `
        <div class="results-info">
          <span>${count} Creators Found</span>
          <a href="#" class="export-link" id="verality-export-btn">Export All</a>
        </div>
      `;

        if (list) {
          list.innerHTML = headerHtml + message.creators.map((c, index) => {
            const engPercent = (c.engagement_rate * 100).toFixed(1) + '% eng';
            const viewsFormatted = formatSubs(c.avg_views) + ' views';
            const subsFormatted = formatSubs(c.followers) + ' subs';

            return `
            <div class="sidebar-creator-item">
              <div class="creator-pfp-container">
                <img src="${c.picture || 'https://www.youtube.com/img/desktop/ftr/logo_yt_white.png'}" class="creator-pfp" onerror="this.src='https://www.youtube.com/img/desktop/ftr/logo_yt_white.png'">
                <div class="rank-badge">${index + 1}</div>
                ${c.email ? '<div class="email-found-dot"></div>' : ''}
              </div>
              <div class="creator-info">
                <div class="creator-name-header">
                  <div class="creator-name" title="${c.name || c.handle}">${c.name || c.handle}</div>
                  <a href="https://youtube.com/@${c.handle}" target="_blank" class="external-link">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                  </a>
                </div>
                <div class="creator-metrics-row">
                  <span>${subsFormatted}</span>
                  <div class="metric-dot"></div>
                  <span>${viewsFormatted}</span>
                  <div class="metric-dot"></div>
                  <span>${engPercent}</span>
                </div>
                <div class="insight-tag">${c.insight_tag || 'Top Match'}</div>
                ${c.email ? `
                  <div class="email-display">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                    <span>${c.email}</span>
                  </div>
                ` : ''}
              </div>
            </div>
          `;
          }).join('');

          document.getElementById('verality-export-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            alert('Exporting ' + count + ' creators to CSV...');
          });
        }
      }
    }
  } else if (message.action === 'AUTH_COMPLETE') {
    updateActionButtons();
  }
});

// YouTube is a Single Page App (SPA). We need to listen for site-navigation events
window.addEventListener('yt-navigate-finish', () => {
  debugLog('YouTube navigation detected');
  // Small delay to let the DOM settle
  setTimeout(updateActionButtons, 1000);
});

// Force check periodically as well
setInterval(() => {
  if (!document.getElementById(VER_ID)) {
    injectVeralityUI();
  } else {
    // Check if query changed even if panel exists
    updateActionButtons();
  }
}, 3000);
