/**
 * Verality Popup Logic
 */

const API_BASE_URL = 'https://verality.io';

document.addEventListener('DOMContentLoaded', () => {
    const unauthView = document.getElementById('unauth-view');
    const authView = document.getElementById('auth-view');
    const authStatus = document.getElementById('auth-status');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userEmail = document.getElementById('user-email');
    const userPlan = document.getElementById('user-plan');
    const creditCount = document.getElementById('credit-count');

    function checkAuth() {
        chrome.runtime.sendMessage({ action: 'GET_USER' }, (response) => {
            if (response && response.user) {
                // Authenticated
                showView('auth');
                userEmail.textContent = response.user.email;
                userPlan.textContent = response.user.plan.toUpperCase();
                creditCount.textContent = response.user.credits;
                authStatus.querySelector('.status-text').textContent = 'Connected';
                authStatus.querySelector('.pulse-dot').style.backgroundColor = '#10b981';
            } else {
                // Unauthenticated
                showView('unauth');
                authStatus.querySelector('.status-text').textContent = 'Disconnected';
                authStatus.querySelector('.pulse-dot').style.backgroundColor = '#ef4444';
            }
        });
    }

    function showView(view) {
        if (view === 'auth') {
            authView.classList.remove('hidden');
            unauthView.classList.add('hidden');
            logoutBtn.classList.remove('hidden');
        } else {
            unauthView.classList.remove('hidden');
            authView.classList.add('hidden');
            logoutBtn.classList.add('hidden');
        }
    }

    loginBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: `${API_BASE_URL}/extension-auth` });
    });

    logoutBtn.addEventListener('click', () => {
        chrome.storage.local.remove('extension_token', () => {
            checkAuth();
        });
    });

    checkAuth();
});
