/**
 * Auth Handler Content Script
 * BULLETPROOF VERSION
 */

console.log('[Verality Auth] Content Script Initialized');

function handleAuth(token, origin) {
    if (!chrome.runtime?.id) {
        console.error('[Verality Auth] Extension context invalidated.');
        return;
    }

    if (!token || typeof token !== 'string' || token.length < 10) {
        console.error('[Verality Auth] Received invalid or empty token:', token);
        return;
    }

    console.log('[Verality Auth] Token verified in content script, sending to background...');

    // Explicitly set in local storage first to be 100% sure
    const apiTarget = 'https://verality.io';

    chrome.storage.local.set({
        extension_token: token,
        api_base_url: apiTarget
    }, () => {
        console.log('[Verality Auth] Token written to local storage');

        // Notify background to verify and update state
        chrome.runtime.sendMessage({
            action: 'AUTH_SUCCESS',
            token: token,
            origin: apiTarget
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('[Verality Auth] Runtime error:', chrome.runtime.lastError.message);
                window.postMessage({ type: 'VERALITY_EXTENSION_AUTH_ERROR', error: chrome.runtime.lastError.message }, '*');
                return;
            }

            if (response && response.success) {
                console.log('[Verality Auth] Final verification successful for', response.user?.email);
                window.postMessage({ type: 'VERALITY_EXTENSION_AUTH_SUCCESS_ACK' }, '*');
            } else {
                console.error('[Verality Auth] Verification failed:', response?.error);
                window.postMessage({ type: 'VERALITY_EXTENSION_AUTH_ERROR', error: response?.error || 'Verification failed' }, '*');
            }
        });
    });
}

window.addEventListener('message', (event) => {
    // Safety checks
    if (event.source !== window) return;

    const data = event.data;
    if (data && data.source === "verality-auth-website" && data.type === 'VERALITY_EXTENSION_AUTH') {
        console.log('[Verality Auth] Valid auth message received from website');
        handleAuth(data.token, window.location.origin);
    }
});

// Signal readiness to the page
if (chrome.runtime?.id) {
    console.log('[Verality Auth] Signaling READY');
    window.postMessage({ type: 'VERALITY_EXTENSION_READY' }, '*');
}
