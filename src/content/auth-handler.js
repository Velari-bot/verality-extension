/**
 * Auth Handler Content Script
 * Runs only on verality.io/extension-auth or localhost:3000/extension-auth
 */

console.log('Verality Extension: Auth Handler Initialized');

// Function to send token to background
function handleAuth(token, origin) {
    console.log('Verality Extension: Forwarding token to background service worker');

    // Write to storage directly as well (double layer)
    chrome.storage.local.set({ extension_token: token, api_base_url: origin }, () => {
        chrome.runtime.sendMessage({
            action: 'AUTH_SUCCESS',
            token: token,
            origin: origin
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Verality Extension: Runtime error during auth:', chrome.runtime.lastError.message);
                window.postMessage({ type: 'VERALITY_EXTENSION_AUTH_ERROR', error: chrome.runtime.lastError.message }, '*');
                return;
            }

            if (response && response.success) {
                console.log('Verality Extension: Auth successful for', response.user?.email);
                window.postMessage({ type: 'VERALITY_EXTENSION_AUTH_SUCCESS_ACK' }, '*');
            } else {
                console.error('Verality Extension: Auth failed:', response?.error);
                window.postMessage({ type: 'VERALITY_EXTENSION_AUTH_ERROR', error: response?.error || 'Unknown error' }, '*');
            }
        });
    });
}

// Listen for messages from the page
window.addEventListener('message', (event) => {
    // We only care about messages from OUR page
    if (event.source !== window) return;

    if (event.data && event.data.type === 'VERALITY_EXTENSION_AUTH') {
        const token = event.data.token;
        console.log('Verality Extension: Received token from web page');
        handleAuth(token, window.location.origin);
    }
});

// Signal to the page that we are ready
console.log('Verality Extension: Signaling readiness to web page');
window.postMessage({ type: 'VERALITY_EXTENSION_READY' }, '*');
