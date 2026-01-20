/**
 * Verality Background Service Worker
 * Simplified Web-Based OAuth
 */

let API_BASE_URL = 'https://verality.io';

function normalizeBaseUrl(url) {
    if (!url) return 'https://verality.io';
    let clean = url.replace(/\/$/, '');
    if (clean.includes('verality.io') && !clean.includes('localhost')) {
        return 'https://verality.io';
    }
    return clean;
}

chrome.storage.local.get(['api_base_url'], (res) => {
    if (res.api_base_url) API_BASE_URL = normalizeBaseUrl(res.api_base_url);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_GOOGLE_AUTH') {
        // Open the web-based auth page
        chrome.tabs.create({
            url: `${API_BASE_URL}/extension-auth`,
            active: true
        });
        sendResponse({ success: true });
        return true;
    } else if (message.action === 'AUTH_SUCCESS') {
        const token = message.token;
        const origin = normalizeBaseUrl(message.origin || API_BASE_URL);

        if (!token) {
            sendResponse({ success: false, error: 'Empty token' });
            return true;
        }

        API_BASE_URL = origin;
        chrome.storage.local.set({ api_base_url: origin, extension_token: token }, () => {
            verifyTokenWithAPI(sendResponse, token, origin);
        });
        return true;
    } else if (message.action === 'GET_USER') {
        verifyTokenWithAPI(sendResponse);
        return true;
    } else if (message.action === 'CLEAR_STORAGE') {
        chrome.storage.local.clear(() => {
            API_BASE_URL = 'https://verality.io';
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
        const base = normalizeBaseUrl(overrideBase || storage.api_base_url || API_BASE_URL);

        if (!token) {
            sendResponse({ error: 'UNAUTHENTICATED' });
            return;
        }

        const url = `${base}/api/extension/me`;
        const myHeaders = new Headers();
        myHeaders.append("Authorization", `Bearer ${token}`);
        myHeaders.append("Accept", "application/json");

        const response = await fetch(url, {
            method: 'GET',
            headers: myHeaders,
            cache: 'no-store'
        });

        const data = await response.json().catch(() => ({}));

        if (response.status === 401) {
            sendResponse({ error: `AUTH_FAILED: ${data.details || 'Rejection'}` });
            return;
        }

        if (!response.ok) {
            sendResponse({ error: `Server Error: ${response.status}` });
            return;
        }

        sendResponse({ success: true, user: data });
    } catch (err) {
        sendResponse({ error: `Connection Error: ${err.message}` });
    }
}

async function handleFetchCreators(query, tabId) {
    try {
        const { extension_token, api_base_url } = await chrome.storage.local.get(['extension_token', 'api_base_url']);
        const base = normalizeBaseUrl(api_base_url || API_BASE_URL);

        if (!extension_token) return;

        const myHeaders = new Headers();
        myHeaders.append("Authorization", `Bearer ${extension_token}`);
        myHeaders.append("Content-Type", "application/json");

        const response = await fetch(`${base}/api/extension/search`, {
            method: 'POST',
            headers: myHeaders,
            body: JSON.stringify({ query, limit: 50, platform: 'youtube' })
        });

        if (response.ok) {
            const data = await response.json();
            chrome.tabs.sendMessage(tabId, { action: 'UPDATE_CREATORS', creators: data.results });
        }
    } catch (error) {
        console.error('[Verality BG] Search Error:', error.message);
    }
}
