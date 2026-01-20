/**
 * Auth Handler Content Script
 * Runs only on verality.io/extension-auth
 */

console.log('Verality Extension: Auth Handler Active');

window.addEventListener('message', (event) => {
    // Only accept messages from our own window
    if (event.source !== window) return;

    if (event.data && event.data.type === 'VERALITY_EXTENSION_AUTH') {
        const token = event.data.token;
        console.log('Verality Extension: Received auth token');

        // Send token to background script to store
        chrome.runtime.sendMessage({ action: 'AUTH_SUCCESS', token }, (response) => {
            if (response && response.success) {
                console.log('Verality Extension: Token stored successfully');
            }
        });
    }
});
