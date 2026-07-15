# AI Developer Log & Project Memory

This file serves as a persistent memory and changelog for the AI assistant across different sessions. 
Whenever a change is made to the codebase, it will be documented here so that in future sessions, the AI can read this file to understand the context and recent updates.

## Current Project Context
- **Project**: Speed Gifts (speedgifts.net)
- **Stack**: Vanilla JS, HTML, Tailwind CSS, Firebase (Firestore, Auth, Hosting)
- **Key Files**: `app.js` (Home/Tracking), `shop.js` (Catalog/Filters), `firebase.json` (Routing).

## Change Log

### [2026-07-15]
- **Bug Fix (LCP / PageSpeed)**: Injected `<link rel="preconnect" href="https://firebasestorage.googleapis.com">` in all `.html` files and in `app.js`'s dynamic preconnector. This fixes the massive TLS negotiation delay introduced after migrating from Cloudinary to Firebase, drastically improving Largest Contentful Paint (LCP) and PageSpeed insights scores.
- **Feature (Performance)**: Added HTML page prefetching in `app.js` (`preloadInitialBatch`) to download `shop.html`, `cart.html`, `favourites.html`, and `catalogue.html` in the background after the main page is idle. This makes navigating to those pages instantaneous.
- **Deployment**: Ran `deploy.bat` to push the image optimization bug fix to production (Firebase) and backed up code to GitHub.
- **Bug Fix (Image Optimization)**: Identified and fixed a critical performance bug where `getOptimizedUrl` in `shop.js`, `cart-page.js`, and 7 other files was still using Cloudinary logic instead of requesting Firebase thumbnails (`_thumb.webp?`). Updated all files to include the Firebase check, then ran `build.js` to minify and update cache-busters.
- **Session Started**: Initialized persistent AI memory file (`AI_CHANGELOG.md`) to keep track of code changes and context across isolated sessions.
