/**
 * Simple content script for extension-connect page
 */

console.log('[Verality Connect] Listening for token...');

window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    const data = event.data;
    if (data && data.type === 'VERALITY_EXTENSION_TOKEN') {
        console.log('[Verality Connect] Received token from website');

        const token = data.token;
        const origin = data.origin || 'https://verality.io';

        if (!token) {
            console.error('[Verality Connect] No token in message');
            return;
        }

        // Store token and notify background
        chrome.storage.local.set({
            extension_token: token,
            api_base_url: origin
        }, () => {
            console.log('[Verality Connect] Token stored successfully');

            // Notify background to verify
            chrome.runtime.sendMessage({
                action: 'GET_USER'
            }, (response) => {
                if (response && response.success) {
                    console.log('[Verality Connect] Verification successful!');
                    window.postMessage({ type: 'VERALITY_CONNECT_SUCCESS' }, '*');
                } else {
                    console.error('[Verality Connect] Verification failed:', response?.error);
                }
            });
        });
    }
});

// Signal ready
window.postMessage({ type: 'VERALITY_EXTENSION_READY' }, '*');
