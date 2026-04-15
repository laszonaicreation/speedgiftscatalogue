import { verifyPasswordResetCode, confirmPasswordReset } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";

export function initPasswordReset(auth) {
    const showToast = (msg) => {
        const t = document.getElementById('toast'); 
        if (!t) return;
        t.innerText = msg; 
        t.style.display = 'block';
        setTimeout(() => { t.style.display = 'none'; }, 3000);
    };

    window.handlePasswordResetFlow = async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const mode = urlParams.get('mode');
        const oobCode = urlParams.get('oobCode');
        if (mode !== 'resetPassword' || !oobCode) return;
        try {
            await verifyPasswordResetCode(auth, oobCode);
            const overlay = document.getElementById('auth-modal-overlay');
            if(overlay) overlay.classList.add('opacity-100', 'pointer-events-auto');
            const resetModal = document.getElementById('auth-reset-modal');
            if (resetModal) {
                resetModal.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
                const oobInput = document.getElementById('auth-reset-oobCode');
                if(oobInput) oobInput.value = oobCode;
            }
            document.body.style.overflow = 'hidden';
        } catch (err) {
            console.error('Reset Code Error:', err);
            showToast('Password reset link is invalid or expired.');
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    };

    window.handlePasswordResetFormSubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('auth-reset-submit-btn');
        const newPassword = document.getElementById('auth-reset-new-password')?.value;
        const oobCode = document.getElementById('auth-reset-oobCode')?.value;
        
        if (!newPassword || newPassword.length < 6) return showToast('Password must be at least 6 characters');
        
        if(btn) {
            btn.disabled = true;
            btn.dataset.original = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
        }

        try {
            await confirmPasswordReset(auth, oobCode, newPassword);
            showToast('Password Reset Successfully! Please login.');
            window.history.replaceState({}, document.title, window.location.pathname);
            document.getElementById('auth-reset-modal')?.classList.add('opacity-0', 'pointer-events-none', 'scale-95');
            
            // Assuming `state` globally exists in app.js as window._sgState although it's not strictly needed for UI toggle
            if(window._sgState) window._sgState.authMode = 'login';
            if(typeof window.updateAuthUI === 'function') window.updateAuthUI();
            else if(typeof window._sgRefreshMainAuthUI === 'function') window._sgRefreshMainAuthUI();
            
            document.getElementById('auth-login-modal')?.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
            document.getElementById('auth-reset-form')?.reset();
        } catch (err) {
            showToast(err.message.replace('Firebase:', '').trim() || 'Failed to reset password');
        } finally {
            if(btn) {
                btn.disabled = false;
                btn.innerHTML = btn.dataset.original;
            }
        }
    };

    // Execute flow on init since this is only loaded dynamically when conditions are met
    window.handlePasswordResetFlow();
}
