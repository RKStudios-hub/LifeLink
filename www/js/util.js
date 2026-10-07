/* ==========================================================================
   LifeLink — utilities (icons, formatting, distance, storage, dialogs)
   ========================================================================== */

(function () {
  'use strict';

  var STORE_KEYS = {
    onboarded: 'lifelink.onboarded',
    location: 'lifelink.location',
    permissionAsked: 'lifelink.permissionAsked',
    hospitalEdits: 'lifelink.hospitalEdits',
    importMeta: 'lifelink.importMeta'
  };

  /* ---------------- storage ---------------- */

  function storeGet(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function storeSet(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function storeRemove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  /* ---------------- misc ---------------- */

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function icon(name, extraClass) {
    return '<span class="material-symbols-outlined' +
      (extraClass ? ' ' + extraClass : '') + '">' + name + '</span>';
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 200);
    };
  }

  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

  /* ---------------- distance / time ---------------- */

  function haversineKm(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function fmtDistance(km) {
    if (km === null || km === undefined || isNaN(km)) return '—';
    if (km < 1) return Math.round(km * 1000) + ' m';
    if (km < 10) return km.toFixed(1) + ' km';
    return Math.round(km) + ' km';
  }

  function fmtDuration(seconds) {
    if (seconds === null || seconds === undefined || isNaN(seconds)) return '—';
    var mins = Math.round(seconds / 60);
    if (mins < 1) return '< 1 min';
    if (mins < 60) return mins + ' min';
    var hrs = Math.floor(mins / 60);
    var rem = mins % 60;
    return hrs + ' hr' + (rem ? ' ' + rem + ' min' : '');
  }

  /* ---------------- toast ---------------- */

  var toastTimer = null;

  function toast(message, type) {
    var root = document.getElementById('toast-root');
    if (!root) return;
    root.innerHTML = '';
    var el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.innerHTML = icon(type === 'err' ? 'error' : (type === 'ok' ? 'check_circle' : 'info')) +
      '<span>' + esc(message) + '</span>';
    root.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 3200);
  }

  /* ---------------- modal dialog ---------------- */

  /**
   * openModal({icon, iconClass, title, text, actions:[{label, style, value}]})
   * returns Promise resolving with the chosen action value.
   */
  function openModal(opts) {
    return new Promise(function (resolve) {
      var root = document.getElementById('modal-root');
      if (!root) { resolve(null); return; }

      var actions = (opts.actions || []).map(function (a, i) {
        return '<button class="btn ' + (a.style || 'btn-soft') + ' btn-block" data-value="' +
          esc(a.value === undefined ? String(i) : a.value) + '">' +
          (a.icon ? icon(a.icon) : '') + '<span>' + esc(a.label) + '</span></button>';
      }).join('');

      root.innerHTML =
        '<div class="modal-backdrop" data-dismiss="' + (opts.dismissible === false ? '0' : '1') + '"></div>' +
        '<div class="modal-card" role="dialog" aria-modal="true">' +
        (opts.icon ? '<div class="modal-icon ' + (opts.iconClass || '') + '">' + icon(opts.icon) + '</div>' : '') +
        '<h3 class="modal-title">' + esc(opts.title) + '</h3>' +
        '<p class="modal-text">' + esc(opts.text) + '</p>' +
        '<div class="modal-actions">' + actions + '</div>' +
        '</div>';
      root.classList.add('open');

      function close(value) {
        root.classList.remove('open');
        root.innerHTML = '';
        document.removeEventListener('keydown', onKey);
        resolve(value);
      }

      function onKey(e) {
        if (e.key === 'Escape' && opts.dismissible !== false) close(null);
      }

      document.addEventListener('keydown', onKey);

      Array.prototype.forEach.call(root.querySelectorAll('.modal-actions .btn'), function (btn) {
        btn.addEventListener('click', function () { close(btn.getAttribute('data-value')); });
      });
      var backdrop = root.querySelector('.modal-backdrop');
      if (backdrop) {
        backdrop.addEventListener('click', function () {
          if (backdrop.getAttribute('data-dismiss') === '1') close(null);
        });
      }
    });
  }

  function closeModal() {
    var root = document.getElementById('modal-root');
    if (root) { root.classList.remove('open'); root.innerHTML = ''; }
  }

  /* ---------------- external links ---------------- */

  /**
   * Opens a URL outside the app. Uses the Capacitor Browser plugin when
   * present (APK builds), otherwise a new tab, otherwise a plain redirect.
   */
  function openExternal(url) {
    try {
      var cap = window.Capacitor;
      if (cap && cap.Plugins && cap.Plugins.Browser && typeof cap.Plugins.Browser.open === 'function') {
        cap.Plugins.Browser.open({ url: url });
        return;
      }
    } catch (e) { /* fall through */ }

    var w = null;
    try { w = window.open(url, '_blank', 'noopener'); } catch (e) { w = null; }
    if (!w) window.location.href = url;
  }

  function callNumber(number) {
    if (!number) { toast('No phone number listed', 'err'); return; }
    window.location.href = 'tel:' + String(number).replace(/[^\d+]/g, '');
  }

  /* ---------------- geolocation ---------------- */

  /**
   * requestLocation() -> Promise<{lat,lng,accuracy}>
   * Rejects with an Error whose .code is the GeolocationPositionError code.
   */
  function requestLocation() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        var err = new Error('Geolocation is not supported on this device.');
        err.code = 0;
        reject(err);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy || null
          });
        },
        function (error) {
          var err = new Error(error && error.message ? error.message : 'Location unavailable.');
          err.code = error ? error.code : 2;
          reject(err);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    });
  }

  /* ---------------- formatting ---------------- */

  function fmtUpdated(dateStr) {
    if (!dateStr) return 'unknown';
    var d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    try {
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  }

  function plural(n, word) {
    if (n === 1) return n + ' ' + word;
    if (/[^aeiou]y$/i.test(word)) return n + ' ' + word.replace(/y$/i, 'ies');
    if (/(s|x|z|ch|sh)$/i.test(word)) return n + ' ' + word + 'es';
    return n + ' ' + word + 's';
  }

  window.U = {
    STORE_KEYS: STORE_KEYS,
    storeGet: storeGet,
    storeSet: storeSet,
    storeRemove: storeRemove,
    esc: esc,
    icon: icon,
    $: $,
    $$: $$,
    debounce: debounce,
    clamp: clamp,
    haversineKm: haversineKm,
    fmtDistance: fmtDistance,
    fmtDuration: fmtDuration,
    fmtUpdated: fmtUpdated,
    plural: plural,
    toast: toast,
    openModal: openModal,
    closeModal: closeModal,
    openExternal: openExternal,
    callNumber: callNumber,
    requestLocation: requestLocation
  };
})();
