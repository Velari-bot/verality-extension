import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const firebaseConfig = {
    apiKey: "AIzaSyCImCEmi5UP8_BrGgKXXhLTbYvVm7Du4wE",
    authDomain: "ai-social-media-outreach-4e66c.firebaseapp.com",
    projectId: "ai-social-media-outreach-4e66c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

const button = document.getElementById('google-signin');
const status = document.getElementById('status');

button.addEventListener('click', async () => {
    try {
        status.textContent = 'Opening Google sign-in...';
        button.disabled = true;

        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        const idToken = await user.getIdToken();

        status.textContent = 'Getting extension token...';

        const apiUrl = 'https://verality.io';
        const response = await fetch(`${apiUrl}/api/extension/auth-token`, {
            headers: { 'Authorization': `Bearer ${idToken}` }
        });

        if (!response.ok) {
            throw new Error('Failed to get extension token');
        }

        const { token } = await response.json();

        // Send to background script
        chrome.runtime.sendMessage({
            action: 'AUTH_SUCCESS',
            token: token,
            origin: apiUrl
        }, (response) => {
            if (response && response.success) {
                status.textContent = '✓ Signed in successfully!';
                status.style.color = '#38a169';
                setTimeout(() => window.close(), 1500);
            } else {
                throw new Error(response?.error || 'Failed to authenticate');
            }
        });

    } catch (error) {
        console.error('Auth error:', error);
        status.textContent = `Error: ${error.message}`;
        status.classList.add('error');
        button.disabled = false;
    }
});
