document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const resetBtn = document.getElementById('reset-btn');
    const authStatus = document.getElementById('auth-status');
    const statusText = authStatus.querySelector('.status-text');
    const unauthView = document.getElementById('unauth-view');
    const authView = document.getElementById('auth-view');
    const userEmail = document.getElementById('user-email');
    const userPlan = document.getElementById('user-plan');
    const creditCount = document.getElementById('credit-count');
    const accessLevel = document.getElementById('access-level');

    function updateUI(state) {
        if (state.user) {
            // User is authenticated
            unauthView.classList.add('hidden');
            authView.classList.remove('hidden');
            logoutBtn.classList.remove('hidden');

            statusText.textContent = 'Connected';
            userEmail.textContent = state.user.email || 'user@email.com';
            userPlan.textContent = (state.user.plan || 'free').toUpperCase();
            creditCount.textContent = state.user.credits || '0';
            accessLevel.textContent = state.user.plan === 'pro' ? 'Full' : 'Limited';
        } else {
            // User is not authenticated
            unauthView.classList.remove('hidden');
            authView.classList.add('hidden');
            logoutBtn.classList.add('hidden');

            statusText.textContent = state.error === 'UNAUTHENTICATED' ? 'Not Connected' : (state.error || 'Offline');
        }
    }

    // Check current auth status on load
    chrome.runtime.sendMessage({ action: 'GET_USER' }, (response) => {
        console.log('[Popup] Auth check response:', response);
        updateUI(response || {});
    });

    // Login button - opens connection page
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: 'http://localhost:3000/extension-connect' });
        });
    }

    // Logout button
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Sign out of Verality extension?')) {
                chrome.runtime.sendMessage({ action: 'SIGN_OUT' }, () => {
                    console.log('[Popup] Signed out');
                    updateUI({});
                });
            }
        });
    }

    // Hard reset button (for debugging)
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('Clear all extension data? This will sign you out.')) {
                chrome.runtime.sendMessage({ action: 'CLEAR_STORAGE' }, () => {
                    console.log('[Popup] Storage cleared');
                    statusText.textContent = 'Storage cleared';
                    updateUI({});
                });
            }
        });
    }

    // Listen for auth updates from content script
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'AUTH_COMPLETE') {
            console.log('[Popup] Auth completed, refreshing UI');
            chrome.runtime.sendMessage({ action: 'GET_USER' }, (response) => {
                updateUI(response || {});
            });
        }
    });
});
