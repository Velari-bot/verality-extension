/**
 * Verality Background Service Worker
 */

let API_BASE_URL = 'https://verality.io';

// Check storage for saved API base override
chrome.storage.local.get(['api_base_url'], (res) => {
    if (res.api_base_url) {
        API_BASE_URL = res.api_base_url;
        console.log('Verality: Using saved API base:', API_BASE_URL);
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Verality Background: Received message:', message.action);

    if (message.action === 'FETCH_CREATORS') {
        handleFetchCreators(message.query, sender.tab.id);
        sendResponse({ status: 'started' });
    } else if (message.action === 'AUTH_SUCCESS') {
        // If the token came from localhost, switch the API base to localhost for testing
        if (message.origin && message.origin.includes('localhost')) {
            API_BASE_URL = 'http://localhost:3000';
            chrome.storage.local.set({ api_base_url: API_BASE_URL });
            console.log('Verality: Switched to Localhost API');
        } else if (message.origin && message.origin.includes('verality.io')) {
            API_BASE_URL = 'https://verality.io';
            chrome.storage.local.set({ api_base_url: API_BASE_URL });
            console.log('Verality: Switched to Production API');
        }

        chrome.storage.local.set({ extension_token: message.token }, () => {
            // Verify the token immediately
            handleGetUser((res) => {
                if (res.user) {
                    console.log('Verality: Auth Success for', res.user.email);
                    sendResponse({ success: true });
                } else {
                    console.error('Verality: Token storage failed verification:', res.error);
                    chrome.storage.local.remove('extension_token');
                    sendResponse({ success: false, error: res.error });
                }
            });
        });
        return true;
    } else if (message.action === 'GET_USER') {
        handleGetUser(sendResponse);
        return true;
    }
    return true;
});

async function handleGetUser(sendResponse) {
    try {
        const { extension_token } = await chrome.storage.local.get('extension_token');
        if (!extension_token) {
            console.log('Verality: No token found in storage');
            sendResponse({ error: 'UNAUTHENTICATED' });
            return;
        }

        console.log('Verality: Verifying token with:', `${API_BASE_URL}/api/extension/me`);
        const response = await fetch(`${API_BASE_URL}/api/extension/me`, {
            headers: {
                'Authorization': `Bearer ${extension_token}`
            }
        });

        if (response.status === 401) {
            console.warn('Verality: Token unauthorized (401)');
            await chrome.storage.local.remove('extension_token');
            sendResponse({ error: 'UNAUTHENTICATED' });
            return;
        }

        if (!response.ok) {
            const errText = await response.text();
            console.error('Verality: API error:', response.status, errText);
            sendResponse({ error: `Server error: ${response.status}` });
            return;
        }

        const data = await response.json();
        sendResponse({ user: data });
    } catch (err) {
        console.error('Verality: Network error in handleGetUser:', err);
        sendResponse({ error: `Network error: ${err.message}` });
    }
}

async function handleFetchCreators(query, tabId) {
    try {
        const { extension_token } = await chrome.storage.local.get('extension_token');
        if (!extension_token) {
            chrome.tabs.sendMessage(tabId, { action: 'UPDATE_CREATORS', error: 'Please sign in to the Verality extension first.' });
            return;
        }

        const response = await fetch(`${API_BASE_URL}/api/extension/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${extension_token}`
            },
            body: JSON.stringify({
                query: query,
                limit: 50,
                platform: 'youtube'
            })
        });

        if (response.status === 402) {
            const errorData = await response.json();
            chrome.tabs.sendMessage(tabId, {
                action: 'UPDATE_CREATORS',
                error: `Insufficient credits. Need ${errorData.cost} credits but have ${errorData.remaining}.`
            });
            return;
        }

        if (response.status === 401) {
            await chrome.storage.local.remove('extension_token');
            chrome.tabs.sendMessage(tabId, { action: 'UPDATE_CREATORS', error: 'Session expired. Please sign in again.' });
            return;
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Search failed: ${errorText}`);
        }

        const data = await response.json();

        const creators = data.results.map(c => ({
            channelId: c.verality_id || c.id,
            title: c.name || c.full_name || c.handle,
            handle: c.handle,
            description: c.bio || '',
            thumbnail: c.picture || '',
            subscriberCount: c.followers || 0,
            avgViews: c.avg_views || 0,
            engagementRate: c.engagement_rate || 0,
            lastUploadDate: c.last_upload_at || '',
            score: c.verality_score || 85,
            reason: c.reason || 'Strong niche match',
            email: c.email || null,
            emailSource: c.email ? 'verality' : null
        }));

        chrome.tabs.sendMessage(tabId, {
            action: 'UPDATE_CREATORS',
            creators: creators,
            creditsRemaining: data.creditsRemaining
        });

    } catch (error) {
        console.error('Verality: Discovery error:', error);
        chrome.tabs.sendMessage(tabId, { action: 'UPDATE_CREATORS', error: error.message });
    }
}
