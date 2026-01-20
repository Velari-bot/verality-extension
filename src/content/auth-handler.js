/**
 * Auth Handler Content Script
 * Runs only on verality.io/extension-auth or localhost:3000/extension-auth
 */

console.log('Verality Extension: Auth Handler Active');

// Tell the page we are ready to receive the token
window.postMessage({ type: 'VERALITY_EXTENSION_READY' }, '*');

window.addEventListener('message', (event) => {
    // Only accept messages from our own window
    if (event.source !== window) return;

    if (event.data && event.data.type === 'VERALITY_EXTENSION_AUTH') {
        const token = event.data.token;
        console.log('Verality Extension: Received auth token from page');

        // Send token to background script to store
        chrome.runtime.sendMessage({
            action: 'AUTH_SUCCESS',
            token,
            // Also pass the origin so the background knows which API to use
            origin: window.location.origin
        }, (response) => {
            if (response && response.success) {
                console.log('Verality Extension: Token stored and verified successfully');
            } else {
                console.error('Verality Extension: Failed to store token:', response?.error);
            }
        });
    }
});
