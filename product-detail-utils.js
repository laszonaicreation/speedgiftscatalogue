const PRODUCT_DETAIL_PAGE = 'product-detail.html';
const HOME_PAGE = 'index.html';

function getBasePath(pathname = window.location.pathname) {
    const cleanPath = pathname.split('?')[0].split('#')[0];
    const normalized = cleanPath.endsWith('/') ? cleanPath : cleanPath.substring(0, cleanPath.lastIndexOf('/') + 1);
    return normalized || '/';
}

export function isStandaloneDetailPage(pathname = window.location.pathname) {
    return pathname.endsWith(`/${PRODUCT_DETAIL_PAGE}`) || pathname.endsWith(PRODUCT_DETAIL_PAGE);
}

export function getProductDetailUrl(id, origin = window.location.origin, pathname = window.location.pathname) {
    const basePath = getBasePath(pathname);
    return `${origin}${basePath}/p/${encodeURIComponent(id)}`;
}

export function getShortShareUrl(id, origin = window.location.origin) {
    return `${origin}/p/${encodeURIComponent(id)}`;
}

export function getLegacyDetailUrl(id) {
    const basePath = getBasePath();
    return `${basePath}${HOME_PAGE}?p=${encodeURIComponent(id)}`;
}

export function getProductIdFromSearch(search = window.location.search, pathname = window.location.pathname) {
    const params = new URLSearchParams(search);
    const queryId = params.get('id') || params.get('p');
    if (queryId) return queryId;
    
    if (pathname.startsWith('/p/')) {
        try {
            return decodeURIComponent(pathname.split('/p/')[1].split('/')[0]);
        } catch (e) {
            return pathname.split('/p/')[1].split('/')[0];
        }
    }
    return null;
}
