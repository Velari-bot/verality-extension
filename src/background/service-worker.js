const YOUTUBE_API_KEY = 'AIzaSyBtx802VQPuumofi_96pS3MpQBK6AwSjYo';

/**
 * Verality Background Service Worker
 * Direct API access version
 */

let API_BASE_URL = 'https://verality.io';

chrome.storage.local.get(['api_base_url'], (res) => {
    if (res.api_base_url) API_BASE_URL = res.api_base_url;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'GET_USER') {
        checkSessionAndGetToken(sendResponse);
        return true;
    } else if (message.action === 'SIGN_OUT') {
        chrome.storage.local.remove('extension_token', () => {
            console.log('[Verality BG] User signed out');
            sendResponse({ success: true });
        });
        return true;
    } else if (message.action === 'CLEAR_STORAGE') {
        chrome.storage.local.clear(() => {
            API_BASE_URL = 'https://verality.io';
            chrome.storage.local.set({ api_base_url: API_BASE_URL });
            sendResponse({ success: true });
        });
        return true;
    } else if (message.action === 'FETCH_CREATORS') {
        handleNativeYouTubeDiscovery(message.query, sender.tab.id);
        sendResponse({ status: 'started' });
        return true;
    }
    return true;
});

async function checkSessionAndGetToken(sendResponse) {
    try {
        const storage = await chrome.storage.local.get(['extension_token', 'api_base_url']);
        const base = storage.api_base_url || API_BASE_URL;

        if (storage.extension_token) {
            const verifyResponse = await fetch(`${base}/api/extension/me`, {
                headers: { 'Authorization': `Bearer ${storage.extension_token}` }
            });

            if (verifyResponse.ok) {
                const data = await verifyResponse.json();
                if (data.credits !== undefined) {
                    await chrome.storage.local.set({ last_known_credits: data.credits });
                }
                sendResponse({ success: true, user: data });
                return;
            } else {
                await chrome.storage.local.remove('extension_token');
            }
        }

        const sessionResponse = await fetch(`${base}/api/extension/session`, {
            credentials: 'include',
            headers: { 'Accept': 'application/json' }
        });

        if (sessionResponse.status === 401) {
            sendResponse({ error: 'UNAUTHENTICATED', needsLogin: true });
            return;
        }

        if (!sessionResponse.ok) {
            sendResponse({ error: 'Session check failed' });
            return;
        }

        const { token, user } = await sessionResponse.json();
        if (!token) {
            sendResponse({ error: 'No token received' });
            return;
        }

        if (user && user.credits !== undefined) {
            await chrome.storage.local.set({ last_known_credits: user.credits });
        }

        await chrome.storage.local.set({
            extension_token: token,
            api_base_url: base
        });

        sendResponse({ success: true, user: user });

    } catch (err) {
        console.error('[Verality BG] Auth Error:', err);
        sendResponse({ error: err.message });
    }
}

/**
 * Native YouTube Discovery through extension
 */
async function handleNativeYouTubeDiscovery(query, tabId) {
    try {
        console.log('[Verality BG] Starting Native Discovery for:', query);
        let allValidCreators = [];
        let nextPageToken = '';
        let pagesSearched = 0;
        const targetCount = 50;

        const seenIds = new Set();

        // 1. Paginated Search Loop
        while (allValidCreators.length < targetCount && pagesSearched < 5) {
            pagesSearched++;
            console.log(`[Verality BG] Searching page ${pagesSearched}...`);

            const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=channel&maxResults=50&pageToken=${nextPageToken}&key=${YOUTUBE_API_KEY}`;
            const searchResp = await fetch(searchUrl);

            if (!searchResp.ok) {
                const err = await searchResp.text();
                throw new Error(`YouTube API failed: ${err}`);
            }

            const searchData = await searchResp.json();
            const items = searchData.items || [];
            if (items.length === 0) break;

            const channelIds = items
                .map(i => i.id.channelId || i.snippet.channelId)
                .filter(id => id && !seenIds.has(id))
                .join(',');

            if (!channelIds) {
                nextPageToken = searchData.nextPageToken;
                if (!nextPageToken) break;
                continue;
            }

            // Mark these as seen before fetching stats
            items.forEach(i => { if (i.id.channelId) seenIds.add(i.id.channelId); });

            // 2. Fetch Channel Stats & Snippets
            const statsResp = await fetch(
                `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelIds}&key=${YOUTUBE_API_KEY}`
            );
            if (!statsResp.ok) throw new Error('Failed to fetch channel stats');

            const statsData = await statsResp.json();
            const channels = statsData.items || [];

            // 3. Map & Filter
            const pageCreators = channels.map(c => {
                const snippet = c.snippet || {};
                const followers = parseInt(c.statistics.subscriberCount || '0');
                const totalViews = parseInt(c.statistics.viewCount || '0');
                const videoCount = parseInt(c.statistics.videoCount || '1');
                const title = snippet.title || "";
                const description = snippet.description || "";

                // Stats Calculations
                const avgViews = Math.floor(totalViews / Math.max(videoCount, 1));
                const viewToSubRatio = avgViews / Math.max(followers, 100);
                const engagement = Math.min(0.01 + (viewToSubRatio * 0.1), 0.15);

                const sizeScore = Math.min(Math.log10(followers || 1) / 7, 1) * 0.5;
                const engagementScore = Math.min(engagement * 10, 1) * 0.3;

                // NEW: View Consistency Score (penalize if they have 5k videos but low total views)
                const viewConsistency = Math.min(avgViews / 1000, 1.5) * 0.2;

                const totalScore = engagementScore + sizeScore + viewConsistency;

                let insight = "Relevant Match";
                if (followers > 100000) insight = "Established Authority";
                else if (viewToSubRatio > 1.5) insight = "Explosive Growth";
                else if (viewToSubRatio > 0.8) insight = "High Engagement";

                // QUOTA OPTIMIZATION: Extract email directly from snippet already fetched
                const extractedEmail = extractEmailFromText(title) || extractEmailFromText(description);

                return {
                    id: c.id,
                    handle: snippet.customUrl?.replace('@', '') || c.id,
                    name: title,
                    followers: followers,
                    avg_views: avgViews,
                    engagement_rate: engagement,
                    insight_tag: insight,
                    picture: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url,
                    location: snippet.country || 'US',
                    niche: query,
                    ranking_score: totalScore,
                    email: extractedEmail,
                    email_source: extractedEmail ? 'youtube_about' : null
                };
            }).filter(c => {
                const titleLower = (c.name || "").toLowerCase();
                const isTopic = titleLower.includes(' - topic') || titleLower.endsWith(' topic') || titleLower === 'topic';
                // ENFORCED QUALITY: Min 1000 subs and 500 avg views
                return !isTopic && c.followers >= 1000 && (c.avg_views || 0) >= 500;
            });

            allValidCreators = [...allValidCreators, ...pageCreators];
            nextPageToken = searchData.nextPageToken;
            if (!nextPageToken) break;
        }

        // 4. Sort & Finalize
        allValidCreators.sort((a, b) => b.ranking_score - a.ranking_score);
        const creators = allValidCreators.slice(0, targetCount);

        if (creators.length === 0) {
            chrome.tabs.sendMessage(tabId, { action: 'UPDATE_CREATORS', creators: [] });
            return;
        }

        // 5. Try Free Email Extraction (QUOTA-FRIENDLY)
        // We've already extracted from About during mapping. 
        // We no longer do the expensive video-description check to save 1,500+ units per click.

        // 6. Sync Credits & Trigger Backend Automations (Campaign + Outreach + Clay)
        const syncResult = await syncCredits(query, creators);

        // 7. Send to UI with updated credits
        chrome.tabs.sendMessage(tabId, {
            action: 'UPDATE_CREATORS',
            creators,
            creditsRemaining: syncResult?.creditsRemaining
        });

    } catch (error) {
        console.error('[Verality BG] Discovery Error:', error);
        let userMessage = error.message;
        if (userMessage.includes('quotaExceeded') || userMessage.includes('403')) {
            userMessage = "YouTube Quota Exceeded. Try again tomorrow or use Dashboard search.";
        }
        chrome.tabs.sendMessage(tabId, { action: 'UPDATE_CREATORS', creators: [], error: userMessage });
    }
}

/**
 * YouTube Email Extraction (Native Extension Version)
 */
async function extractEmailFromYouTube(channelId) {
    try {
        // 1. Check About Page Description
        const resp = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${YOUTUBE_API_KEY}`
        );
        if (!resp.ok) return { source: 'not_found' };

        const data = await resp.json();
        const snippet = data.items?.[0]?.snippet || {};
        const desc = snippet.description || '';
        const title = snippet.title || '';

        // 1. Check title and description
        let email = extractEmailFromText(title) || extractEmailFromText(desc);

        if (email) return { email, source: 'youtube_about' };

        // 2. Check Recent Videos (top 5)
        const vResp = await fetch(
            `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${channelId}&maxResults=5&order=date&type=video&key=${YOUTUBE_API_KEY}`
        );
        if (vResp.ok) {
            const vData = await vResp.json();
            const vIds = vData.items?.map(i => i.id.videoId).join(',');
            if (vIds) {
                const vdResp = await fetch(
                    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${vIds}&key=${YOUTUBE_API_KEY}`
                );
                if (vdResp.ok) {
                    const vdData = await vdResp.json();
                    for (const v of vdData.items || []) {
                        const vemail = extractEmailFromText(v.snippet.description);
                        if (vemail) return { email: vemail, source: 'youtube_description' };
                    }
                }
            }
        }

        return { source: 'not_found' };
    } catch (e) {
        return { source: 'not_found' };
    }
}

function extractEmailFromText(text) {
    if (!text) return null;
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const matches = text.match(emailRegex);
    if (!matches) return null;

    // Filter out common junk
    const filtered = matches.filter(e => {
        const l = e.toLowerCase();
        return !l.includes('example.com') && !l.includes('noreply') && !l.includes('test');
    });
    return filtered[0] || null;
}

async function syncCredits(query, creators) {
    if (!creators || creators.length <= 0) return null;
    try {
        const { extension_token, api_base_url } = await chrome.storage.local.get(['extension_token', 'api_base_url']);
        const base = api_base_url || API_BASE_URL;
        if (!extension_token) return null;

        const resp = await fetch(`${base}/api/extension/search`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${extension_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: 'SYNC_FROM_CLIENT',
                niche: query,
                limit: creators.length,
                creators: creators.map(c => ({
                    id: c.id,
                    handle: c.handle,
                    email: c.email || null,
                    name: c.name
                }))
            })
        });

        if (resp.ok) {
            const data = await resp.json();
            if (data.success && data.creditsRemaining !== undefined) {
                await chrome.storage.local.set({ last_known_credits: data.creditsRemaining });
                return data;
            }
        }
        return null;
    } catch (e) {
        console.error('[Verality BG] Credit Sync Failed:', e);
        return null;
    }
}
