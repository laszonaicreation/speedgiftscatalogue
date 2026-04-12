export function initSharedAuth(config) {
    const {
        auth,
        firebaseAuth,
        getAuthUser,
        setAuthMode,
        getAuthMode,
        updateAuthUserUI,
        showToast
    } = config;

    const {
        signInWithEmailAndPassword,
        createUserWithEmailAndPassword,
        GoogleAuthProvider,
        signInWithPopup,
        sendPasswordResetEmail,
        signOut,
        updateProfile
    } = firebaseAuth;

    window.openAuthModal = () => {
        // If user is logged in → show account dropdown (existing popup still used for account panel)
        if (getAuthUser?.()) {
            const overlay = document.getElementById('auth-modal-overlay');
            if (overlay) overlay.classList.add('opacity-100', 'pointer-events-auto');
            document.getElementById('auth-account-modal')?.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
            document.body.style.overflow = 'hidden';
        } else {
            // Not logged in → redirect to dedicated login page
            sessionStorage.setItem('sg_login_redirect', window.location.href);
            window.location.href = '/login.html';
        }
    };

    window.closeAuthModals = () => {
        document.getElementById('auth-modal-overlay')?.classList.remove('opacity-100', 'pointer-events-auto');
        document.getElementById('auth-login-modal')?.classList.add('opacity-0', 'pointer-events-none', 'scale-95');
        document.getElementById('auth-account-modal')?.classList.add('opacity-0', 'pointer-events-none', 'scale-95');
        document.getElementById('auth-reset-modal')?.classList.add('opacity-0', 'pointer-events-none', 'scale-95');
        document.body.style.overflow = 'auto';
    };

    window.handleUserAuthClick = () => window.openAuthModal();

    window.toggleAuthMode = () => {
        const mode = getAuthMode?.() === 'login' ? 'register' : 'login';
        setAuthMode?.(mode);
        window.updateAuthUI?.();
    };

    window.updateAuthUI = () => {
        const mode = getAuthMode?.() || 'login';
        const title = document.getElementById('auth-form-title');
        const subtitle = document.getElementById('auth-form-subtitle');
        const nameGroup = document.getElementById('auth-name-group');
        const submitBtn = document.getElementById('auth-submit-btn');
        const toggleText = document.getElementById('auth-toggle-text');
        const toggleBtn = document.getElementById('auth-toggle-btn');
        const forgotWrap = document.getElementById('auth-forgot-wrap');
        if (!title) return;

        if (mode === 'login') {
            title.innerText = 'Welcome Back';
            subtitle && (subtitle.innerText = 'Login to your account');
            nameGroup?.classList.add('hidden');
            if (submitBtn) submitBtn.innerHTML = `Sign In <i class="fa-solid fa-arrow-right text-[12px]"></i>`;
            if (toggleText) toggleText.innerText = "Don't have an account?";
            if (toggleBtn) toggleBtn.innerText = 'Sign Up';
            forgotWrap?.classList.remove('hidden');
        } else {
            title.innerText = 'Create Account';
            subtitle && (subtitle.innerText = 'Join Speed Gifts');
            nameGroup?.classList.remove('hidden');
            if (submitBtn) submitBtn.innerHTML = `Create Account <i class="fa-solid fa-arrow-right text-[12px]"></i>`;
            if (toggleText) toggleText.innerText = 'Already have an account?';
            if (toggleBtn) toggleBtn.innerText = 'Sign In';
            forgotWrap?.classList.add('hidden');
        }
    };

    window.handleAuthSubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email')?.value.trim();
        const password = document.getElementById('auth-password')?.value;
        const name = document.getElementById('auth-name')?.value.trim();
        const btn = document.getElementById('auth-submit-btn');
        if (!email || !password || !btn) return showToast?.('Please fill all fields');

        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing...`;

        try {
            if ((getAuthMode?.() || 'login') === 'login') {
                await signInWithEmailAndPassword(auth, email, password);
                showToast?.('Welcome Back!');
            } else {
                if (!name) throw new Error('Please enter your name');
                const userCred = await createUserWithEmailAndPassword(auth, email, password);
                await updateProfile(userCred.user, { displayName: name });
                showToast?.('Account Created!');
            }
            window.closeAuthModals?.();
            document.getElementById('auth-form')?.reset();
            updateAuthUserUI?.();
        } catch (err) {
            showToast?.(err.message?.replace('Firebase:', '').trim() || 'Authentication Failed');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    };

    window.signInWithGoogle = async () => {
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
            window.closeAuthModals?.();
            showToast?.('Logged in with Google!');
            updateAuthUserUI?.();
        } catch {
            showToast?.('Sign-In Failed or Cancelled');
        }
    };

    window.handleForgotPassword = async () => {
        const email = document.getElementById('auth-email')?.value.trim();
        if (!email) return showToast?.('Enter your email first');
        try {
            await sendPasswordResetEmail(auth, email);
            showToast?.('Password reset email sent');
        } catch (err) {
            showToast?.(err.message?.replace('Firebase:', '').trim() || 'Error sending reset email');
        }
    };

    window.handleSignOut = async () => {
        try {
            await signOut(auth);
            window.closeAuthModals?.();
            showToast?.('Signed Out Successfully');
            updateAuthUserUI?.();
        } catch {
            showToast?.('Error signing out');
        }
    };
}
