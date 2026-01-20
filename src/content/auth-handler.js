/**
 * Auth Handler Content Script
 */

console.log('[Verality Auth] Content Script Loaded');

function handleAuth(token, origin) {
    if (!chrome.runtime?.id) {
        console.error('[Verality Auth] Extension context invalidated. Please refresh the page.');
        return;
    }

    console.log('[Verality Auth] Sending token to background...');

    // Use the double-layer approach
    chrome.storage.local.set({ extension_token: token, api_base_url: 'https://verality.io' }, () => {
        chrome.runtime.sendMessage({
            action: 'AUTH_SUCCESS',
            token: token,
            origin: origin
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('[Verality Auth] runtime error:', chrome.runtime.lastError.message);
                window.postMessage({ type: 'VERALITY_EXTENSION_AUTH_ERROR', error: chrome.runtime.lastError.message }, '*');
                return;
            }

            if (response && response.success) {
                console.log('[Verality Auth] Success verified for', response.user?.email);
                window.postMessage({ type: 'VERALITY_EXTENSION_AUTH_SUCCESS_ACK' }, '*');
            } else {
                console.error('[Verality Auth] Failed:', response?.error);
                window.postMessage({ type: 'VERALITY_EXTENSION_AUTH_ERROR', error: response?.error || 'Verification failed' }, '*');
            }
        });
    });
}

window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data && event.data.type === 'VERALITY_EXTENSION_AUTH') {
        handleAuth(event.data.token, window.location.origin);
    }
});

// Signal readiness
if (chrome.runtime?.id) {
    window.postMessage({ type: 'VERALITY_EXTENSION_READY' }, '*');
}
