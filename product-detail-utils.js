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
    return `${origin}${basePath}${PRODUCT_DETAIL_PAGE}?id=${encodeURIComponent(id)}`;
}

export function getLegacyDetailUrl(id) {
    const basePath = getBasePath();
    return `${basePath}${HOME_PAGE}?p=${encodeURIComponent(id)}`;
}

export function getProductIdFromSearch(search = window.location.search) {
    const params = new URLSearchParams(search);
    return params.get('id') || params.get('p');
}
