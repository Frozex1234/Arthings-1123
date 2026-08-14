/**
 * ARTHINGS - Map Component
 *
 * Reusable Leaflet map shared by the items and housing marketplaces.
 *
 * Responsibilities:
 *   • render clustered markers from /api/products/map (or /api/housing/map)
 *   • settlement / street autocomplete backed by the server-side geocoder
 *   • "listings near me" via the browser geolocation API
 *   • re-query as the visible area changes
 *
 * Markers come from the database with real stored coordinates. The previous
 * implementation scattered pins around a hardcoded city list with Math.random(),
 * so nothing on screen corresponded to a real location.
 */

(function (global) {
    'use strict';

    const UKRAINE_CENTER = [48.85, 31.35];
    const UKRAINE_ZOOM = 6;

    /** Zoom level to fly to, by how precise the geocoded result is. */
    const ZOOM_BY_ACCURACY = {
        house: 17,
        street: 16,
        village: 13,
        city: 12,
        region: 8,
        approximate: 10
    };

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function debounce(fn, wait) {
        let timer;
        return function debounced(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    function formatDistance(km) {
        if (km === null || km === undefined) return '';
        return km < 1 ? `${Math.round(km * 1000)} м` : `${km.toFixed(1)} км`;
    }

    function formatRating(rating, count) {
        if (!count) return 'Без оцінок';
        return `★ ${Number(rating).toFixed(1)} (${count})`;
    }

    class ArthingsMap {
        /**
         * @param {object} options
         * @param {string} options.container        element id for the map
         * @param {string} [options.endpoint]       marker endpoint
         * @param {Function} [options.onResults]    called with the marker array
         * @param {Function} [options.onError]      called with an Error
         */
        constructor(options) {
            this.options = Object.assign(
                { endpoint: '/api/products/map', searchOnMove: true },
                options
            );

            this.filters = {};
            this.userLocation = null;
            this.userMarker = null;
            this.radiusCircle = null;
            this.searchOnMove = this.options.searchOnMove;
            this.abortController = null;

            this._initMap();
        }

        // -------------------------------------------------------------------
        // Setup
        // -------------------------------------------------------------------

        _initMap() {
            this.map = L.map(this.options.container, {
                center: UKRAINE_CENTER,
                zoom: UKRAINE_ZOOM,
                zoomControl: false,
                // Keeps panning within sane bounds without trapping the user.
                worldCopyJump: true
            });

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            }).addTo(this.map);

            L.control.zoom({ position: 'bottomright' }).addTo(this.map);

            // Clustering keeps hundreds of pins legible; without it a dense
            // city turns into an unreadable pile of overlapping markers.
            this.cluster = L.markerClusterGroup({
                showCoverageOnHover: false,
                maxClusterRadius: 60,
                spiderfyOnMaxZoom: true,
                chunkedLoading: true,
                iconCreateFunction: cluster => {
                    const count = cluster.getChildCount();
                    const size = count < 10 ? 36 : count < 100 ? 44 : 52;
                    return L.divIcon({
                        html: `<div class="map-cluster-inner">${count}</div>`,
                        className: 'map-cluster',
                        iconSize: L.point(size, size)
                    });
                }
            });

            this.map.addLayer(this.cluster);

            if (this.searchOnMove) {
                this.map.on('moveend', debounce(() => {
                    if (this.searchOnMove) this.refresh();
                }, 400));
            }
        }

        // -------------------------------------------------------------------
        // Data
        // -------------------------------------------------------------------

        /** Current viewport as query parameters. */
        _boundsParams() {
            const bounds = this.map.getBounds();
            return {
                north: bounds.getNorth(),
                south: bounds.getSouth(),
                east: bounds.getEast(),
                west: bounds.getWest()
            };
        }

        _buildQuery(useBounds) {
            const params = new URLSearchParams();

            for (const [key, value] of Object.entries(this.filters)) {
                if (value === undefined || value === null || value === '') continue;
                params.set(key, value);
            }

            if (this.userLocation) {
                params.set('lat', this.userLocation.lat);
                params.set('lng', this.userLocation.lng);
            }

            // A radius search is its own query; bounds would fight with it.
            if (this.filters.radiusKm && this.userLocation) {
                params.set('radiusKm', this.filters.radiusKm);
            } else if (useBounds) {
                for (const [key, value] of Object.entries(this._boundsParams())) {
                    params.set(key, value);
                }
            }

            return params;
        }

        /**
         * Fetches and renders markers for the current filters and viewport.
         * @param {{useBounds?: boolean}} [opts]
         */
        async refresh(opts = {}) {
            const useBounds = opts.useBounds !== undefined ? opts.useBounds : true;

            // A pan can outrun the previous request; cancel it so a stale
            // response cannot overwrite fresher markers.
            if (this.abortController) this.abortController.abort();
            this.abortController = new AbortController();

            const query = this._buildQuery(useBounds);

            try {
                const response = await fetch(`${this.options.endpoint}?${query}`, {
                    credentials: 'include',
                    signal: this.abortController.signal
                });

                if (!response.ok) throw new Error('Failed to load map listings');

                const payload = await response.json();
                this.render(payload.markers || []);
                if (this.options.onResults) this.options.onResults(payload.markers || []);
                return payload.markers || [];
            } catch (error) {
                if (error.name === 'AbortError') return [];
                console.error('Map refresh failed:', error);
                if (this.options.onError) this.options.onError(error);
                return [];
            }
        }

        /** Replaces all markers. */
        render(markers) {
            this.cluster.clearLayers();

            const layers = markers
                .filter(marker => marker.latitude !== null && marker.longitude !== null)
                .map(marker => this._createMarker(marker));

            if (layers.length) this.cluster.addLayers(layers);
        }

        _createMarker(data) {
            const icon = L.divIcon({
                className: 'map-pin',
                html: `<div class="map-pin-inner ${data.listingType === 'housing' ? 'is-housing' : ''}">
                         ${escapeHtml(Math.round(data.price))}₴
                       </div>`,
                iconSize: [54, 28],
                iconAnchor: [27, 28],
                popupAnchor: [0, -30]
            });

            const marker = L.marker([data.latitude, data.longitude], { icon });
            marker.bindPopup(() => this._popupHtml(data), {
                minWidth: 240,
                maxWidth: 260,
                closeButton: true
            });

            return marker;
        }

        /** Card shown when a marker is clicked. */
        _popupHtml(data) {
            const image = data.image
                ? `<img class="map-popup-image" src="${escapeHtml(data.image)}" alt="${escapeHtml(data.title)}" loading="lazy">`
                : `<div class="map-popup-image map-popup-image--empty">🏷️</div>`;

            const location = [data.street, data.village || data.city].filter(Boolean).join(', ');
            const unit = data.priceUnit === 'month' ? 'міс' : data.priceUnit === 'week' ? 'тиж' : 'день';

            const distance = data.distanceKm !== null && data.distanceKm !== undefined
                ? `<span class="map-popup-distance">📍 ${escapeHtml(formatDistance(data.distanceKm))}</span>`
                : '';

            const verified = data.ownerVerified
                ? '<span class="map-popup-verified" title="Перевірений власник">✓</span>'
                : '';

            return `
                <div class="map-popup">
                    ${image}
                    <div class="map-popup-content">
                        <div class="map-popup-title">${escapeHtml(data.title)}</div>
                        <div class="map-popup-price">${escapeHtml(String(data.price))}₴ <span>/ ${unit}</span></div>
                        <div class="map-popup-meta">
                            <span class="map-popup-rating">${escapeHtml(formatRating(data.ownerRating, data.ownerRatingCount))}</span>
                            ${verified}
                        </div>
                        ${location ? `<div class="map-popup-location">${escapeHtml(location)}</div>` : ''}
                        ${distance}
                        <a class="map-popup-button" href="/pages/item.html?id=${encodeURIComponent(data.id)}">
                            Переглянути оголошення
                        </a>
                    </div>
                </div>`;
        }

        // -------------------------------------------------------------------
        // Navigation
        // -------------------------------------------------------------------

        /** Flies to a geocoder suggestion, zooming to match its precision. */
        goToSuggestion(suggestion) {
            if (suggestion.boundingBox && suggestion.boundingBox.length === 4) {
                // Nominatim returns [southLat, northLat, westLng, eastLng].
                const [south, north, west, east] = suggestion.boundingBox;
                this.map.fitBounds([[south, west], [north, east]], { maxZoom: 16 });
            } else {
                const zoom = ZOOM_BY_ACCURACY[suggestion.accuracy] || 13;
                this.map.flyTo([suggestion.latitude, suggestion.longitude], zoom);
            }
        }

        /**
         * Centres on the user's position and enables distance sorting.
         * @returns {Promise<{lat:number,lng:number}>}
         */
        locateUser() {
            return new Promise((resolve, reject) => {
                if (!navigator.geolocation) {
                    reject(new Error('Геолокація не підтримується цим браузером'));
                    return;
                }

                navigator.geolocation.getCurrentPosition(
                    position => {
                        const location = {
                            lat: position.coords.latitude,
                            lng: position.coords.longitude
                        };
                        this.setUserLocation(location);
                        this.map.flyTo([location.lat, location.lng], 13);
                        resolve(location);
                    },
                    error => {
                        const messages = {
                            1: 'Доступ до геолокації заборонено',
                            2: 'Не вдалося визначити місцезнаходження',
                            3: 'Час очікування геолокації вичерпано'
                        };
                        reject(new Error(messages[error.code] || 'Помилка геолокації'));
                    },
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
                );
            });
        }

        setUserLocation(location) {
            this.userLocation = location;

            if (this.userMarker) this.map.removeLayer(this.userMarker);

            this.userMarker = L.marker([location.lat, location.lng], {
                icon: L.divIcon({
                    className: 'map-user-pin',
                    html: '<div class="map-user-pin-inner"></div>',
                    iconSize: [18, 18],
                    iconAnchor: [9, 9]
                }),
                interactive: false,
                keyboard: false
            }).addTo(this.map);

            this._drawRadius();
        }

        /** Visualises the active "near me" radius. */
        _drawRadius() {
            if (this.radiusCircle) {
                this.map.removeLayer(this.radiusCircle);
                this.radiusCircle = null;
            }

            if (!this.userLocation || !this.filters.radiusKm) return;

            this.radiusCircle = L.circle([this.userLocation.lat, this.userLocation.lng], {
                radius: Number(this.filters.radiusKm) * 1000,
                color: '#00d1cd',
                weight: 1,
                fillColor: '#00d1cd',
                fillOpacity: 0.08,
                interactive: false
            }).addTo(this.map);
        }

        /**
         * Replaces the active filters and re-queries.
         * @param {object} filters
         */
        async setFilters(filters) {
            this.filters = Object.assign({}, filters);
            this._drawRadius();

            // A radius search defines its own area, so the viewport must not
            // also constrain it — otherwise results outside the current view
            // silently vanish.
            const useBounds = !(this.filters.radiusKm && this.userLocation);

            if (!useBounds && this.userLocation) {
                const radius = Number(this.filters.radiusKm);
                this.map.fitBounds(
                    L.latLng(this.userLocation.lat, this.userLocation.lng).toBounds(radius * 2000)
                );
            }

            return this.refresh({ useBounds });
        }

        setSearchOnMove(enabled) {
            this.searchOnMove = enabled;
        }

        invalidate() {
            this.map.invalidateSize();
        }
    }

    /**
     * Attaches settlement/street autocomplete to an input.
     *
     * Queries are debounced and proxied through the server, never sent to
     * Nominatim from the browser.
     *
     * @param {object} options
     * @param {HTMLInputElement} options.input
     * @param {HTMLElement} options.resultsContainer
     * @param {Function} options.onSelect
     */
    function attachAutocomplete({ input, resultsContainer, onSelect, minLength = 3 }) {
        let suggestions = [];
        let activeIndex = -1;

        function close() {
            resultsContainer.innerHTML = '';
            resultsContainer.hidden = true;
            activeIndex = -1;
        }

        function highlight(index) {
            activeIndex = index;
            [...resultsContainer.children].forEach((child, position) => {
                child.classList.toggle('is-active', position === index);
            });
        }

        function choose(index) {
            const suggestion = suggestions[index];
            if (!suggestion) return;
            input.value = suggestion.shortLabel || suggestion.label;
            close();
            onSelect(suggestion);
        }

        function render(items) {
            suggestions = items;

            if (!items.length) {
                resultsContainer.innerHTML =
                    '<div class="map-suggestion map-suggestion--empty">Нічого не знайдено</div>';
                resultsContainer.hidden = false;
                return;
            }

            resultsContainer.innerHTML = items
                .map((item, index) => `
                    <button type="button" class="map-suggestion" data-index="${index}">
                        <span class="map-suggestion-title">${escapeHtml(item.shortLabel || item.label)}</span>
                        <span class="map-suggestion-sub">${escapeHtml(item.label)}</span>
                    </button>`)
                .join('');
            resultsContainer.hidden = false;
        }

        const search = debounce(async value => {
            try {
                const response = await fetch(
                    `/api/geo/autocomplete?q=${encodeURIComponent(value)}`,
                    { credentials: 'include' }
                );
                if (!response.ok) return close();
                const payload = await response.json();
                render(payload.suggestions || []);
            } catch (error) {
                console.error('Autocomplete failed:', error);
                close();
            }
        }, 320);

        input.addEventListener('input', () => {
            const value = input.value.trim();
            if (value.length < minLength) return close();
            search(value);
        });

        input.addEventListener('keydown', event => {
            if (resultsContainer.hidden) return;

            if (event.key === 'ArrowDown') {
                event.preventDefault();
                highlight(Math.min(activeIndex + 1, suggestions.length - 1));
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                highlight(Math.max(activeIndex - 1, 0));
            } else if (event.key === 'Enter' && activeIndex >= 0) {
                event.preventDefault();
                choose(activeIndex);
            } else if (event.key === 'Escape') {
                close();
            }
        });

        resultsContainer.addEventListener('click', event => {
            const button = event.target.closest('[data-index]');
            if (button) choose(Number(button.dataset.index));
        });

        document.addEventListener('click', event => {
            if (!resultsContainer.contains(event.target) && event.target !== input) close();
        });

        return { close };
    }

    global.ArthingsMap = ArthingsMap;
    global.attachMapAutocomplete = attachAutocomplete;
})(window);
