/**
 * Verality Background Service Worker
 */

const API_BASE_URL = 'https://verality.io'; // Update to your production URL

// Keep an eye on local dev if needed
// const API_BASE_URL = 'http://localhost:3000'; 

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'FETCH_CREATORS') {
        handleFetchCreators(message.query, sender.tab.id);
        sendResponse({ status: 'started' });
    } else if (message.action === 'AUTH_SUCCESS') {
        chrome.storage.local.set({ extension_token: message.token }, () => {
            sendResponse({ success: true });
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
            sendResponse({ error: 'UNAUTHENTICATED' });
            return;
        }

        const response = await fetch(`${API_BASE_URL}/api/extension/me`, {
            headers: {
                'Authorization': `Bearer ${extension_token}`
            }
        });

        if (response.status === 401) {
            await chrome.storage.local.remove('extension_token');
            sendResponse({ error: 'UNAUTHENTICATED' });
            return;
        }

        const data = await response.json();
        sendResponse({ user: data });
    } catch (err) {
        console.error('Error getting user:', err);
        sendResponse({ error: err.message });
    }
}

async function handleFetchCreators(query, tabId) {
    try {
        console.log('Verality Extension: Searching for:', query);

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

        // Map backend creators to extension format if needed
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
            score: c.verality_score || 85, // Fallback score
            reason: c.reason || 'Strong niche match',
            email: c.email || null,
            emailSource: c.email ? 'verality' : null
        }));

        // Send to UI
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
