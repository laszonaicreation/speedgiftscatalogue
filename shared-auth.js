import { applyActionCode } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";

export function initSharedAuth(config) {
    window._sgGetFriendlyError = function(err) {
        if (!err) return 'An error occurred';
        const msg = (err.message || '').toLowerCase();
        const code = (err.code || '').toLowerCase();
        
        if (code === 'auth/email-already-in-use' || msg.includes('email-already-in-use')) return 'This email is already registered. Please sign in.';
        if (code === 'auth/invalid-email' || msg.includes('invalid-email')) return 'Please enter a valid email address.';
        if (code === 'auth/weak-password' || msg.includes('weak-password')) return 'Password must be at least 6 characters.';
        if (code === 'auth/user-not-found' || msg.includes('user-not-found')) return 'No account found with this email.';
        if (code === 'auth/wrong-password' || msg.includes('wrong-password') || code === 'auth/invalid-credential' || msg.includes('invalid-credential')) return 'Incorrect email or password.';
        if (code === 'auth/too-many-requests' || msg.includes('too-many-requests')) return 'Too many attempts. Please try again later.';
        if (code === 'auth/network-request-failed' || msg.includes('network-request-failed')) return 'Network error. Please check your connection.';
        if (code === 'auth/requires-recent-login' || msg.includes('requires-recent-login')) return 'Please log out and log in again to do this.';
        
        return err.message?.replace('Firebase:', '').replace(/\(auth\/.*\)\.?/, '').trim() || 'An error occurred. Please try again.';
    };

    const {
        auth,
        firebaseAuth,
        getAuthUser,
        setAuthMode,
        getAuthMode,
        updateAuthUserUI,
        onSignOut,
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
            // Check if user has a recent guest order
            const hasGuestOrder = !!sessionStorage.getItem('sg_last_order');
            if (hasGuestOrder) {
                // Route them to account page to see guest preview
                window.location.href = '/account.html';
            } else {
                // Not logged in → go to login page
                sessionStorage.setItem('sg_login_redirect', window.location.href);
                window.location.href = '/login.html';
            }
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
            showToast?.(window._sgGetFriendlyError(err));
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
            showToast?.(window._sgGetFriendlyError(err));
        }
    };

    window.handleSignOut = async () => {
        try {
            onSignOut?.(); // Clean up module state before Firebase signs out
            await signOut(auth);
            window.closeAuthModals?.();
            showToast?.('Signed Out Successfully');
            updateAuthUserUI?.();
        } catch {
            showToast?.('Error signing out');
        }
    };

    // --- Global Auth Action Handlers (Email Verify) ---
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    const oobCode = urlParams.get('oobCode');

    if (mode === 'verifyEmail' && oobCode) {
        window.history.replaceState(null, '', window.location.pathname);
        applyActionCode(auth, oobCode).then(() => {
            showBeautifulSuccessModal('Email Verified! 🎉', 'Your email address has been successfully verified. You can now access all features of your account.');
        }).catch(err => {
            showToast?.('Invalid or expired verification link.');
        });
    }

    function showBeautifulSuccessModal(title, message) {
        const modalHtml = `
        <div id="sg-success-modal" class="fixed inset-0 z-[3000] flex items-center justify-center pointer-events-auto transition-opacity duration-300">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick="this.parentElement.remove(); document.body.style.overflow='';"></div>
            <div class="relative bg-white rounded-3xl p-8 max-w-sm w-[90%] mx-auto text-center shadow-2xl transform transition-all scale-100 flex flex-col items-center">
                <div class="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-5 border-4 border-green-100">
                    <i class="fa-solid fa-check text-3xl text-green-500"></i>
                </div>
                <h3 class="text-2xl font-black text-black mb-2 tracking-tight">${title}</h3>
                <p class="text-sm text-gray-500 mb-8 font-medium px-2">${message}</p>
                <button onclick="this.closest('#sg-success-modal').remove(); document.body.style.overflow='';" class="w-full bg-black text-white font-bold uppercase tracking-widest text-xs py-4 rounded-2xl hover:bg-gray-800 transition-colors shadow-md">
                    Continue
                </button>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.body.style.overflow = 'hidden';
    }
}
