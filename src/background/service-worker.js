/**
 * Verality Background Service Worker
 * BULLETPROOF VERSION
 */

let API_BASE_URL = 'https://verality.io';

function normalizeBaseUrl(url) {
    if (!url) return 'https://verality.io';
    let clean = url.replace(/\/$/, '');
    // Force apex domain for production to prevent redirect header stripping
    if (clean.includes('verality.io') && !clean.includes('localhost')) {
        return 'https://verality.io';
    }
    return clean;
}

chrome.storage.local.get(['api_base_url'], (res) => {
    if (res.api_base_url) API_BASE_URL = normalizeBaseUrl(res.api_base_url);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'AUTH_SUCCESS') {
        const token = message.token;
        const origin = normalizeBaseUrl(message.origin || 'https://verality.io');

        if (!token) {
            console.error('[Verality BG] Received AUTH_SUCCESS message but token is EMPTY');
            sendResponse({ success: false, error: 'Empty token received' });
            return true;
        }

        console.log('[Verality BG] Received token from content script. Origin:', origin);
        API_BASE_URL = origin;

        chrome.storage.local.set({
            api_base_url: API_BASE_URL,
            extension_token: token
        }, () => {
            console.log('[Verality BG] Storage updated, verifying with API...');
            verifyTokenWithAPI(sendResponse, token, API_BASE_URL);
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
        const currentBase = normalizeBaseUrl(overrideBase || storage.api_base_url || API_BASE_URL);

        if (!token) {
            console.warn('[Verality BG] Attempted verification but NO TOKEN in storage or message');
            sendResponse({ error: 'UNAUTHENTICATED' });
            return;
        }

        const verifyUrl = `${currentBase}/api/extension/me`;
        console.log('[Verality BG] Calling verify:', verifyUrl);

        const response = await fetch(verifyUrl, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.status === 401) {
            const errData = await response.json().catch(() => ({}));
            const detail = errData.details || 'Token rejected';
            console.error('[Verality BG] Auth rejected (401):', detail);
            if (!overrideToken) await chrome.storage.local.remove('extension_token');
            sendResponse({ error: `AUTH_FAILED: ${detail}` });
            return;
        }

        if (!response.ok) {
            console.error('[Verality BG] Server error during verification:', response.status);
            sendResponse({ error: `Server Error: ${response.status}` });
            return;
        }

        const data = await response.json();
        console.log('[Verality BG] SUCCESS! Identity confirmed:', data.email);
        sendResponse({ success: true, user: data });
    } catch (err) {
        console.error('[Verality BG] Network error during verification:', err.message);
        sendResponse({ error: `Network Error: ${err.message}` });
    }
}

async function handleFetchCreators(query, tabId) {
    try {
        const { extension_token, api_base_url } = await chrome.storage.local.get(['extension_token', 'api_base_url']);
        const currentBase = normalizeBaseUrl(api_base_url || API_BASE_URL);

        if (!extension_token) {
            chrome.tabs.sendMessage(tabId, { action: 'UPDATE_CREATORS', error: 'Please sign in first.' });
            return;
        }

        console.log('[Verality BG] Running search at:', currentBase);

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

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Search failed (${response.status}): ${text.substring(0, 50)}`);
        }

        const data = await response.json();
        chrome.tabs.sendMessage(tabId, {
            action: 'UPDATE_CREATORS',
            creators: data.results,
            creditsRemaining: data.creditsRemaining
        });

    } catch (error) {
        console.error('[Verality BG] Search execution error:', error.message);
        chrome.tabs.sendMessage(tabId, { action: 'UPDATE_CREATORS', error: error.message });
    }
}
