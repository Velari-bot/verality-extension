document.addEventListener('DOMContentLoaded', () => {
    updateUI();

    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            window.open('https://verality.io/extension-auth', '_blank');
        });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            chrome.storage.local.remove(['extension_token'], () => {
                updateUI();
            });
        });
    }

    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset the extension? This will clear all settings.')) {
                chrome.runtime.sendMessage({ action: 'CLEAR_STORAGE' }, () => {
                    window.location.reload();
                });
            }
        });
    }
});

function updateUI() {
    chrome.runtime.sendMessage({ action: 'GET_USER' }, (response) => {
        const unauthView = document.getElementById('unauth-view');
        const authView = document.getElementById('auth-view');
        const statusText = document.querySelector('.status-text');
        const statusBadge = document.getElementById('auth-status');
        const logoutBtn = document.getElementById('logout-btn');

        if (response && response.user) {
            // Logged In
            authView.classList.remove('hidden');
            unauthView.classList.add('hidden');
            logoutBtn.classList.remove('hidden');

            if (statusBadge) statusBadge.className = 'status-badge connected';
            if (statusText) statusText.textContent = 'Connected';

            document.getElementById('user-email').textContent = response.user.email;
            document.getElementById('user-plan').textContent = response.user.plan || 'Free';
            document.getElementById('credit-count').textContent = response.user.credits || '0';
        } else {
            // Logged Out
            authView.classList.add('hidden');
            unauthView.classList.remove('hidden');
            logoutBtn.classList.add('hidden');

            if (statusBadge) statusBadge.className = 'status-badge';
            if (statusText) statusText.textContent = response?.error === 'UNAUTHENTICATED' ? 'Disconnected' : (response?.error || 'Disconnected');
        }
    });

    // Show API version/base in console for debugging
    chrome.storage.local.get(['api_base_url'], (res) => {
        console.log('Verality API Base:', res.api_base_url || 'https://verality.io');
    });
}
