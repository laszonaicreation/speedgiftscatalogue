/**
 * app-popup.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Lead Capture Gift Popup — lazy-loaded 20 seconds after page load,
 * only for Google Ads visitors who haven't already submitted/dismissed.
 * Never downloaded by regular/direct visitors.
 *
 * Dependencies (set by app.js before this module loads):
 *   window._sgPopupSettingsCol  — Firestore popupSettings collection ref
 *   window._sgLeadsCol          — Firestore leads collection ref
 *   window._sgGetOptUrl(u, w)   — getOptimizedUrl helper
 *   window.showToast            — toast helper
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
    getDocs,
    addDoc
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

let iti = null; // intl-tel-input instance (popup-scoped)

// ─────────────────────────────────────────────────────────────────────────────
// forceShowPopup — fetches settings, shows overlay, inits ITI
// ─────────────────────────────────────────────────────────────────────────────
async function forceShowPopup() {
    console.log("[Popup] Triggering show...");

    // Fetch latest popup settings from Firestore
    try {
        const snap = await getDocs(window._sgPopupSettingsCol);
        if (!snap.empty) {
            const settings = snap.docs[0].data();

            const title  = document.getElementById('popup-gift-title');
            const msg    = document.getElementById('popup-gift-msg');
            const img    = document.getElementById('popup-gift-img');
            const sTitle = document.getElementById('success-title');
            const sMsg   = document.getElementById('success-msg');

            if (title)  title.innerText = settings.title || "Claim Your Free Gift";
            if (msg)    msg.innerText   = settings.msg   || "Limited Edition • Exclusive Offer";
            if (img)    img.src = (settings.img && settings.img !== 'img/')
                ? window._sgGetOptUrl(settings.img, 800)
                : "https://placehold.co/600x400?text=Gift";
            if (sTitle) sTitle.innerText = settings.successTitle || "Congratulations!";
            if (sMsg)   sMsg.innerText   = settings.successMsg   || "Your gift has been secured. We will contact you through WhatsApp shortly.";
        }
    } catch (e) {
        console.error("[Popup] Settings fetch failed", e);
    }

    const overlay = document.getElementById('gift-popup-overlay');
    if (!overlay) {
        console.error("[Popup] Error: gift-popup-overlay element not found!");
        return;
    }

    console.log("[Popup] Showing overlay...");
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Initialize intl-tel-input
    const input = document.getElementById('lead-whatsapp');
    const itild = window.intlTelInput;

    if (input && itild) {
        try {
            console.log("[Popup] Initializing ITI...");
            if (iti) iti.destroy(); // Avoid double-init
            iti = itild(input, {
                initialCountry: "ae",
                separateDialCode: true,
                autoPlaceholder: "off",
                useFullscreenPopup: true,       // Better for mobile: avoids keyboard interference
                dropdownContainer: document.body, // Appends to body to avoid clipping/layering bugs
                utilsScript: "https://cdn.jsdelivr.net/npm/intl-tel-input@24.5.0/build/js/utils.js",
            });
        } catch (err) {
            console.error("[Popup] ITI Init Error:", err);
        }
    } else {
        console.warn("[Popup] ITI skip: input or itild missing", { input: !!input, itild: !!itild });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// closeGiftPopup
// ─────────────────────────────────────────────────────────────────────────────
function closeGiftPopup() {
    const overlay = document.getElementById('gift-popup-overlay');
    if (overlay) {
        overlay.classList.remove('open');
        document.body.style.overflow = 'auto';
        localStorage.setItem('popup_dismissed', 'true');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// submitLead — validates form, saves to Firestore, shows success state
// ─────────────────────────────────────────────────────────────────────────────
async function submitLead(e) {
    if (e) e.preventDefault();
    const btn      = document.getElementById('lead-submit-btn');
    const name     = document.getElementById('lead-name').value;
    const whatsapp = document.getElementById('lead-whatsapp').value;
    const age      = document.getElementById('lead-age').value;

    console.log("Submitting to:", window._sgLeadsCol?.path);

    if (!name || !whatsapp || !age) return window.showToast("Please fill all fields");

    // Validate phone — fallback to length check if ITI is unsure
    const isValid = iti ? (iti.isValidNumber() || whatsapp.trim().length > 7) : whatsapp.trim().length > 7;
    if (!isValid) {
        console.warn("[Popup] Phone validation failed:", { whatsapp, itiValid: iti?.isValidNumber() });
        return window.showToast("Please enter a valid WhatsApp number");
    }

    // Capture full international number
    let fullNumber = iti ? iti.getNumber() : whatsapp;
    console.log("[Popup] initial getNumber:", fullNumber);

    if (iti) {
        const countryData = iti.getSelectedCountryData();
        const dialCode    = countryData.dialCode;
        console.log("[Popup] Selected Dial Code:", dialCode);

        const cleanLocal = whatsapp.replace(/\D/g, '').replace(/^0+/, '');
        if (!fullNumber || !fullNumber.startsWith('+') || !fullNumber.includes(dialCode)) {
            console.log("[Popup] Constructing manual international number");
            fullNumber = `+${dialCode}${cleanLocal}`;
        }
    }

    if (!fullNumber || fullNumber === "") fullNumber = whatsapp.trim();
    console.log("[Popup] FINAL Captured number:", fullNumber);

    btn.innerText = "Processing...";
    btn.disabled  = true;

    try {
        await addDoc(window._sgLeadsCol, {
            name,
            whatsapp: fullNumber,
            age:      parseInt(age) || 0,
            status:   'new',
            createdAt: new Date().toISOString()
        });

        // Transition to success state
        const form        = document.getElementById('lead-form');
        const imgBox      = document.querySelector('.popup-image-box');
        const successState = document.getElementById('lead-success-state');
        const mainTitle   = document.getElementById('popup-gift-title');
        const mainMsg     = document.getElementById('popup-gift-msg');

        if (form)       form.classList.add('hidden');
        if (imgBox)     imgBox.classList.add('hidden');
        if (mainTitle)  mainTitle.classList.add('hidden');
        if (mainMsg)    mainMsg.classList.add('hidden');
        if (successState) successState.classList.remove('hidden');

        window.showToast("Success! Lead captured.");
        localStorage.setItem('popup_submitted', 'true');

        // Auto-close after 8s if still open
        setTimeout(() => {
            if (document.getElementById('gift-popup-overlay')?.classList.contains('open')) {
                window.closeGiftPopup();
            }
        }, 8000);

    } catch (err) {
        console.error("Lead Submission Error:", err);
        window.showToast("Submission Error: " + (err.message || "Please check connection"));
        btn.innerText = "Try Again";
        btn.disabled  = false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// initPopup — exported, registers all window.* functions
// ─────────────────────────────────────────────────────────────────────────────
export function initPopup() {
    window.forceShowPopup = forceShowPopup;
    window.closeGiftPopup = closeGiftPopup;
    window.submitLead     = submitLead;
    console.log("[Popup] Module loaded and ready.");
}
