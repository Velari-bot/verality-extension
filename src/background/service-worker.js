/**
 * Verality Background Service Worker
 */

let API_BASE_URL = 'https://verality.io';

// Ensure we have a default
chrome.storage.local.get(['api_base_url'], (res) => {
    if (res.api_base_url) {
        API_BASE_URL = res.api_base_url;
    } else {
        chrome.storage.local.set({ api_base_url: API_BASE_URL });
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'FETCH_CREATORS') {
        handleFetchCreators(message.query, sender.tab.id);
        sendResponse({ status: 'started' });
    } else if (message.action === 'AUTH_SUCCESS') {
        // If the token came from localhost, allow switching
        if (message.origin && (message.origin.includes('localhost') || message.origin.includes('127.0.0.1'))) {
            API_BASE_URL = 'http://localhost:3000';
        } else {
            API_BASE_URL = 'https://verality.io';
        }

        chrome.storage.local.set({ api_base_url: API_BASE_URL });
        chrome.storage.local.set({ extension_token: message.token }, () => {
            verifyTokenWithAPI((res) => {
                if (res.user) {
                    sendResponse({ success: true, user: res.user });
                } else {
                    chrome.storage.local.remove('extension_token');
                    sendResponse({ success: false, error: res.error });
                }
            });
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
    }
    return true;
});

async function verifyTokenWithAPI(sendResponse) {
    try {
        const { extension_token, api_base_url } = await chrome.storage.local.get(['extension_token', 'api_base_url']);
        const currentBase = api_base_url || API_BASE_URL;

        if (!extension_token) {
            sendResponse({ error: 'UNAUTHENTICATED' });
            return;
        }

        const response = await fetch(`${currentBase}/api/extension/me`, {
            headers: { 'Authorization': `Bearer ${extension_token}` }
        });

        if (response.status === 401) {
            await chrome.storage.local.remove('extension_token');
            sendResponse({ error: 'UNAUTHENTICATED' });
            return;
        }

        if (!response.ok) {
            const errText = await response.text();
            sendResponse({ error: `API Error: ${response.status}` });
            return;
        }

        const data = await response.json();
        sendResponse({ user: data });
    } catch (err) {
        sendResponse({ error: `Network Error: ${err.message}` });
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

        if (response.status === 402) {
            const errorData = await response.json();
            chrome.tabs.sendMessage(tabId, {
                action: 'UPDATE_CREATORS',
                error: `Insufficient credits (${errorData.remaining}/${errorData.cost}).`
            });
            return;
        }

        if (response.status === 401) {
            await chrome.storage.local.remove('extension_token');
            chrome.tabs.sendMessage(tabId, { action: 'UPDATE_CREATORS', error: 'Session expired.' });
            return;
        }

        if (!response.ok) throw new Error(`Search failed: ${response.status}`);

        const data = await response.json();
        const creators = data.results.map(c => ({
            channelId: c.verality_id || c.id,
            title: c.name || c.full_name || c.handle,
            thumbnail: c.picture || '',
            subscriberCount: c.followers || 0,
            avgViews: c.avg_views || 0,
            engagementRate: c.engagement_rate || 0,
            reason: c.reason || 'Strong niche match',
            email: c.email || null,
        }));

        chrome.tabs.sendMessage(tabId, {
            action: 'UPDATE_CREATORS',
            creators: creators,
            creditsRemaining: data.creditsRemaining
        });

    } catch (error) {
        chrome.tabs.sendMessage(tabId, { action: 'UPDATE_CREATORS', error: error.message });
    }
}
