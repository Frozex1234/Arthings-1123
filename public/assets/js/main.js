/**
 * ARTHINGS - Main JavaScript Utilities
 * Shared functions across all pages
 */

// API Base URL
const API_BASE = '';

// Current user state
let currentUser = null;

/**
 * Reads the CSRF token the server set as a cookie.
 * The server rejects any state-changing request that does not echo it back
 * in a header — which a cross-origin page cannot do.
 */
function getCsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)arthings_csrf=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Error carrying the server's structured response, so callers can react to
 * `code` (e.g. EMAIL_NOT_VERIFIED) and render per-field messages.
 */
class ApiError extends Error {
    constructor(message, { status, code, fields } = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.fields = fields || null;
    }
}

/**
 * API Helper Functions
 */
const api = {
    async request(endpoint, { method = 'GET', data, isFormData = false } = {}) {
        const options = { method, credentials: 'include', headers: {} };

        if (!['GET', 'HEAD'].includes(method)) {
            const token = getCsrfToken();
            if (token) options.headers['X-CSRF-Token'] = token;
        }

        if (data !== undefined) {
            if (isFormData) {
                // Let the browser set the multipart boundary itself.
                options.body = data;
            } else {
                options.headers['Content-Type'] = 'application/json';
                options.body = JSON.stringify(data);
            }
        }

        const res = await fetch(`${API_BASE}${endpoint}`, options);

        // 204 and other empty bodies would throw on .json().
        const text = await res.text();
        const payload = text ? JSON.parse(text) : {};

        if (!res.ok) {
            // An unverified account should land on the verification screen
            // rather than a dead-end error message.
            if (payload.code === 'EMAIL_NOT_VERIFIED' && payload.email) {
                const target = `/pages/verify-email.html?email=${encodeURIComponent(payload.email)}`;
                if (!window.location.pathname.endsWith('verify-email.html')) {
                    window.location.href = target;
                }
            }

            throw new ApiError(payload.error || 'Request failed', {
                status: res.status,
                code: payload.code,
                fields: payload.fields
            });
        }

        return payload;
    },

    get(endpoint) {
        return api.request(endpoint);
    },

    post(endpoint, data, isFormData = false) {
        return api.request(endpoint, { method: 'POST', data, isFormData });
    },

    put(endpoint, data, isFormData = false) {
        return api.request(endpoint, { method: 'PUT', data, isFormData });
    },

    delete(endpoint, data) {
        return api.request(endpoint, { method: 'DELETE', data });
    }
};

/**
 * Authentication Functions
 */
async function checkAuth() {
    try {
        const data = await api.get('/api/auth/me');
        currentUser = data.user;
        updateAuthUI();
        return data.user;
    } catch (error) {
        currentUser = null;
        updateAuthUI();
        return null;
    }
}

function updateAuthUI() {
    const authLinks = document.getElementById('auth-links');
    const userLinks = document.getElementById('user-links');
    const userNameEl = document.getElementById('user-name');

    if (authLinks && userLinks) {
        if (currentUser) {
            authLinks.classList.add('hidden');
            userLinks.classList.remove('hidden');
            if (userNameEl) {
                userNameEl.textContent = currentUser.name;
            }
        } else {
            authLinks.classList.remove('hidden');
            userLinks.classList.add('hidden');
        }
    }

    // Update mobile menu as well
    const mobileAuthLinks = document.getElementById('mobile-auth-links');
    const mobileUserLinks = document.getElementById('mobile-user-links');

    if (mobileAuthLinks && mobileUserLinks) {
        if (currentUser) {
            mobileAuthLinks.classList.add('hidden');
            mobileUserLinks.classList.remove('hidden');
        } else {
            mobileAuthLinks.classList.remove('hidden');
            mobileUserLinks.classList.add('hidden');
        }
    }

    // Show/hide admin-only elements
    document.querySelectorAll('.admin-only').forEach(el => {
        if (currentUser && currentUser.isAdmin) {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    });

    // Make the inbox reachable from every page that uses the shared navigation.
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
        if (currentUser && !menu.querySelector('[href="/pages/messages.html"]')) {
            const link = document.createElement('a');
            link.href = '/pages/messages.html';
            link.textContent = '💬 Повідомлення';
            const divider = menu.querySelector('hr');
            menu.insertBefore(link, divider || null);
        }
    });
    document.querySelectorAll('#mobile-user-links').forEach(menu => {
        if (currentUser && !menu.querySelector('[href="/pages/messages.html"]')) {
            const link = document.createElement('a');
            link.href = '/pages/messages.html';
            link.className = 'mobile-nav-link';
            link.textContent = '💬 Повідомлення';
            const logout = menu.querySelector('.logout-btn');
            menu.insertBefore(link, logout || null);
        }
    });
}

async function logout() {
    try {
        await api.post('/api/auth/logout');
        currentUser = null;
        updateAuthUI();
        showToast('success', i18n.t('toast.logoutSuccess'));
        window.location.href = '/';
    } catch (error) {
        showToast('error', error.message);
    }
}

/**
 * Toast Notification System
 */
function showToast(type, message, duration = 4000) {
    const container = document.getElementById('toast-container') || createToastContainer();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <div class="toast-icon ${type}">
            ${getToastIcon(type)}
        </div>
        <div class="toast-content">
            <p class="toast-message">${message}</p>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
}

function getToastIcon(type) {
    const icons = {
        success: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>',
        error: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
        warning: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
        info: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
    };
    return icons[type] || icons.info;
}

/**
 * Product Card Generator
 */
function createProductCard(product, showActions = false) {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.productId = product.id;

    const imageUrl = product.images && product.images.length > 0
        ? product.images[0]
        : '/assets/images/placeholder.png';

    const categoryName = getCategoryName(product.category);
    const priceUnit = product.priceUnit === 'week' ? i18n.t('product.perWeek') : i18n.t('product.perDay');

    card.innerHTML = `
        <div class="card-image">
            <img src="${imageUrl}" alt="${escapeHtml(product.title)}" loading="lazy" onerror="this.src='/assets/images/placeholder.png'">
            <span class="card-badge">${categoryName}</span>
            <button class="card-favorite ${product.isFavorite ? 'active' : ''}" data-product-id="${product.id}" title="${i18n.t('product.addToFavorites')}">
                <svg viewBox="0 0 24 24" fill="${product.isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
            </button>
        </div>
        <div class="card-body">
            <span class="card-category">${categoryName}</span>
            <h3 class="card-title">${escapeHtml(product.title)}</h3>
            <div class="card-location">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                </svg>
                <span>${escapeHtml(product.city || i18n.t('common.unknown'))}</span>
            </div>
            <div class="card-footer">
                <div class="card-price">
                    ₴${product.price} <span>/ ${priceUnit}</span>
                </div>
                ${showActions && currentUser && currentUser.id === product.userId ? `
                    <div class="card-actions">
                        <button class="btn btn-sm btn-ghost edit-product-btn" data-id="${product.id}">
                            ${i18n.t('product.edit')}
                        </button>
                    </div>
                ` : `
                    <a href="/pages/item.html?id=${product.id}" class="btn btn-sm btn-primary">
                        ${i18n.t('product.rentNow')}
                    </a>
                `}
            </div>
        </div>
    `;

    // Add favorite click handler
    const favoriteBtn = card.querySelector('.card-favorite');
    favoriteBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await toggleFavorite(product.id, favoriteBtn);
    });

    // Add click handler to open product
    card.addEventListener('click', (e) => {
        if (!e.target.closest('button') && !e.target.closest('a')) {
            window.location.href = `/pages/item.html?id=${product.id}`;
        }
    });

    return card;
}

/**
 * Favorite Toggle
 */
async function toggleFavorite(productId, button) {
    if (!currentUser) {
        showToast('warning', i18n.t('toast.loginRequired'));
        window.location.href = '/pages/login.html';
        return;
    }

    try {
        const isActive = button.classList.contains('active');

        if (isActive) {
            await api.delete(`/api/favorites/${productId}`);
            button.classList.remove('active');
            button.querySelector('svg').setAttribute('fill', 'none');
            showToast('success', i18n.t('toast.favoriteRemoved'));
        } else {
            await api.post(`/api/favorites/${productId}`);
            button.classList.add('active');
            button.querySelector('svg').setAttribute('fill', 'currentColor');
            showToast('success', i18n.t('toast.favoriteAdded'));
        }
    } catch (error) {
        showToast('error', error.message);
    }
}

/**
 * Category Helpers
 */
const categoryIcons = {
    electronics: '📷',
    emergency: '🔦',
    tools: '🔧',
    outdoor: '⛺',
    home: '🏠',
    sports: '⚽',
    other: '📦'
};

function getCategoryName(categoryId) {
    return i18n.t(`category.${categoryId}`) || categoryId;
}

function getCategoryIcon(categoryId) {
    return categoryIcons[categoryId] || '📦';
}

/**
 * Utility Functions
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString(i18n.getLanguage() === 'uk' ? 'uk-UA' : 'en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function formatPrice(price, unit = 'day') {
    const priceText = i18n.t(unit === 'week' ? 'product.perWeek' : 'product.perDay');
    return `₴${price} / ${priceText}`;
}

function getUrlParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Loading State Helpers
 */
function showLoading(container) {
    container.innerHTML = `
        <div class="loading-overlay" style="position: relative; min-height: 200px;">
            <div class="loading-spinner"></div>
        </div>
    `;
}

function showEmptyState(container, message, actionText, actionUrl) {
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="8" y1="12" x2="16" y2="12"></line>
                </svg>
            </div>
            <h3>${message}</h3>
            ${actionText && actionUrl ? `
                <a href="${actionUrl}" class="btn btn-primary mt-4">${actionText}</a>
            ` : ''}
        </div>
    `;
}

/**
 * Navbar Scroll Effect
 */
function initNavbarScroll() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
}

/**
 * Mobile Menu
 */
function initMobileMenu() {
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const mobileNav = document.querySelector('.mobile-nav');

    if (!menuBtn || !mobileNav) return;

    menuBtn.addEventListener('click', () => {
        mobileNav.classList.toggle('active');
        menuBtn.classList.toggle('active');
    });

    // Close menu when clicking a link
    mobileNav.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            mobileNav.classList.remove('active');
            menuBtn.classList.remove('active');
        });
    });
}

/**
 * Form Validation
 */
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePassword(password) {
    return password.length >= 6;
}

function showFormError(input, message) {
    const group = input.closest('.form-group');
    if (!group) return;

    input.classList.add('error');

    let errorEl = group.querySelector('.form-error');
    if (!errorEl) {
        errorEl = document.createElement('p');
        errorEl.className = 'form-error';
        group.appendChild(errorEl);
    }
    errorEl.textContent = message;
}

function clearFormError(input) {
    const group = input.closest('.form-group');
    if (!group) return;

    input.classList.remove('error');
    const errorEl = group.querySelector('.form-error');
    if (errorEl) {
        errorEl.remove();
    }
}

/**
 * Initialize Common Elements
 */
document.addEventListener('DOMContentLoaded', () => {
    initNavbarScroll();
    initMobileMenu();
    checkAuth();

    // Logout button handler
    document.querySelectorAll('.logout-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    });
});

// Add slideOutRight animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideOutRight {
        from {
            opacity: 1;
            transform: translateX(0);
        }
        to {
            opacity: 0;
            transform: translateX(100px);
        }
    }
`;
document.head.appendChild(style);

// Export for use in other scripts
window.api = api;
window.currentUser = currentUser;
window.checkAuth = checkAuth;
window.showToast = showToast;
window.ApiError = ApiError;
window.getCsrfToken = getCsrfToken;
window.createProductCard = createProductCard;
window.toggleFavorite = toggleFavorite;
window.getCategoryName = getCategoryName;
window.getCategoryIcon = getCategoryIcon;
window.escapeHtml = escapeHtml;
window.formatDate = formatDate;
window.formatPrice = formatPrice;
window.getUrlParam = getUrlParam;
window.debounce = debounce;
window.showLoading = showLoading;
window.showEmptyState = showEmptyState;
window.validateEmail = validateEmail;
window.validatePassword = validatePassword;
window.showFormError = showFormError;
window.clearFormError = clearFormError;
window.logout = logout;
