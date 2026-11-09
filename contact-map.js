(() => {
  'use strict';

  const name = 'Честная мастерская';
  const address = 'Челябинск, шоссе Металлургов, 70';
  const mapLink = 'https://2gis.ru/chelyabinsk/firm/70000001096238225';
  let leafletPromise;

  const hasLeaflet = () => window.L && typeof window.L.map === 'function' &&
    typeof window.L.tileLayer === 'function' && typeof window.L.marker === 'function' &&
    typeof window.L.divIcon === 'function' && typeof window.L.control?.zoom === 'function';

  const loadLeaflet = () => {
    if (hasLeaflet()) return Promise.resolve(window.L);
    if (!leafletPromise) {
      leafletPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'assets/vendor/leaflet/leaflet.js';
        script.async = true;
        const finish = ok => {
          window.clearTimeout(timeout);
          script.onload = null;
          script.onerror = null;
          if (ok && hasLeaflet()) resolve(window.L);
          else reject(new Error('Contact map library unavailable'));
        };
        const timeout = window.setTimeout(() => finish(false), 12000);
        script.onload = () => finish(true);
        script.onerror = () => finish(false);
        document.head.appendChild(script);
      });
    }
    return leafletPromise;
  };

  const setup = canvas => {
    if (canvas.dataset.contactMapReady) return;
    canvas.dataset.contactMapReady = 'waiting';
    const fallback = canvas.closest('.p-map-frame')?.querySelector('[data-map-fallback]');
    const showFallback = () => { if (fallback) fallback.hidden = false; };
    const clearFallback = () => { if (fallback) fallback.hidden = true; };

    const initialize = async () => {
      if (canvas.dataset.contactMapReady !== 'waiting') return;
      canvas.dataset.contactMapReady = 'loading';
      canvas.setAttribute('aria-busy', 'true');
      let map;
      try {
        const rawLat = canvas.dataset.mapLat || '';
        const rawLng = canvas.dataset.mapLng || '';
        const lat = Number(rawLat), lng = Number(rawLng);
        if (!rawLat.trim() || !rawLng.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) ||
            lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new Error('Invalid map coordinates');

        const L = await loadLeaflet();
        const reduceMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        map = L.map(canvas, {
          scrollWheelZoom: false,
          zoomControl: false,
          attributionControl: true,
          inertia: !reduceMotion,
          zoomAnimation: !reduceMotion,
          fadeAnimation: !reduceMotion,
          markerZoomAnimation: !reduceMotion
        });
        if (reduceMotion) {
          // Leaflet's keyboard and popup auto-pan both call panBy. Keep those
          // controls usable while making their movement immediate for this map.
          const panBy = map.panBy;
          map.panBy = function (offset, options) {
            return panBy.call(this, offset, {...options, animate: false});
          };
        }
        map.setView([lat, lng], 17);
        L.control.zoom({zoomInTitle: 'Приблизить', zoomOutTitle: 'Отдалить'}).addTo(map);

        // Only normal viewport tiles are requested; browser caching and Referer
        // remain intact. Keep the licence credit visible in Leaflet's control.
        const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          updateWhenIdle: true,
          keepBuffer: 1,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
        });
        let hasTile = false;
        tiles.on('tileerror', () => { if (!hasTile) showFallback(); });
        tiles.on('tileload', () => { hasTile = true; clearFallback(); });
        tiles.addTo(map);

        const icon = L.divIcon({
          className: 'p-map-brand-icon',
          html: '<span class="p-map-pin"><img src="assets/logo.png" alt="" width="40" height="40"></span><span class="p-map-pin-pulse"></span>',
          iconSize: [50, 64],
          iconAnchor: [25, 62]
        });
        const marker = L.marker([lat, lng], {icon, title: name, alt: name, keyboard: true}).addTo(map);
        const label = document.createElement('span');
        label.textContent = name;
        marker.bindTooltip(label, {
          permanent: true,
          direction: 'top',
          offset: [0, -58],
          opacity: 1,
          className: 'p-map-tooltip'
        });

        const popup = document.createElement('div');
        const heading = document.createElement('strong');
        heading.textContent = name;
        const location = document.createElement('p');
        location.textContent = canvas.dataset.mapAddress || address;
        const link = document.createElement('a');
        link.href = canvas.dataset.mapLink || mapLink;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Открыть в 2ГИС';
        popup.append(heading, location, link);
        marker.bindPopup(popup, {maxWidth: 240, minWidth: 160, offset: [0, -58], autoPanPadding: [16, 16]});
        clearFallback();
        canvas.dataset.contactMapReady = 'ready';
      } catch {
        try { map?.remove(); } catch { /* Preserve the fallback if cleanup fails. */ }
        canvas.dataset.contactMapReady = 'error';
        showFallback();
      } finally {
        canvas.setAttribute('aria-busy', 'false');
      }
    };

    if (typeof window.IntersectionObserver === 'function') {
      try {
        const observer = new window.IntersectionObserver(entries => {
          if (entries.some(entry => entry.target === canvas && entry.isIntersecting)) {
            observer.disconnect();
            void initialize();
          }
        }, {rootMargin: '0px', threshold: 0});
        observer.observe(canvas);
        return;
      } catch { /* Older browsers use the same visibility gate below. */ }
    }

    const checkVisible = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 &&
          rect.top < window.innerHeight && rect.left < window.innerWidth) {
        window.removeEventListener('scroll', checkVisible);
        window.removeEventListener('resize', checkVisible);
        void initialize();
      }
    };
    window.addEventListener('scroll', checkVisible, {passive: true});
    window.addEventListener('resize', checkVisible, {passive: true});
    checkVisible();
  };

  const boot = () => document.querySelectorAll('[data-contact-map]').forEach(setup);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once: true});
  else boot();
})();
