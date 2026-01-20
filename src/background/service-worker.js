/**
 * Verality Background Service Worker
 * Cookie-based session authentication
 */

let API_BASE_URL = 'http://localhost:3000';

chrome.storage.local.get(['api_base_url'], (res) => {
    if (res.api_base_url) API_BASE_URL = res.api_base_url;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'GET_USER') {
        checkSessionAndGetToken(sendResponse);
        return true;
    } else if (message.action === 'CLEAR_STORAGE') {
        chrome.storage.local.clear(() => {
            API_BASE_URL = 'http://localhost:3000';
            chrome.storage.local.set({ api_base_url: API_BASE_URL });
            sendResponse({ success: true });
        });
        return true;
    } else if (message.action === 'FETCH_CREATORS') {
        handleFetchCreators(message.query, sender.tab.id);
        sendResponse({ status: 'started' });
        return true;
    }
    return true;
});

async function checkSessionAndGetToken(sendResponse) {
    try {
        // First check if we have a stored token
        const storage = await chrome.storage.local.get(['extension_token', 'api_base_url']);
        const base = storage.api_base_url || API_BASE_URL;

        if (storage.extension_token) {
            // Verify existing token
            const verifyResponse = await fetch(`${base}/api/extension/me`, {
                headers: { 'Authorization': `Bearer ${storage.extension_token}` },
                credentials: 'include'
            });

            if (verifyResponse.ok) {
                const data = await verifyResponse.json();
                console.log('[Verality BG] Existing token valid:', data.email);
                sendResponse({ success: true, user: data });
                return;
            }
        }

        // No valid token, check if user is logged in via cookies
        console.log('[Verality BG] Checking session at:', base);
        const sessionResponse = await fetch(`${base}/api/extension/session`, {
            credentials: 'include' // Include cookies
        });

        if (sessionResponse.status === 401) {
            console.log('[Verality BG] Not logged in');
            sendResponse({ error: 'UNAUTHENTICATED', needsLogin: true });
            return;
        }

        if (!sessionResponse.ok) {
            console.error('[Verality BG] Session check failed:', sessionResponse.status);
            sendResponse({ error: 'Session check failed' });
            return;
        }

        const { token, user } = await sessionResponse.json();

        // Store the new token
        await chrome.storage.local.set({
            extension_token: token,
            api_base_url: base
        });

        console.log('[Verality BG] Got token from session:', user.email);

        // Verify it works
        const verifyResponse = await fetch(`${base}/api/extension/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (verifyResponse.ok) {
            const userData = await verifyResponse.json();
            sendResponse({ success: true, user: userData });
        } else {
            sendResponse({ error: 'Token verification failed' });
        }

    } catch (err) {
        console.error('[Verality BG] Error:', err);
        sendResponse({ error: err.message });
    }
}

async function handleFetchCreators(query, tabId) {
    try {
        const { extension_token, api_base_url } = await chrome.storage.local.get(['extension_token', 'api_base_url']);
        const base = api_base_url || API_BASE_URL;

        if (!extension_token) return;

        const response = await fetch(`${base}/api/extension/search`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${extension_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query, limit: 50, platform: 'youtube' })
        });

        if (response.ok) {
            const data = await response.json();
            chrome.tabs.sendMessage(tabId, { action: 'UPDATE_CREATORS', creators: data.results });
        }
    } catch (error) {
        console.error('[Verality BG] Search error:', error);
    }
}
