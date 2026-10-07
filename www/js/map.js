/* ==========================================================================
   LifeLink — map module (Leaflet + OpenStreetMap + OSRM routing)
   ========================================================================== */

(function () {
  'use strict';

  var OSRM_URL = 'https://router.project-osrm.org/route/v1/driving/';

  /* Public OpenStreetMap tile endpoints. CARTO basemaps now require an API key. */
  var PROVIDERS = [
    { key: 'osm', name: 'OpenStreetMap style',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      sub: '', maxZoom: 19, retina: false, credit: '© OpenStreetMap contributors' },
    { key: 'hot', name: 'Humanitarian map style',
      url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
      sub: 'abc', maxZoom: 19, retina: false, credit: '© OpenStreetMap contributors · HOT' }
  ];
  var preferredIndex = 0;

  var state = {
    map: null,
    baseLayer: null,
    providerIndex: 0,
    failedProviders: {},
    providerErrors: 0,
    allFailed: false,
    markersLayer: null,
    routeCasing: null,
    routeLine: null,
    userMarker: null,
    pickMarker: null,
    pickHandler: null,
    markerHandlers: {},
    tileErrors: 0,
    ready: false
  };

  function available() { return typeof window.L !== 'undefined'; }

  function hospitalIcon(selected) {
    var fill = selected ? '#d92b2b' : '#0e5aa7';
    return window.L.divIcon({
      className: '',
      html: '<svg class="pin' + (selected ? ' selected' : '') + '" width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M15 0C6.716 0 0 6.716 0 15c0 10.5 15 25 15 25s15-14.5 15-25C30 6.716 23.284 0 15 0z" fill="' + fill + '"/>' +
        '<circle cx="15" cy="15" r="6.5" fill="#ffffff"/>' +
        '<path d="M13.9 11.6h2.2v2.2h2.2v2.2h-2.2v2.2h-2.2v-2.2h-2.2v-2.2h2.2z" fill="' + fill + '"/>' +
        '</svg>',
      iconSize: [30, 40],
      iconAnchor: [15, 40],
      popupAnchor: [0, -38]
    });
  }

  function userIcon() {
    return window.L.divIcon({
      className: '',
      html: '<div class="pin-user"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });
  }

  function pickIcon() {
    return window.L.divIcon({
      className: '',
      html: '<div class="pin-pick"></div>',
      iconSize: [26, 26],
      iconAnchor: [13, 26]
    });
  }

  function makeLayer(p) {
    var layer = window.L.tileLayer(p.url, {
      subdomains: p.sub,
      maxZoom: p.maxZoom,
      detectRetina: p.retina
    });
    layer.on('tileerror', function (e) {
      if (state.baseLayer && e.target !== state.baseLayer) return;
      onProviderError();
    });
    layer.on('tileload', function (e) {
      if (state.baseLayer && e.target !== state.baseLayer) return;
      state.providerErrors = 0;
      if (window.App && App.onTilesOk) App.onTilesOk();
    });
    return layer;
  }

  function applyProvider(idx, auto) {
    var prev = state.baseLayer;
    state.providerIndex = idx;
    preferredIndex = idx;
    state.providerErrors = 0;
    state.allFailed = false;
    state.baseLayer = makeLayer(PROVIDERS[idx]);
    if (state.map) {
      state.baseLayer.addTo(state.map);
      state.baseLayer.bringToBack();
      if (prev) { try { state.map.removeLayer(prev); } catch (e) {} }
    }
    if (typeof window.App !== 'undefined' && App.onTileProviderChange) {
      App.onTileProviderChange(PROVIDERS[idx], !!auto);
    }
  }

  function onProviderError() {
    if (!state.ready || state.allFailed) return;
    state.providerErrors++;
    if (state.providerErrors < 3) return;
    state.failedProviders[PROVIDERS[state.providerIndex].key] = true;
    var next = -1;
    for (var i = 1; i < PROVIDERS.length; i++) {
      var idx = (state.providerIndex + i) % PROVIDERS.length;
      if (!state.failedProviders[PROVIDERS[idx].key]) { next = idx; break; }
    }
    if (next === -1) {
      state.allFailed = true;
      if (window.App && App.onTileErrors) App.onTileErrors();
      return;
    }
    applyProvider(next, true);
  }

  /**
   * init(container, {center:[lat,lng], zoom, onMapClick})
   * Returns true when the map was created.
   */
  function init(container, opts) {
    if (!available() || !container) return false;
    destroy();

    opts = opts || {};

    try {
      var map = window.L.map(container, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: true,
        zoomSnap: 0.5
      }).setView(opts.center || [26.8467, 80.9461], opts.zoom || 12);

      state.markersLayer = window.L.layerGroup().addTo(map);
      state.map = map;
      state.ready = true;
      state.userMarker = null;
      state.pickMarker = null;
      state.routeLine = null;
      state.routeCasing = null;
      state.markerHandlers = {};
      state.failedProviders = {};
      state.allFailed = false;
      state.providerErrors = 0;
      state.tileErrors = 0;

      state.providerIndex = preferredIndex;
      state.baseLayer = makeLayer(PROVIDERS[state.providerIndex]);
      state.baseLayer.addTo(map);

      if (typeof opts.onMapClick === 'function') {
        map.on('click', function (e) {
          opts.onMapClick(e.latlng);
        });
      }

      setTimeout(function () { try { map.invalidateSize(); } catch (e) {} }, 60);
      return true;
    } catch (e) {
      state.ready = false;
      return false;
    }
  }

  function setUser(latlng, label) {
    if (!state.ready) return;
    if (state.userMarker) state.map.removeLayer(state.userMarker);
    state.userMarker = window.L.marker([latlng.lat, latlng.lng], {
      icon: userIcon(),
      zIndexOffset: 900,
      keyboard: false,
      title: label || 'Your location'
    }).addTo(state.map);
  }

  function clearUser() {
    if (state.ready && state.userMarker) {
      state.map.removeLayer(state.userMarker);
      state.userMarker = null;
    }
  }

  /**
   * setHospitals(list, {selectedId, onSelect})
   * list: [{id, latitude, longitude, ...}]
   */
  function setHospitals(list, opts) {
    if (!state.ready) return;
    opts = opts || {};
    state.markersLayer.clearLayers();
    state.markerHandlers = {};

    list.forEach(function (h) {
      var marker = window.L.marker([h.latitude, h.longitude], {
        icon: hospitalIcon(opts.selectedId === h.id),
        title: h.name
      });
      marker.addTo(state.markersLayer);
      state.markerHandlers[h.id] = marker;
      if (typeof opts.onSelect === 'function') {
        marker.on('click', function () { opts.onSelect(h); });
      }
    });
  }

  function selectMarker(id) {
    if (!state.ready) return;
    Object.keys(state.markerHandlers).forEach(function (key) {
      var m = state.markerHandlers[key];
      if (m && m.setIcon) m.setIcon(hospitalIcon(key === id));
    });
  }

  function setPickMode(enabled, handler) {
    if (!state.ready) return;
    state.pickHandler = enabled ? handler : null;
    if (enabled && !state.pickMarker) {
      state.pickMarker = window.L.marker([0, 0], {
        icon: pickIcon(),
        zIndexOffset: 1000,
        interactive: false
      });
    }
    if (!enabled && state.pickMarker) {
      state.map.removeLayer(state.pickMarker);
      state.pickMarker = null;
    }
  }

  function movePick(latlng) {
    if (!state.ready || !state.pickMarker) return;
    state.pickMarker.setLatLng([latlng.lat, latlng.lng]);
    if (!state.map.hasLayer(state.pickMarker)) state.pickMarker.addTo(state.map);
  }

  function clearPick() {
    if (state.ready && state.pickMarker) {
      state.map.removeLayer(state.pickMarker);
      state.pickMarker = null;
    }
  }

  function drawRoute(latlngs, opts) {
    if (!state.ready || !latlngs || latlngs.length < 2) return false;
    clearRoute();
    opts = opts || {};
    var style = opts.dashed
      ? { color: '#0e5aa7', weight: 5, opacity: .9, dashArray: '2 9', lineCap: 'round' }
      : { color: '#0e5aa7', weight: 6, opacity: .95, lineCap: 'round', lineJoin: 'round' };

    state.routeCasing = window.L.polyline(latlngs, {
      color: '#ffffff', weight: 10, opacity: .9, lineCap: 'round', lineJoin: 'round'
    }).addTo(state.map);

    state.routeLine = window.L.polyline(latlngs, style).addTo(state.map);
    return true;
  }

  function clearRoute() {
    if (!state.ready) return;
    if (state.routeLine) { state.map.removeLayer(state.routeLine); state.routeLine = null; }
    if (state.routeCasing) { state.map.removeLayer(state.routeCasing); state.routeCasing = null; }
  }

  function fit(points, pad) {
    if (!state.ready || !points || !points.length) return;
    try {
      if (points.length === 1) {
        state.map.setView(points[0], 14);
        return;
      }
      var bounds = window.L.latLngBounds(points);
      state.map.fitBounds(bounds, { padding: pad || [46, 46], maxZoom: 15 });
    } catch (e) { /* ignore */ }
  }

  function setView(center, zoom) {
    if (!state.ready) return;
    state.map.setView([center.lat, center.lng], zoom || state.map.getZoom());
  }

  function recenter() {
    if (!state.ready) return;
    state.map.setZoom(state.map.getZoom());
  }

  function toggleStyle() {
    if (!state.ready) return PROVIDERS[state.providerIndex].name;
    var next = (state.providerIndex + 1) % PROVIDERS.length;
    applyProvider(next, false);
    return PROVIDERS[next].name;
  }

  function providerCredit() {
    return PROVIDERS[state.providerIndex].credit;
  }

  function providerName() {
    return PROVIDERS[state.providerIndex].name;
  }

  function getBounds() {
    if (!state.ready) return null;
    return state.map.getBounds();
  }

  function destroy() {
    if (state.map) {
      try { state.map.remove(); } catch (e) { /* ignore */ }
    }
    state.map = null;
    state.ready = false;
    state.markersLayer = null;
    state.userMarker = null;
    state.pickMarker = null;
    state.routeLine = null;
    state.routeCasing = null;
    state.markerHandlers = {};
    state.baseLayer = null;
    state.failedProviders = {};
    state.providerErrors = 0;
    state.allFailed = false;
    state.tileErrors = 0;
  }

  /* ---------------- routing (OSRM) ---------------- */

  /**
   * fetchRoute(from, to) -> Promise<{distanceKm, durationS, coords:[[lat,lng]...]}>
   * coords follow the road network; rejects when offline / service unreachable.
   */
  function fetchRoute(from, to) {
    var url = OSRM_URL + from.lng + ',' + from.lat + ';' + to.lng + ',' + to.lat +
      '?overview=full&geometries=geojson&alternatives=false';

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 9000) : null;

    return fetch(url, controller ? { signal: controller.signal } : undefined)
      .then(function (res) {
        if (timer) clearTimeout(timer);
        if (!res.ok) throw new Error('Routing service error ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (timer) clearTimeout(timer);
        if (!data || data.code !== 'Ok' || !data.routes || !data.routes.length) {
          throw new Error('No route found');
        }
        var route = data.routes[0];
        return {
          distanceKm: route.distance / 1000,
          durationS: route.duration,
          coords: route.geometry.coordinates.map(function (c) { return [c[1], c[0]]; })
        };
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        throw err;
      });
  }

  window.MapKit = {
    available: available,
    isReady: function () { return state.ready; },
    init: init,
    setUser: setUser,
    clearUser: clearUser,
    setHospitals: setHospitals,
    selectMarker: selectMarker,
    setPickMode: setPickMode,
    movePick: movePick,
    clearPick: clearPick,
    drawRoute: drawRoute,
    clearRoute: clearRoute,
    fit: fit,
    setView: setView,
    recenter: recenter,
    toggleStyle: toggleStyle,
    providerCredit: providerCredit,
    providerName: providerName,
    getBounds: getBounds,
    destroy: destroy,
    fetchRoute: fetchRoute
  };
})();
