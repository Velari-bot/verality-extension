document.addEventListener('DOMContentLoaded', () => {
    const authBtn = document.getElementById('auth-btn');
    const statusDiv = document.getElementById('status');
    const userInfo = document.getElementById('user-info');
    const resetBtn = document.getElementById('reset-btn');

    function updateUI(state) {
        if (state.user) {
            authBtn.style.display = 'none';
            statusDiv.textContent = `Signed in as ${state.user.email}`;
            userInfo.innerHTML = `
                <p><strong>Credits:</strong> ${state.user.credits || 0}</p>
                <p><strong>Plan:</strong> ${state.user.plan || 'free'}</p>
            `;
        } else {
            authBtn.style.display = 'block';
            statusDiv.textContent = state.error || 'Not signed in';
            userInfo.innerHTML = '';
        }
    }

    // Check current auth status
    chrome.runtime.sendMessage({ action: 'GET_USER' }, (response) => {
        updateUI(response || {});
    });

    // Connect button
    authBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'START_GOOGLE_AUTH' });
    });

    // Hard reset button
    resetBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'CLEAR_STORAGE' }, () => {
            statusDiv.textContent = 'Storage cleared';
            userInfo.innerHTML = '';
            authBtn.style.display = 'block';
        });
    });
});
