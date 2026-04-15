export function createAdminProxyFactory(getContext) {
    let loadingPromise = null;

    async function ensureAdminModuleLoaded() {
        if (window.__adminModuleReady) return true;
        if (loadingPromise) return loadingPromise;

        loadingPromise = (async () => {
            try {
                const isMin = window._isMinBuild === true;
                const adminFile = ['./app-admin', isMin ? '.min' : '', '.js'].join('');
                const mod = await import(/* @vite-ignore */ adminFile);
                if (typeof mod.initAdmin !== 'function') return false;
                mod.initAdmin(getContext());
                window.__adminModuleReady = true;
                return true;
            } catch (e) {
                console.error('[Admin] Failed to load app-admin.js:', e);
                return false;
            } finally {
                loadingPromise = null;
            }
        })();

        return loadingPromise;
    }

    return function createAdminProxy(name) {
        const proxy = async (...args) => {
            const loaded = await ensureAdminModuleLoaded();
            if (!loaded) return;
            if (window[name] === proxy) return;
            return window[name](...args);
        };
        return proxy;
    };
}
