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

    // Populate and show account dropdown for logged-in users
    window.openAccountDropdown = () => {
        const user = getAuthUser?.();
        const dd = document.getElementById('sg-account-dropdown');
        if (!dd) return;
        const name = document.getElementById('dd-user-name');
        const email = document.getElementById('dd-user-email');
        if (name) name.textContent = user?.displayName ? `Hi, ${user.displayName.split(' ')[0]}!` : 'Hi there!';
        if (email) email.textContent = user?.email || '';
        dd.style.display = 'block';
        dd.style.animation = 'sgDdFade .18s ease';
        // Close if a link inside it is clicked
        dd.onclick = (e) => {
            if (e.target.closest('a') || e.target.closest('button')) {
                window.closeAccountDropdown?.();
            }
        };

        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', window._sgDdOutsideClick = (e) => {
                if (!dd.contains(e.target) && e.target.id !== 'nav-user-btn' && !e.target.closest('#nav-user-btn')) {
                    window.closeAccountDropdown?.();
                }
            }, { once: true });
        }, 0);
    };

    window.closeAccountDropdown = () => {
        const dd = document.getElementById('sg-account-dropdown');
        if (dd) dd.style.display = 'none';
        document.removeEventListener('click', window._sgDdOutsideClick);
    };

    window.openAuthModal = () => {
        const isMobile = window.innerWidth < 768;
        if (getAuthUser?.()) {
            if (isMobile) {
                // Mobile: go to account page directly
                window.location.href = '/account.html';
            } else {
                // Desktop: toggle dropdown
                const dd = document.getElementById('sg-account-dropdown');
                if (dd && dd.style.display === 'block') {
                    window.closeAccountDropdown();
                } else {
                    window.openAccountDropdown();
                }
            }
        } else {
            // Not logged in → go to login page
            sessionStorage.setItem('sg_login_redirect', window.location.href);
            window.location.href = '/login.html';
        }
    };

    window.closeAuthModals = () => {
        document.getElementById('auth-modal-overlay')?.classList.remove('opacity-100', 'pointer-events-auto');
        document.getElementById('auth-login-modal')?.classList.add('opacity-0', 'pointer-events-none', 'scale-95');
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
