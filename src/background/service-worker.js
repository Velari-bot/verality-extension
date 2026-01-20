/**
 * Verality Background Service Worker
 */

let API_BASE_URL = 'http://localhost:3000';

chrome.storage.local.get(['api_base_url'], (res) => {
    if (res.api_base_url) API_BASE_URL = res.api_base_url;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_GOOGLE_AUTH') {
        // Open Firebase auth popup
        chrome.windows.create({
            url: chrome.runtime.getURL('src/auth/signin.html'),
            type: 'popup',
            width: 500,
            height: 600
        });
        sendResponse({ success: true });
        return true;
    } else if (message.action === 'AUTH_SUCCESS') {
        const token = message.token;
        const origin = message.origin || 'http://localhost:3000';

        if (!token) {
            console.error('[Verality BG] No token provided');
            sendResponse({ success: false, error: 'Empty token' });
            return true;
        }

        console.log('[Verality BG] Storing token and verifying...');
        API_BASE_URL = origin;

        chrome.storage.local.set({
            api_base_url: origin,
            extension_token: token
        }, () => {
            verifyTokenWithAPI(sendResponse, token, origin);
        });
        return true;
    } else if (message.action === 'GET_USER') {
        verifyTokenWithAPI(sendResponse);
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

async function verifyTokenWithAPI(sendResponse, overrideToken = null, overrideBase = null) {
    try {
        const storage = await chrome.storage.local.get(['extension_token', 'api_base_url']);
        const token = overrideToken || storage.extension_token;
        const base = overrideBase || storage.api_base_url || API_BASE_URL;

        if (!token) {
            console.error('[Verality BG] No token in storage');
            sendResponse({ error: 'UNAUTHENTICATED' });
            return;
        }

        console.log('[Verality BG] Verifying at:', base);
        console.log('[Verality BG] Token length:', token.length);

        const url = `${base}/api/extension/me`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        console.log('[Verality BG] Status:', response.status);

        if (response.status === 401) {
            const data = await response.json().catch(() => ({}));
            console.error('[Verality BG] 401:', data);
            sendResponse({ error: `AUTH_FAILED: ${data.details || 'Unauthorized'}` });
            return;
        }

        if (!response.ok) {
            console.error('[Verality BG] Error:', response.status);
            sendResponse({ error: `Server Error: ${response.status}` });
            return;
        }

        const data = await response.json();
        console.log('[Verality BG] Success! User:', data.email);
        sendResponse({ success: true, user: data });
    } catch (err) {
        console.error('[Verality BG] Exception:', err);
        sendResponse({ error: `Connection Error: ${err.message}` });
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
