export function mountSharedShell(page = 'shop') {
    const root = document.getElementById('shared-shell-root');
    if (!root) return;

    const isHome = page === 'home';
    const deskSearchId = isHome ? 'desk-search' : 'shop-search';
    const deskClearId = isHome ? 'desk-clear-btn' : 'shop-clear-btn';
    const initialSearchQuery = !isHome ? (new URLSearchParams(window.location.search).get('q') || '') : '';
    const escapedInitialSearch = initialSearchQuery
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    let initialWishlistCount = 0;
    try {
        const wRaw = localStorage.getItem('speedgifts_wishlist');
        if (wRaw) {
            const parsed = JSON.parse(wRaw);
            const wIds = new Set();
            parsed.forEach(e => { const id = typeof e === 'string' ? e : e?.id; if (id) wIds.add(id); });
            initialWishlistCount = wIds.size;
        }
    } catch(e) {}

    const mobileNavHtml = `
            <button onclick="${isHome ? 'window.goBackToHome && window.goBackToHome(true)' : '(document.referrer.endsWith(\'/index.html\') || document.referrer.endsWith(\'/\')) && window.history.length > 1 ? window.history.back() : window.location.href=\'index.html\''}" class="mobile-nav-btn ${isHome ? 'active' : ''}"><i class="fa-solid fa-house"></i> <span>Home</span></button>
            <button onclick="window.focusSearch()" class="mobile-nav-btn"><i class="fa-solid fa-magnifying-glass"></i> <span>Search</span></button>
            <button onclick="window.openCategoriesSidebar()" class="mobile-nav-btn"><i class="fa-solid fa-table-cells"></i> <span>Categories</span></button>
            <button onclick="window.handleFavoritesClick()" class="mobile-nav-btn relative"><i class="fa-solid fa-heart"></i> <span>Saved</span><span id="nav-wishlist-count-mob" class="absolute -top-1 right-0 bg-red-500 text-white text-[7px] font-black w-3.5 h-3.5 flex items-center justify-center rounded-full border-2 border-white ${initialWishlistCount > 0 ? '' : 'hidden'}">${initialWishlistCount}</span></button>
            <button onclick="window.handleUserAuthClick()" class="mobile-nav-btn"><i class="fa-solid fa-user" id="mob-user-icon"></i> <span id="mob-user-text">Account</span></button>
        `;
    const desktopMenuHtml = isHome
        ? ''
        : `<div id="desktop-mega-menu-wrapper" class="hidden md:block w-full border-t border-gray-50 bg-white/95 backdrop-blur-xl transition-all duration-300">
                <ul id="desk-mega-menu" class="max-w-[1536px] mx-auto flex items-center justify-center gap-8 xl:gap-12 h-12" style="padding-left:clamp(20px,5vw,96px);padding-right:clamp(20px,5vw,96px)"></ul>
           </div>`;


    let initialCartCount = 0;
    try {
        const cRaw = localStorage.getItem('speedgifts_cart');
        if (cRaw) {
            const parsed = JSON.parse(cRaw);
            parsed.forEach(e => { initialCartCount += (e.quantity || 1); });
        }
    } catch(e) {}

    root.innerHTML = `
    <nav class="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-50" id="shop-header">
        <div class="max-w-[1536px] mx-auto h-16 md:h-20 flex items-center justify-between relative" style="padding-left:clamp(20px,5vw,96px);padding-right:clamp(20px,5vw,96px)">
            <div class="w-1/4 md:w-auto flex items-center gap-2">

                <h1 class="brand-logo cursor-pointer select-none hidden md:block" id="desk-logo" style="position:absolute;left:50%;transform:translateX(-50%);margin:0;z-index:1;"><a href="index.html"><img src="img/speed-logo.svg" alt="Speed Gifts" class="h-8 md:h-10 w-auto inline-block"></a></h1>
            </div>
            <div class="flex-1 md:hidden text-center flex justify-center items-center">
                <h1 class="brand-logo cursor-pointer select-none" id="mob-logo"><a href="index.html"><img src="img/speed-logo.svg" alt="Speed Gifts" class="h-7 w-auto inline-block"></a></h1>
            </div>
            <div class="w-1/4 md:flex-1 flex justify-end items-center gap-4 md:gap-6">
                <div class="${page === 'cart' ? 'hidden' : 'hidden md:block'}" style="position:relative;width:100%;max-width:360px;transition:max-width .3s ease">
                    <i class="fa-solid fa-magnifying-glass" style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#aaa;font-size:13px;pointer-events:none"></i>
                    <input type="text" id="${deskSearchId}" class="shop-search-input" placeholder="Search products..." autocomplete="off" value="${escapedInitialSearch}" style="width:100%;background:#f3f4f6;border:1.5px solid transparent;border-radius:999px;padding:10px 36px 10px 38px;font-size:12px;font-weight:500;color:#111;outline:0;transition:all .2s ease;font-family:inherit">
                    <button id="${deskClearId}" onclick="clearSearch && clearSearch()" style="display:${initialSearchQuery ? 'flex' : 'none'};position:absolute;right:8px;top:50%;transform:translateY(-50%);width:22px;height:22px;border-radius:50%;background:#e5e7eb;border:none;cursor:pointer;align-items:center;justify-content:center;font-size:9px;color:#666"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="flex items-center gap-0">
                    <button id="nav-user-btn" onclick="window.handleUserAuthClick()" class="relative flex items-center text-gray-400 hover:text-black transition-all group flex-shrink-0 w-10 h-10 justify-center rounded-full hover:bg-gray-50"><i class="fa-solid fa-user text-[18px] text-gray-400 group-hover:text-black transition-colors" id="desk-user-icon"></i></button>
                    <a href="cart.html" style="margin-left:-8px" class="relative flex items-center text-gray-400 hover:text-black transition-all group flex-shrink-0 w-10 h-10 justify-center rounded-full hover:bg-gray-50"><div class="relative"><i class="fa-solid fa-cart-shopping text-[18px] text-gray-400 group-hover:text-black transition-colors"></i><span id="nav-cart-count" class="absolute -top-1.5 -right-1.5 bg-black text-white text-[7px] font-black w-4 h-4 flex items-center justify-center rounded-full border-2 border-white ${initialCartCount > 0 ? '' : 'hidden'}">${initialCartCount}</span></div></a>
                    <button onclick="window.handleFavoritesClick()" style="margin-left:-8px" class="relative flex items-center text-gray-400 hover:text-red-500 transition-all group flex-shrink-0 w-10 h-10 justify-center rounded-full hover:bg-red-50"><div class="relative"><i class="fa-solid fa-heart text-[18px] text-gray-400 group-hover:text-red-500 transition-colors"></i><span id="nav-wishlist-count" class="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[7px] font-black w-4 h-4 flex items-center justify-center rounded-full border-2 border-white ${initialWishlistCount > 0 ? '' : 'hidden'}">${initialWishlistCount}</span></div></button>
                </div>
            </div>
        </div>
        ${desktopMenuHtml}
    </nav>
    <nav id="mobile-bottom-nav" class="md:hidden fixed bottom-0 left-0 right-0 z-[150] bg-white border-t border-gray-100 shadow-[0_-5px_20px_rgba(0,0,0,0.03)]"><div class="px-6 py-3 flex items-center justify-between" style="padding-bottom:calc(.75rem + env(safe-area-inset-bottom))">${mobileNavHtml}</div></nav>
    <div id="cart-sidebar-overlay" onclick="window.closeCartSidebar()" class="fixed inset-0 bg-black/40 backdrop-blur-sm z-[2000] opacity-0 pointer-events-none transition-all duration-500"></div>
    <div id="cart-sidebar" class="fixed top-0 right-0 h-full w-[85%] md:w-[420px] bg-white z-[2001] translate-x-full transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] shadow-[-20px_0_60px_rgba(0,0,0,0.1)] flex flex-col"><div class="shared-side-head p-6 border-b border-gray-50 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10"><div class="flex flex-col"><h2 class="shared-side-title text-[13px] font-black uppercase tracking-[0.15em] text-black">Your Cart</h2><p id="cart-sidebar-count" class="shared-side-sub text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-1">0 Items</p></div><button onclick="window.closeCartSidebar()" class="shared-side-close w-10 h-10 rounded-full bg-gray-50 text-gray-400 flex items-center justify-center hover:bg-black hover:text-white transition-all duration-300"><i class="fa-solid fa-xmark text-sm"></i></button></div><div id="cart-items-list" class="shared-side-items flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar"></div><div class="shared-side-foot p-5 border-t border-gray-50 bg-gray-50/50 space-y-3"><div class="flex items-center justify-between px-1"><span class="text-[10px] font-black uppercase tracking-widest text-gray-500">Total</span><span id="cart-sidebar-total" class="text-[18px] font-black text-black">0.00 AED</span></div><button id="cart-checkout-btn" onclick="window.cartCheckoutWhatsApp()" class="w-full bg-black text-white py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-lg flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all" style="display:none"><i class="fa-brands fa-whatsapp text-lg text-[#25D366]"></i> Checkout via WhatsApp</button></div></div>
    <div id="categories-sidebar-overlay" onclick="window.closeCategoriesSidebar()" class="fixed inset-0 bg-black/40 backdrop-blur-sm z-[2000] opacity-0 pointer-events-none transition-all duration-500"></div>
    <div id="categories-sidebar" class="fixed top-0 left-0 h-full w-[85%] md:w-[400px] bg-white z-[2001] -translate-x-full transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] shadow-[20px_0_60px_rgba(0,0,0,0.1)] flex flex-col"><div class="shared-side-head p-6 border-b border-gray-50 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10"><div class="flex flex-col"><h2 class="shared-side-title text-[13px] font-black uppercase tracking-[0.15em] text-black">Categories</h2><p class="shared-side-sub text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-1">Explore our collection</p></div><button onclick="window.closeCategoriesSidebar()" class="shared-side-close w-10 h-10 rounded-full bg-gray-50 text-gray-400 flex items-center justify-center hover:bg-black hover:text-white transition-all duration-300"><i class="fa-solid fa-xmark text-sm"></i></button></div><div id="sidebar-categories-list" class="shared-side-items flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar"></div></div>
    <div id="auth-modal-overlay" onclick="window.closeAuthModals()" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[2000] opacity-0 pointer-events-none transition-all duration-300"></div>
    <div id="auth-login-modal" class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[2001] opacity-0 pointer-events-none transition-all duration-500 scale-95 flex flex-col auth-premium-modal"><button onclick="window.closeAuthModals()" class="auth-close-btn"><i class="fa-solid fa-xmark text-sm"></i></button><div class="text-center mb-6"><h2 class="text-2xl font-black text-black tracking-tight" id="auth-form-title" style="font-family:Poppins,sans-serif">Welcome Back</h2><p class="text-[11px] text-gray-500 font-medium mt-1 uppercase tracking-widest" id="auth-form-subtitle">Login to your account</p></div><button type="button" onclick="window.signInWithGoogle()" class="auth-outline-btn group"><img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" class="w-5 h-5 group-hover:scale-110 transition-transform"> <span>Continue with Google</span></button><div class="flex items-center gap-4 mb-5 opacity-40"><div class="flex-1 h-px bg-gray-300"></div><span class="text-[9px] font-black uppercase tracking-widest text-gray-500">OR EMAIL</span><div class="flex-1 h-px bg-gray-300"></div></div><form id="auth-form" onsubmit="window.handleAuthSubmit(event)" class="auth-form-container"><div id="auth-name-group" class="hidden"><input type="text" id="auth-name" placeholder="Full Name" class="auth-premium-input"></div><div><input type="email" id="auth-email" required placeholder="Email Address" class="auth-premium-input"></div><div><input type="password" id="auth-password" required placeholder="Password" class="auth-premium-input"></div><div class="flex items-center justify-end -mt-1" id="auth-forgot-wrap"><button type="button" onclick="window.handleForgotPassword()" class="text-[10px] font-bold text-gray-400 hover:text-black transition-colors uppercase tracking-widest">Forgot Password?</button></div><button type="submit" id="auth-submit-btn" class="auth-solid-btn">Sign In <i class="fa-solid fa-arrow-right text-[12px]"></i></button></form><div class="mt-6 text-center"><p class="text-[11px] font-medium text-gray-500"><span id="auth-toggle-text">Don't have an account?</span> <button onclick="window.toggleAuthMode()" class="text-black font-black uppercase tracking-wider underline underline-offset-4 ml-1" id="auth-toggle-btn">Sign Up</button></p></div></div>
    <div id="auth-account-modal" class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[2001] opacity-0 pointer-events-none transition-all duration-500 scale-95 flex flex-col items-center auth-premium-modal" style="max-width:360px!important"><button onclick="window.closeAuthModals()" class="auth-close-btn"><i class="fa-solid fa-xmark text-sm"></i></button><div class="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4 mt-2 border-4 border-gray-100"><i class="fa-solid fa-user text-3xl text-gray-300" id="account-avatar-icon"></i></div><h2 class="text-[20px] font-black text-black tracking-tight" id="account-user-name" style="font-family:Poppins,sans-serif">User</h2><p class="text-[11px] text-gray-500 font-medium mt-1 mb-8" id="account-user-email">email@example.com</p><div class="w-full bg-gray-50 rounded-2xl p-4 flex items-center justify-between mb-6 border border-gray-100 cursor-pointer hover:border-black transition-all" onclick="window.closeAuthModals();window.handleFavoritesClick();"><div class="flex items-center gap-3"><div class="w-8 h-8 bg-white rounded-full flex justify-center items-center text-red-400 shadow-sm"><i class="fa-solid fa-heart text-[10px]"></i></div><span class="text-[12px] font-bold text-gray-700">My Favorites</span></div><i class="fa-solid fa-chevron-right text-gray-300 text-[10px]"></i></div><button onclick="window.handleSignOut()" class="w-full flex items-center justify-center gap-2 py-4 bg-[#fff0f0] text-red-500 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all"><i class="fa-solid fa-arrow-right-from-bracket"></i> Sign Out</button></div>
    <div id="auth-reset-modal" class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[2001] opacity-0 pointer-events-none transition-all duration-500 scale-95 flex flex-col auth-premium-modal"><button onclick="window.closeAuthModals()" class="auth-close-btn"><i class="fa-solid fa-xmark text-sm"></i></button><div class="text-center mb-6 mt-4"><div class="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-gray-100"><i class="fa-solid fa-lock text-2xl text-black"></i></div><h2 class="text-2xl font-black text-black tracking-tight" style="font-family:Poppins,sans-serif">New Password</h2><p class="text-[11px] text-gray-500 font-medium mt-1 uppercase tracking-widest px-4">Create a new secure password</p></div><form id="auth-reset-form" onsubmit="window.handlePasswordResetFormSubmit && window.handlePasswordResetFormSubmit(event)" class="auth-form-container"><input type="hidden" id="auth-reset-oobCode"><div><input type="password" id="auth-reset-new-password" required placeholder="Enter new password" class="auth-premium-input"></div><button type="submit" id="auth-reset-submit-btn" class="auth-solid-btn">Save Password <i class="fa-solid fa-check text-[12px]"></i></button></form></div>
    

    <!-- Account Dropdown (replaces old account modal) -->
    <div id="sg-account-dropdown" style="display:none;position:fixed;top:68px;right:clamp(16px,4vw,80px);width:240px;background:#fff;border-radius:18px;box-shadow:0 8px 40px rgba(0,0,0,0.13);border:1px solid #f0f0f0;z-index:2001;overflow:hidden;font-family:'Poppins',sans-serif;">
        <div style="padding:1rem 1.25rem 0.75rem;border-bottom:1px solid #f5f5f5;">
            <p style="font-size:0.8rem;font-weight:700;color:#111;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" id="dd-user-name">Hi!</p>
            <p style="font-size:0.7rem;color:#9ca3af;margin:0.15rem 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" id="dd-user-email"></p>
        </div>
        <div style="padding:0.5rem 0;">
            <a href="/account.html" style="display:flex;align-items:center;gap:0.75rem;padding:0.65rem 1.25rem;font-size:0.8rem;font-weight:500;color:#374151;text-decoration:none;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='none'"><i class="fa-solid fa-user" style="width:14px;color:#9ca3af;font-size:0.75rem;"></i> My Account</a>
            <a href="/account.html#orders" style="display:flex;align-items:center;gap:0.75rem;padding:0.65rem 1.25rem;font-size:0.8rem;font-weight:500;color:#374151;text-decoration:none;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='none'"><i class="fa-solid fa-box" style="width:14px;color:#9ca3af;font-size:0.75rem;"></i> My Orders</a>
            <button onclick="window.location.href='/favourites.html';" style="display:flex;align-items:center;gap:0.75rem;padding:0.65rem 1.25rem;font-size:0.8rem;font-weight:500;color:#374151;background:none;border:none;cursor:pointer;width:100%;text-align:left;font-family:'Poppins',sans-serif;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='none'"><i class="fa-solid fa-heart" style="width:14px;color:#9ca3af;font-size:0.75rem;"></i> Favourites</button>
        </div>
        <div style="padding:0.5rem 0;border-top:1px solid #f5f5f5;">
            <button onclick="window.handleSignOut&&window.handleSignOut();window.closeAccountDropdown&&window.closeAccountDropdown();" style="display:flex;align-items:center;gap:0.75rem;padding:0.65rem 1.25rem;font-size:0.8rem;font-weight:500;color:#ef4444;background:none;border:none;cursor:pointer;width:100%;text-align:left;font-family:'Poppins',sans-serif;" onmouseover="this.style.background='#fff5f5'" onmouseout="this.style.background='none'"><i class="fa-solid fa-arrow-right-from-bracket" style="width:14px;font-size:0.75rem;"></i> Sign Out</button>
        </div>
    </div>
    `;
}

// Smart Mobile Nav Scroll Behavior for shared pages
let sharedNavScrollTimeout;
let sharedLastScrollPos = window.pageYOffset || document.documentElement.scrollTop;

window.addEventListener('scroll', () => {
    const nav = document.getElementById('mobile-bottom-nav');
    if (!nav || window.innerWidth >= 768) return;

    const currentScroll = window.pageYOffset || document.documentElement.scrollTop;

    // Hide on down-scroll, show on up-scroll
    if (currentScroll > sharedLastScrollPos && currentScroll > 60) {
        nav.classList.add('nav-hidden');
    } else {
        nav.classList.remove('nav-hidden');
    }

    sharedLastScrollPos = currentScroll;

    // Always show when scrolling stops for a moment
    clearTimeout(sharedNavScrollTimeout);
    sharedNavScrollTimeout = setTimeout(() => {
        if (nav) nav.classList.remove('nav-hidden');
    }, 1000);
}, { passive: true });
