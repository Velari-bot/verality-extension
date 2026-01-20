/**
 * Verality Background Service Worker
 */

let API_BASE_URL = 'https://verality.io';

chrome.storage.local.get(['api_base_url'], (res) => {
    if (res.api_base_url) API_BASE_URL = res.api_base_url;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'AUTH_SUCCESS') {
        // ALWAYS prioritize verality.io apex unless it's localhost
        let originBase = 'https://verality.io';
        if (message.origin && (message.origin.includes('localhost') || message.origin.includes('127.0.0.1'))) {
            originBase = 'http://localhost:3000';
        }

        API_BASE_URL = originBase;
        console.log('[Verality BG] Auth Success. Targeting:', API_BASE_URL);

        chrome.storage.local.set({
            api_base_url: API_BASE_URL,
            extension_token: message.token
        }, () => {
            // Pass token directly to avoid async RACE condition
            verifyTokenWithAPI(sendResponse, message.token, API_BASE_URL);
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
    }
    return true;
});

async function verifyTokenWithAPI(sendResponse, overrideToken = null, overrideBase = null) {
    try {
        const { extension_token, api_base_url } = await chrome.storage.local.get(['extension_token', 'api_base_url']);
        const token = overrideToken || extension_token;
        const currentBase = overrideBase || api_base_url || API_BASE_URL;

        if (!token) {
            sendResponse({ error: 'UNAUTHENTICATED' });
            return;
        }

        const verifyUrl = `${currentBase}/api/extension/me`;
        console.log('[Verality BG] Verifying token at:', verifyUrl);

        const response = await fetch(verifyUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) {
            const errData = await response.json().catch(() => ({}));
            const detail = errData.details || 'Verification failed';
            console.error('[Verality BG] Server rejected token:', detail);
            if (!overrideToken) await chrome.storage.local.remove('extension_token');
            sendResponse({ error: `UNAUTHENTICATED: ${detail}` });
            return;
        }

        if (!response.ok) {
            const errText = await response.text();
            console.error('[Verality BG] API Error:', response.status, errText);
            sendResponse({ error: `Server Error: ${response.status}` });
            return;
        }

        const data = await response.json();
        console.log('[Verality BG] Auth Verified:', data.email);
        sendResponse({ success: true, user: data });
    } catch (err) {
        console.error('[Verality BG] Network error:', err.message);
        sendResponse({ error: `Network: ${err.message}` });
    }
}

async function handleFetchCreators(query, tabId) {
    try {
        const { extension_token, api_base_url } = await chrome.storage.local.get(['extension_token', 'api_base_url']);
        const currentBase = api_base_url || API_BASE_URL;

        if (!extension_token) {
            chrome.tabs.sendMessage(tabId, { action: 'UPDATE_CREATORS', error: 'Please sign in first.' });
            return;
        }

        const response = await fetch(`${currentBase}/api/extension/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${extension_token}`
            },
            body: JSON.stringify({ query, limit: 50, platform: 'youtube' })
        });

        if (response.status === 401) {
            await chrome.storage.local.remove('extension_token');
            chrome.tabs.sendMessage(tabId, { action: 'UPDATE_CREATORS', error: 'Session expired.' });
            return;
        }

        if (!response.ok) throw new Error(`Search failed (${response.status})`);

        const data = await response.json();
        chrome.tabs.sendMessage(tabId, { action: 'UPDATE_CREATORS', creators: data.results });

    } catch (error) {
        console.error('[Verality BG] Search error:', error);
        chrome.tabs.sendMessage(tabId, { action: 'UPDATE_CREATORS', error: error.message });
    }
}
