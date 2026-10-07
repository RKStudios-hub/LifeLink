/* ==========================================================================
   LifeLink — app controller (state, router, events, offline handling)
   ========================================================================== */

(function () {
  'use strict';

  var DEFAULT_CENTER = { lat: 26.8467, lng: 80.9461 };   /* Hazratganj, Lucknow */
  var GITHUB_URL = 'https://github.com/RKStudios-hub/LifeLink';
  var OSM_URL = 'https://www.openstreetmap.org/copyright';

  var App = {
    VERSION: '1.0.0',
    hospitals: [],
    location: null,
    datasetUpdated: null,
    query: '',
    filters: { nearest: true, emergency: false, icu: false, ambulance: false },
    online: typeof navigator.onLine === 'boolean' ? navigator.onLine : true,
    currentRoute: { name: 'home', params: {} },
    errors: [],
    _stack: []
  };
  window.App = App;

  var startupStartedAt = Date.now();
  var startupFinished = false;

  function finishStartup() {
    if (startupFinished) return;
    startupFinished = true;
    var splash = document.getElementById('startup-screen');
    var appRoot = document.getElementById('app');
    function revealApp() {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          if (appRoot) appRoot.classList.add('app-ready');
        });
      });
    }
    if (!splash) { revealApp(); return; }
    var delay = Math.max(0, 800 - (Date.now() - startupStartedAt));
    window.setTimeout(function () {
      splash.classList.add('startup-screen--done');
      splash.setAttribute('aria-hidden', 'true');
      revealApp();
    }, delay);
  }

  var K = U.STORE_KEYS;

  /* ================================================================== */
  /* Data loading                                                        */
  /* ================================================================== */

  function loadHospitals() {
    var embedded = window.LIFELINK_HOSPITALS;
    if (embedded && embedded.length) {
      return Promise.resolve(embedded);
    }
    return fetch('data/hospitals.json', { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .catch(function (err) {
        throw new Error('Hospital data could not be loaded: ' + err.message);
      });
  }

  /* ================================================================== */
  /* CSV import / export — update hospital information from a spreadsheet */
  /* ================================================================== */

  var CSV_COLUMNS = [
    'hospital_id', 'name', 'location', 'area', 'contact', 'lat', 'lon',
    'rating', 'price_range', 'doctors', 'blood_stock', 'ambulances',
    'icu_available', 'beds_available', 'emergency_services', 'disease_cases'
  ];

  function parseCsv(text) {
    var rows = [], row = [], field = '', inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
      else if (c !== '\r') field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    var header = rows.shift();
    if (!header || !header.length) return [];
    return rows
      .filter(function (r) { return r.length > 1 && String(r[0]).trim() !== ''; })
      .map(function (r) {
        var obj = {};
        header.forEach(function (h, i) { obj[h] = r[i] === undefined ? '' : r[i]; });
        return obj;
      });
  }

  function csvQuote(value) {
    var s = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function yesValue(v) { return String(v || '').trim().toLowerCase() === 'yes'; }

  function parseDiseaseCases(text) {
    var out = {};
    String(text || '').split(',').forEach(function (part) {
      var idx = part.lastIndexOf(':');
      if (idx < 1) return;
      var name = part.slice(0, idx).trim();
      var count = parseInt(part.slice(idx + 1), 10);
      if (name && isFinite(count)) out[name] = count;
    });
    return out;
  }

  function parseBloodStock(text) {
    var out = {};
    String(text || '').split('|').forEach(function (part) {
      var b = part.split(':');
      if (b.length === 2 && b[0]) out[b[0]] = parseInt(b[1], 10) || 0;
    });
    return out;
  }

  function parseDoctorList(text) {
    return String(text || '').split('|').map(function (p) {
      var b = p.split(':');
      if (b.length === 4) return { name: b[0], specialty: b[1], experience: parseInt(b[2], 10), fee: parseInt(b[3], 10) };
      if (b.length === 2) return { name: b[0], specialty: b[1], experience: null, fee: null };
      if (b.length === 1 && p.trim()) return { name: p.trim(), specialty: '', experience: null, fee: null };
      return null;
    }).filter(Boolean);
  }

  function parseAmbulanceList(text) {
    return String(text || '').split('|').map(function (p) {
      var b = p.split(':');
      if (b.length === 3) return { vehicle: b[0], driver: b[1], phone: b[2] };
      return null;
    }).filter(Boolean);
  }

  function serializeDoctorList(list) {
    return (list || []).map(function (d) {
      if (d.experience !== null && d.experience !== undefined && d.fee !== null && d.fee !== undefined) {
        return d.name + ':' + d.specialty + ':' + d.experience + ':' + d.fee;
      }
      return d.name + ':' + d.specialty;
    }).join('|');
  }

  function serializeBlood(map) {
    return Object.keys(map || {})
      .map(function (g) { return g + ':' + map[g]; })
      .join('|');
  }

  function serializeAmbulanceList(list) {
    return (list || []).map(function (a) { return a.vehicle + ':' + a.driver + ':' + a.phone; }).join('|');
  }

  function serializeDiseaseCases(map) {
    return Object.keys(map || {})
      .map(function (k) { return k + ':' + map[k]; })
      .join(',');
  }

  function baseById(id) {
    var base = App.baseHospitals || App.hospitals;
    for (var i = 0; i < base.length; i++) {
      if (base[i].id === id) return base[i];
    }
    return null;
  }

  function deriveFacilities(h) {
    var f = [];
    if (h.emergency_available) f.push('24/7 Emergency');
    if (h.icu_available) f.push('Intensive Care Unit (ICU)');
    if (isFinite(h.beds_available) && h.beds_available > 0) f.push('Inpatient beds');
    if ((h.ambulances || []).length || h.ambulance_available) f.push('Ambulance service');
    if (Object.keys(h.blood_availability || {}).length) f.push('Blood stock information');
    if ((h.doctors || []).length) f.push('Outpatient department');
    return f;
  }

  /* Overlay locally imported CSV changes on top of the built-in dataset. */
  function applyEdits(base) {
    var edits = U.storeGet(K.hospitalEdits, {}) || {};
    if (!Object.keys(edits).length) return base;

    return base.map(function (h) {
      var e = edits[h.id];
      if (!e) return h;
      var m = {};
      Object.keys(h).forEach(function (k) { m[k] = h[k]; });
      Object.keys(e).forEach(function (k) { m[k] = e[k]; });
      if (e.doctors) {
        var seen = {}, specs = [];
        (m.doctors || []).forEach(function (d) {
          if (d.specialty && !seen[d.specialty]) { seen[d.specialty] = 1; specs.push(d.specialty); }
        });
        m.specialties = specs.sort();
      }
      m.facilities = deriveFacilities(m);
      m.edited = true;
      return m;
    });
  }

  App.editCount = function () {
    var edits = U.storeGet(K.hospitalEdits, {}) || {};
    return Object.keys(edits).length;
  };

  /**
   * importCsv(csvText) — merges rows keyed by hospital_id into the local edit
   * overlay. Returns { updated, skipped, fields } or { error }.
   */
  App.importCsv = function (text) {
    var rows;
    try { rows = parseCsv(text); } catch (e) { return { error: 'Could not read that CSV: ' + e.message }; }
    if (!rows.length) return { error: 'That CSV has no data rows (header row required)' };

    var edits = U.storeGet(K.hospitalEdits, {}) || {};
    var updated = 0, skipped = 0, fields = 0;

    rows.forEach(function (r) {
      var num = parseInt(r.hospital_id, 10);
      var id = isFinite(num) ? 'hospital-' + String(num).padStart(3, '0') : null;
      var base = id ? baseById(id) : null;
      if (!base) { skipped++; return; }

      var e = {};
      function str(key, col) {
        var v = String(r[col] === undefined ? '' : r[col]).trim();
        if (v) e[key] = v;
      }
      str('name', 'name');
      str('phone', 'contact');
      str('price_range', 'price_range');
      str('source_location', 'location');

      var area = String(r.area || '').trim() || String(r.location || '').trim();
      if (area) {
        e.area = area;
        e.address = area + ', Lucknow';
        e.locality = area.split('-').pop().trim();
      }

      var lat = parseFloat(r.lat), lon = parseFloat(r.lon);
      if (String(r.lat || '').trim() !== '' && isFinite(lat) && lat >= -90 && lat <= 90) e.latitude = lat;
      if (String(r.lon || '').trim() !== '' && isFinite(lon) && lon >= -180 && lon <= 180) e.longitude = lon;

      var ratingRaw = String(r.rating || '').trim();
      if (ratingRaw !== '') {
        var rating = parseFloat(ratingRaw);
        e.rating = isFinite(rating) ? Math.max(0, Math.min(5, rating)) : null;
      }

      if (String(r.beds_available || '').trim() !== '') {
        var beds = parseInt(r.beds_available, 10);
        e.beds_available = isFinite(beds) && beds >= 0 ? beds : null;
      }
      if (String(r.emergency_services || '').trim() !== '') e.emergency_available = yesValue(r.emergency_services);
      if (String(r.icu_available || '').trim() !== '') e.icu_available = yesValue(r.icu_available);
      if (String(r.ambulances || '').trim() !== '') {
        e.ambulances = parseAmbulanceList(r.ambulances);
        e.ambulance_available = e.ambulances.length > 0;
      }
      if (String(r.blood_stock || '').trim() !== '') e.blood_availability = parseBloodStock(r.blood_stock);
      if (String(r.doctors || '').trim() !== '') e.doctors = parseDoctorList(r.doctors);
      if (String(r.disease_cases || '').trim() !== '') e.disease_cases = parseDiseaseCases(r.disease_cases);

      var keys = Object.keys(e);
      if (!keys.length) { skipped++; return; }
      edits[id] = Object.assign({}, edits[id] || {}, e);
      updated++;
      fields += keys.length;
    });

    if (!updated) {
      return { error: 'No known hospitals found — check the hospital_id column', skipped: skipped, updated: 0 };
    }
    U.storeSet(K.hospitalEdits, edits);
    App.hospitals = applyEdits(App.baseHospitals || App.hospitals);
    return { updated: updated, skipped: skipped, fields: fields };
  };

  /* Serialise the current (merged) dataset back to the original CSV format. */
  App.exportCsv = function () {
    var lines = [CSV_COLUMNS.join(',')];
    (App.baseHospitals || []).forEach(function (base) {
      var m = App.byId(base.id) || base;
      var cells = [
        base.source_id || String(base.id || '').replace(/\D/g, ''),
        m.name,
        m.source_location || m.area || '',
        m.area || '',
        m.phone || '',
        isFinite(m.latitude) ? Number(m.latitude).toFixed(4) : '',
        isFinite(m.longitude) ? Number(m.longitude).toFixed(4) : '',
        m.rating === null || m.rating === undefined ? '' : m.rating,
        m.price_range || '',
        serializeDoctorList(m.doctors),
        serializeBlood(m.blood_availability),
        serializeAmbulanceList(m.ambulances),
        m.icu_available ? 'Yes' : 'No',
        m.beds_available === null || m.beds_available === undefined ? '' : m.beds_available,
        m.emergency_available ? 'Yes' : 'No',
        serializeDiseaseCases(m.disease_cases)
      ];
      lines.push(cells.map(csvQuote).join(','));
    });
    return lines.join('\r\n') + '\r\n';
  };

  App.resetImport = function () {
    U.storeRemove(K.hospitalEdits);
    U.storeRemove(K.importMeta);
    App.importMeta = null;
    App.hospitals = applyEdits(App.baseHospitals || App.hospitals);
  };

  /* ================================================================== */
  /* Queries                                                             */
  /* ================================================================== */

  App.byId = function (id) {
    for (var i = 0; i < App.hospitals.length; i++) {
      if (App.hospitals[i].id === id) return App.hospitals[i];
    }
    return null;
  };

  App.distanceTo = function (h) {
    if (!App.location) return null;
    return U.haversineKm(App.location.lat, App.location.lng, h.latitude, h.longitude);
  };

  App.nearest = function (n) {
    var list = App.hospitals.slice();
    if (App.location) {
      list.sort(function (a, b) { return App.distanceTo(a) - App.distanceTo(b); });
    } else {
      list.sort(function (a, b) {
        return (b.beds_available || 0) - (a.beds_available || 0);
      });
    }
    return list.slice(0, n || 3);
  };

  App.filteredHospitals = function () {
    var q = App.query.trim().toLowerCase();
    var f = App.filters;

    var list = App.hospitals.filter(function (h) {
      if (f.emergency && !h.emergency_available) return false;
      if (f.icu && !h.icu_available) return false;
      if (f.ambulance && !h.ambulance_available) return false;
      if (!q) return true;

      if (h.name.toLowerCase().indexOf(q) !== -1) return true;
      if ((h.address || '').toLowerCase().indexOf(q) !== -1) return true;
      if ((h.locality || '').toLowerCase().indexOf(q) !== -1) return true;
      if ((h.specialties || []).some(function (s) { return s.toLowerCase().indexOf(q) !== -1; })) return true;
      if ((h.doctors || []).some(function (d) { return d.name.toLowerCase().indexOf(q) !== -1; })) return true;
      return false;
    });

    if (f.nearest && App.location) {
      list.sort(function (a, b) { return App.distanceTo(a) - App.distanceTo(b); });
    } else {
      list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    }
    return list;
  };

  App.bloodTotals = function () {
    var totals = {};
    App.hospitals.forEach(function (h) {
      var blood = h.blood_availability || {};
      Object.keys(blood).forEach(function (g) {
        totals[g] = (totals[g] || 0) + blood[g];
      });
    });
    return totals;
  };

  App.defaultDocuments = function () {
    var h = App.hospitals[0];
    return (h && h.required_documents) ? h.required_documents : [];
  };

  /* Aggregates the disease_cases field across the dataset (drives #/trends). */
  App.diseaseTrends = function () {
    var totals = {};
    var reporting = 0;
    var totalCases = 0;
    var byHospital = [];
    var byArea = {};

    App.hospitals.forEach(function (h) {
      var cases = h.disease_cases || {};
      var keys = Object.keys(cases);
      if (!keys.length) return;
      reporting++;

      var sum = 0;
      keys.forEach(function (k) {
        totals[k] = (totals[k] || 0) + cases[k];
        sum += cases[k];
      });
      totalCases += sum;

      byArea[h.area || h.locality || 'Unknown'] = (byArea[h.area || h.locality || 'Unknown'] || 0) + sum;

      var top = keys.map(function (k) { return { name: k, count: cases[k] }; })
        .sort(function (a, b) { return b.count - a.count; })
        .slice(0, 3);
      byHospital.push({ h: h, total: sum, top: top });
    });

    var ranked = Object.keys(totals)
      .map(function (k) { return { name: k, count: totals[k] }; })
      .sort(function (a, b) { return b.count - a.count; });

    var areas = Object.keys(byArea)
      .map(function (k) { return { name: k, count: byArea[k] }; })
      .sort(function (a, b) { return b.count - a.count; });

    return {
      ranked: ranked,
      totalCases: totalCases,
      diseaseCount: ranked.length,
      reporting: reporting,
      byHospital: byHospital.sort(function (a, b) { return b.total - a.total; }),
      byArea: areas
    };
  };

  /* ================================================================== */
  /* Smart search (patient-driven nearest hospital matching)            */
  /* ================================================================== */

  /* Lucknow locality keywords -> coordinates (same idea as the CLI tool). */
  var AREA_COORDS = {
    gomti: [26.8624, 81.0203], gomtinagar: [26.8624, 81.0203],
    indira: [26.8840, 80.9830], hazratganj: [26.8520, 80.9443],
    golaganj: [26.8550, 80.9280], aliganj: [26.9000, 80.9300],
    chowk: [26.8660, 80.9230], mahanagar: [26.8730, 80.9600],
    rajajipuram: [26.8700, 80.8800], alambagh: [26.8350, 80.9050],
    vibhuti: [26.8300, 81.0500], jankipuram: [26.9000, 80.9000],
    nirala: [26.8680, 80.9750], aminabad: [26.8640, 80.9110],
    lucknow: [26.8467, 80.9461], kanpur: [26.7982, 80.9015]
  };

  App.bloodGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

  /* Department suggestions = every specialty present in the dataset. */
  App.departments = function () {
    if (App._departments) return App._departments;
    var set = {};
    App.hospitals.forEach(function (h) {
      (h.specialties || []).forEach(function (s) { set[s] = 1; });
      (h.doctors || []).forEach(function (d) { set[d.specialty] = 1; });
    });
    App._departments = Object.keys(set).sort();
    return App._departments;
  };

  App.areasList = function () {
    if (App._areas) return App._areas;
    var set = {};
    App.hospitals.forEach(function (h) {
      if (h.locality) set[h.locality] = 1;
      if (h.area) set[h.area] = 1;
    });
    App._areas = Object.keys(set).sort();
    return App._areas;
  };

  function resolveOrigin(areaText) {
    var a = (areaText || '').trim().toLowerCase();
    if (a) {
      for (var key in AREA_COORDS) {
        if (a.indexOf(key) !== -1 || key.indexOf(a) !== -1) {
          return { lat: AREA_COORDS[key][0], lng: AREA_COORDS[key][1], label: areaText };
        }
      }
      var match = null;
      App.hospitals.forEach(function (h) {
        if (match) return;
        var hay = ((h.locality || '') + ' ' + (h.area || '')).toLowerCase();
        if (hay.indexOf(a) !== -1) match = h;
      });
      if (match) return { lat: match.latitude, lng: match.longitude, label: areaText };
      if (App.location) return { lat: App.location.lat, lng: App.location.lng, label: areaText + ' (using current location)' };
      return { lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lng, label: areaText + ' (default area)' };
    }
    if (App.location) return { lat: App.location.lat, lng: App.location.lng, label: 'your current location' };
    return { lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lng, label: 'Lucknow centre' };
  }

  function priceBounds(h) {
    var pr = String(h.price_range || '').split('-');
    var lo = parseInt(pr[0], 10), hi = parseInt(pr[1], 10);
    if (isNaN(lo)) lo = 0;
    if (isNaN(hi) || hi < lo) hi = lo;
    return [lo, hi];
  }

  function findDoctor(h, department) {
    var docs = h.doctors || [];
    if (!docs.length) return null;
    var sp = (department || '').trim().toLowerCase();
    if (!sp) return null;
    var i;
    for (i = 0; i < docs.length; i++) {
      if ((docs[i].specialty || '').toLowerCase().indexOf(sp) !== -1) return { doctor: docs[i], matched: true };
    }
    var words = sp.split(/\s+/);
    for (i = 0; i < docs.length; i++) {
      var s = (docs[i].specialty || '').toLowerCase();
      for (var w = 0; w < words.length; w++) {
        if (words[w].length > 2 && s.indexOf(words[w]) !== -1) return { doctor: docs[i], matched: true };
      }
    }
    return { doctor: docs[0], matched: false };
  }

  /**
   * App.smartSearch(query) -> {origin, results, relaxedBudget, relaxedCritical}
   * query: {name, department, budgetMin, budgetMax, area, bloodGroup, criticality}
   * results: [{h, dist, score, reasons, doctor}] sorted best-first.
   */
  App.smartSearch = function (query) {
    var q = query || {};
    var origin = resolveOrigin(q.area);
    var criticality = (q.criticality || 'high').toLowerCase();
    var bMin = q.budgetMin, bMax = q.budgetMax;
    var hasBudget = (bMin !== null && bMin !== undefined && bMin !== '') ||
      (bMax !== null && bMax !== undefined && bMax !== '');
    bMin = (bMin === null || bMin === undefined || bMin === '') ? 0 : Number(bMin);
    bMax = (bMax === null || bMax === undefined || bMax === '') ? Infinity : Number(bMax);

    var candidates = App.hospitals.map(function (h) {
      return { h: h, dist: U.haversineKm(origin.lat, origin.lng, h.latitude, h.longitude) };
    });

    /* hard filters (relaxed gracefully when they empty the list) */
    var relaxedBudget = false;
    if (hasBudget) {
      var fitted = candidates.filter(function (c) {
        var b = priceBounds(c.h);
        return b[1] >= bMin && b[0] <= bMax;
      });
      if (fitted.length) candidates = fitted;
      else relaxedBudget = true;
    }

    var relaxedCritical = false;
    if (criticality === 'critical') {
      var icu = candidates.filter(function (c) {
        return c.h.icu_available && c.h.emergency_available;
      });
      if (icu.length) candidates = icu;
      else relaxedCritical = true;
    }

    var maxDist = 0;
    candidates.forEach(function (c) { if (c.dist > maxDist) maxDist = c.dist; });

    candidates.forEach(function (c) {
      var h = c.h;
      var score = 0;
      var reasons = [];

      /* proximity (up to 40) */
      var dScore = maxDist > 0.05 ? Math.round(40 * (1 - c.dist / maxDist)) : 40;
      score += dScore;
      if (c.dist < 1000) reasons.push(c.dist < 1 ? (Math.round(c.dist * 1000) + ' m away') : (c.dist.toFixed(1) + ' km away'));

      /* criticality fit (up to 20) */
      if (criticality === 'critical') {
        if (h.icu_available) { score += 15; reasons.push('ICU available'); }
        if (h.emergency_available) score += 5;
        if (h.ambulance_available) { score += 5; reasons.push('Ambulance on call'); }
      } else if (criticality === 'high') {
        if (h.emergency_available) { score += 10; reasons.push('24/7 emergency'); }
        if (h.icu_available) score += 5;
      } else if (criticality === 'medium') {
        if (h.emergency_available) { score += 8; reasons.push('24/7 emergency'); }
      } else if (h.emergency_available) score += 5;

      /* department (up to 20) */
      if (q.department) {
        var docHit = findDoctor(h, q.department);
        c.doctor = docHit;
        if (docHit && docHit.matched) { score += 20; reasons.push(docHit.doctor.specialty + ' specialist'); }
        else {
          var sp = q.department.toLowerCase();
          var tag = (h.specialties || []).some(function (s) { return s.toLowerCase().indexOf(sp) !== -1 || sp.indexOf(s.toLowerCase()) !== -1; });
          if (tag) { score += 12; reasons.push(q.department + ' department'); }
        }
      }

      /* budget (up to 15) */
      if (hasBudget && !relaxedBudget) { score += 15; reasons.push('Within ₹' + bMin + '–' + (bMax === Infinity ? '…' : bMax)); }

      /* blood group (up to 15) */
      if (q.bloodGroup) {
        var units = h.blood_availability ? h.blood_availability[q.bloodGroup] : undefined;
        if (units > 0) { score += 15; reasons.push(q.bloodGroup + ' in stock (' + units + ' units)'); }
        else if (units === 0) reasons.push(q.bloodGroup + ' out of stock');
      }

      /* rating (up to 10) */
      score += Math.round(((h.rating || 0) / 5) * 10);
      if (h.rating) reasons.push(h.rating + '★ rating');

      c.score = score;
      c.reasons = reasons;
    });

    candidates.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.dist - b.dist;
    });

    return {
      origin: origin,
      query: q,
      criticality: criticality,
      relaxedBudget: relaxedBudget,
      relaxedCritical: relaxedCritical,
      results: candidates
    };
  };

  /* ================================================================== */
  /* Location                                                            */
  /* ================================================================== */

  App.setLocation = function (loc) {
    App.location = loc;
    if (loc) U.storeSet(K.location, loc);
    else U.storeRemove(K.location);
  };

  function restoreLocation() {
    var saved = U.storeGet(K.location, null);
    if (saved && typeof saved.lat === 'number' && typeof saved.lng === 'number') {
      App.location = saved;
    }
  }

  /**
   * requestLocation({then}) — 'hospitals' | 'stay'
   */
  function requestLocation(opts) {
    opts = opts || {};
    var asked = U.storeGet(K.permissionAsked, false);

    if (!asked) {
      App.pendingLocationThen = opts.then || 'stay';
      go('#/permission');
      return;
    }
    doLocate(opts.then || 'stay');
  }

  function doLocate(then) {
    U.toast('Getting your location…');
    U.requestLocation()
      .then(function (pos) {
        App.setLocation({
          mode: 'gps',
          lat: pos.lat,
          lng: pos.lng,
          accuracy: pos.accuracy,
          label: null
        });
        U.storeSet(K.permissionAsked, true);
        U.toast('Location updated', 'ok');
        if (then === 'hospitals') go('#/hospitals');
        else render();
      })
      .catch(function (err) {
        if (err && err.code === 1) {
          U.openModal({
            icon: 'location_off',
            iconClass: 'red',
            title: 'Location permission denied',
            text: 'LifeLink cannot read your GPS position. You can still choose a location on the map — every hospital feature works with a manually selected location.',
            actions: [
              { label: 'Choose location manually', style: 'btn-primary', value: 'manual', icon: 'map' },
              { label: 'Close', style: 'btn-ghost', value: 'close' }
            ]
          }).then(function (v) {
            if (v === 'manual') go('#/map?select=1');
          });
        } else {
          U.toast('Could not get your location. Try selecting it on the map.', 'err');
        }
      });
  }

  /* ================================================================== */
  /* Routing                                                             */
  /* ================================================================== */

  function parseHash() {
    var raw = (location.hash || '').replace(/^#/, '');
    if (!raw || raw === '/') return { name: 'root', params: {}, query: {} };

    var qi = raw.indexOf('?');
    var query = {};
    if (qi >= 0) {
      raw.slice(qi + 1).split('&').forEach(function (pair) {
        var kv = pair.split('=');
        query[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
      });
      raw = raw.slice(0, qi);
    }

    var parts = raw.split('/').filter(Boolean).map(decodeURIComponent);
    if (!parts.length) return { name: 'root', params: {}, query: query };

    var name = parts[0];
    var known = ['home', 'hospitals', 'hospital', 'map', 'route', 'about', 'blood', 'documents', 'settings', 'trends', 'find', 'welcome', 'permission'];
    if (known.indexOf(name) === -1) name = 'home';

    return { name: name, params: { id: parts[1] || null }, query: query };
  }

  function parentRoute(route) {
    switch (route.name) {
      case 'hospital': return '#/hospitals';
      case 'route': return route.params.id ? '#/hospital/' + route.params.id : '#/hospitals';
      case 'hospitals': return '#/home';
      case 'map': return '#/home';
      case 'settings':
      case 'blood':
      case 'trends':
      case 'find':
      case 'documents': return '#/home';
      case 'about': return '#/home';
      default: return '#/home';
    }
  }

  function go(hash) {
    if (('#' + (location.hash || '').replace(/^#/, '')) === hash) {
      route();
      return;
    }
    location.hash = hash;
  }

  function back() {
    if (App._stack.length > 1) {
      history.back();
    } else {
      go(parentRoute(App.currentRoute));
    }
  }

  function route() {
    var r = parseHash();
    var hash = location.hash || '#/';

    /* keep the navigation stack in sync so "back" behaves like an app */
    var idx = App._stack.lastIndexOf(hash);
    if (idx !== App._stack.length - 1) {
      if (idx === App._stack.length - 2) App._stack.pop();
      else App._stack.push(hash);
    }

    /* first launch: force the welcome flow */
    var onboarded = U.storeGet(K.onboarded, false);
    if (!onboarded && r.name !== 'welcome' && r.name !== 'permission') {
      r = { name: 'welcome', params: { step: 'intro' }, query: {} };
    }

    if (r.name === 'root') r = { name: 'home', params: {}, query: r.query };

    var screen;
    switch (r.name) {
      case 'welcome': screen = Screens.welcome(r.params.step || 'intro'); break;
      case 'permission': screen = Screens.welcome('permission'); break;
      case 'home': screen = Screens.home(); break;
      case 'hospitals': screen = Screens.hospitals(); break;
      case 'hospital': screen = Screens.hospital(r.params); break;
      case 'map': screen = Screens.map({ select: r.query.select }); break;
      case 'route': screen = Screens.route(r.params); break;
      case 'blood': screen = Screens.blood(); break;
      case 'trends': screen = Screens.trends(); break;
      case 'find': screen = Screens.find(); break;
      case 'documents': screen = Screens.documents(); break;
      case 'about': screen = Screens.about(); break;
      case 'settings': screen = Screens.settings(); break;
      default: screen = Screens.home();
    }

    App.currentRoute = r;

    /* leaving a map screen — tear the Leaflet instance down */
    if (MapKit.isReady()) MapKit.destroy();

    renderHeader(screen);
    renderNav(screen);

    var screenEl = document.getElementById('screen');
    screenEl.className = 'screen' +
      (screen.hideNav ? ' no-nav' : '') +
      (screen.mapMode ? ' map-mode' : '');
    screenEl.innerHTML = screen.html;
    screenEl.scrollTop = 0;

    if (typeof screen.mount === 'function') {
      try { screen.mount(screenEl); } catch (e) { logError(e); }
    }

    updateOfflineUI();
  }

  /* ================================================================== */
  /* Chrome (header + bottom nav)                                        */
  /* ================================================================== */

  function renderHeader(screen) {
    var header = document.getElementById('app-header');
    if (screen.hideHeader) { header.hidden = true; return; }
    header.hidden = false;

    var h = screen.header || { title: 'LifeLink', sub: '' };
    var left = h.back
      ? '<button class="icon-btn back-btn" data-act="back" aria-label="Back">' + U.icon('arrow_back') + '</button>'
      : '<div class="header-brand"><img src="icons/icon.png" alt="LifeLink" class="brand-img"></div>';

    var right = h.action
      ? '<button class="icon-btn" data-act="' + U.esc(h.action.act) + '"' +
        (h.action.route ? ' data-route="' + U.esc(h.action.route) + '"' : '') +
        ' aria-label="' + U.esc(h.action.label || 'Action') + '">' + U.icon(h.action.icon) + '</button>'
      : '';

    header.innerHTML =
      '<div class="header-inner">' + left +
        '<div class="header-text">' +
          '<div class="header-title">' + U.esc(h.title) + '</div>' +
          (h.sub ? '<div class="header-sub">' + (h.subDot ? '<span class="dot-green"></span>' : '') +
            '<span>' + U.esc(h.sub) + '</span></div>' : '') +
        '</div>' + right +
      '</div>';
  }

  function renderNav(screen) {
    var nav = document.getElementById('bottom-nav');
    var wasVisible = !nav.hidden;
    nav.hidden = !!screen.hideNav;
    if (screen.hideNav) return;

    var items = [
      { tab: 'home', route: '#/home', icon: 'home', label: 'Home' },
      { tab: 'hospitals', route: '#/hospitals', icon: 'local_hospital', label: 'Hospitals' },
      { tab: 'map', route: '#/map', icon: 'near_me', label: 'Map' },
      { tab: 'about', route: '#/about', icon: 'info', label: 'About' }
    ];

    var activeIndex = items.findIndex(function (it) { return screen.tab === it.tab; });
    var previousIndex = parseInt(nav.getAttribute('data-active-index'), 10);
    var canSlide = wasVisible && isFinite(previousIndex) && previousIndex !== activeIndex;
    nav.style.setProperty('--nav-offset', (Math.max(0, canSlide ? previousIndex : activeIndex) * 100) + '%');
    nav.innerHTML = '<div class="nav-inner"><span class="nav-indicator" aria-hidden="true"></span>' + items.map(function (it) {
      var active = screen.tab === it.tab;
      return '<button class="nav-item' + (active ? ' active' : '') + '" data-act="nav" data-route="' + it.route + '"' +
        (active ? ' aria-current="page"' : '') + '>' +
        '<span class="nav-pill">' + U.icon(it.icon) + '</span>' +
      '<span>' + it.label + '</span></button>';
    }).join('') + '</div>';
    nav.setAttribute('data-active-index', String(Math.max(0, activeIndex)));
    if (canSlide) {
      var indicator = nav.querySelector('.nav-indicator');
      if (indicator) indicator.getBoundingClientRect();
      window.requestAnimationFrame(function () {
        nav.style.setProperty('--nav-offset', (Math.max(0, activeIndex) * 100) + '%');
      });
    }
  }

  /* ================================================================== */
  /* Map screen behaviour                                                */
  /* ================================================================== */

  App.mountMap = function (selectMode) {
    var container = document.getElementById('map');
    var center = App.location || DEFAULT_CENTER;

    var ok = MapKit.init(container, {
      center: [center.lat, center.lng],
      zoom: App.location ? 13 : 12,
      onMapClick: function (latlng) {
        if (selectMode) onMapPicked(latlng);
      }
    });

    if (!ok) {
      var fb = document.getElementById('map-fallback');
      if (fb) fb.classList.add('show');
      return;
    }

    if (App.location) MapKit.setUser(App.location, 'Your location');

    MapKit.setHospitals(App.hospitals, {
      onSelect: function (h) {
        if (selectMode) return;
        MapKit.selectMarker(h.id);
        renderMapSheet(h);
      }
    });

    if (selectMode) {
      MapKit.setPickMode(true, onMapPicked);
      renderSelectSheet(null);
      setPill('Tap anywhere to drop a pin', 'We will not move your GPS position');
    } else {
      updateMapPill();
      if (App.location) {
        var near = App.nearest(1)[0];
        if (near) {
          MapKit.selectMarker(near.id);
          MapKit.fit([[App.location.lat, App.location.lng], [near.latitude, near.longitude]]);
          renderMapSheet(near);
        }
      } else {
        renderNoLocationSheet();
        MapKit.fit(App.hospitals.map(function (h) { return [h.latitude, h.longitude]; }));
      }
    }

    var note = document.getElementById('map-note-text');
    if (note) {
      note.textContent = MapKit.providerCredit() + ' · ' + App.hospitals.length + ' hospitals';
    }
    updateOfflineUI();
  };

  var pickedLatLng = null;

  function onMapPicked(latlng) {
    pickedLatLng = { lat: latlng.lat, lng: latlng.lng };
    MapKit.movePick(pickedLatLng);
    renderSelectSheet(pickedLatLng);
  }

  function setPill(text, sub) {
    var el = document.getElementById('map-pill-text');
    if (el) {
      el.innerHTML = U.esc(text) + (sub ? '<span class="pill-sub">' + U.esc(sub) + '</span>' : '');
    }
  }

  function updateMapPill() {
    var loc = App.location;
    if (loc) {
      setPill(
        (loc.mode === 'gps' ? 'Your location' : 'Selected location'),
        U.plural(App.hospitals.length, 'hospital') + ' in dataset · distances enabled'
      );
    } else {
      setPill('No location set', 'Tap a hospital pin, or set a location');
    }
  }

  function renderSelectSheet(pick) {
    var el = document.getElementById('map-sheet');
    if (!el) return;
    el.innerHTML =
      '<div class="sheet">' +
        '<div class="sheet-grip"></div>' +
        '<div class="sheet-head">' +
          '<div class="hosp-avatar">' + U.icon(pick ? 'place' : 'edit_location') + '</div>' +
          '<div class="hosp-main">' +
            '<h3 class="sheet-title">' + (pick ? 'Selected location' : 'Choose a location') + '</h3>' +
            '<div class="sheet-sub">' + (pick
              ? U.esc(pick.lat.toFixed(5) + ', ' + pick.lng.toFixed(5))
              : 'Tap anywhere on the map to drop a pin') + '</div>' +
          '</div>' +
        '</div>' +
        '<button class="btn btn-primary btn-block btn-lg" data-act="confirm-location"' +
          (pick ? '' : ' disabled') + '>' + U.icon('check_circle') + '<span>Confirm Location</span></button>' +
        '<div class="note">' + U.icon('info') +
          '<span>Confirming sets this as your search origin. No GPS permission is needed.</span></div>' +
      '</div>';
  }

  function renderNoLocationSheet() {
    var el = document.getElementById('map-sheet');
    if (!el) return;
    el.innerHTML =
      '<div class="sheet">' +
        '<div class="sheet-grip"></div>' +
        '<div class="sheet-head">' +
          '<div class="hosp-avatar">' + U.icon('near_me') + '</div>' +
          '<div class="hosp-main">' +
            '<h3 class="sheet-title">' + App.hospitals.length + ' hospitals on the map</h3>' +
            '<div class="sheet-sub">Set a location to see distances, sort by proximity and calculate routes.</div>' +
          '</div>' +
        '</div>' +
        '<div class="btn-row">' +
          '<button class="btn btn-primary" data-act="use-location">' + U.icon('my_location') + '<span>Use my location</span></button>' +
          '<button class="btn btn-outline" data-act="select-location">' + U.icon('place') + '<span>Pick on map</span></button>' +
        '</div>' +
      '</div>';
  }

  function renderMapSheet(h) {
    var el = document.getElementById('map-sheet');
    if (!el) return;
    var d = App.distanceTo(h);

    el.innerHTML =
      '<div class="sheet">' +
        '<div class="sheet-grip"></div>' +
        '<div class="sheet-head">' +
          '<div class="hosp-avatar">' + U.icon('local_hospital') + '</div>' +
          '<div class="hosp-main">' +
            '<h3 class="sheet-title">' + U.esc(h.name) + '</h3>' +
            '<div class="sheet-sub">' + U.esc(h.address) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="sheet-metrics">' +
          '<div class="metric"><div class="m-val">' + (d !== null ? U.fmtDistance(d) : '—') + '</div><div class="m-key">DISTANCE</div></div>' +
          '<div class="metric"><div class="m-val" style="color:' + (h.emergency_available ? 'var(--green)' : 'var(--faint)') + '">' +
            (h.emergency_available ? 'Yes' : 'No') + '</div><div class="m-key">EMERGENCY</div></div>' +
          '<div class="metric"><div class="m-val" style="color:' + (h.icu_available ? 'var(--green)' : 'var(--faint)') + '">' +
            (h.icu_available ? 'Yes' : 'No') + '</div><div class="m-key">ICU</div></div>' +
        '</div>' +
        '<div class="btn-row">' +
          '<button class="btn btn-primary" data-act="open-hospital" data-id="' + U.esc(h.id) + '">' +
            U.icon('info') + '<span>View Details</span></button>' +
          '<button class="btn btn-soft" data-act="get-route" data-id="' + U.esc(h.id) + '">' +
            U.icon('navigation') + '<span>Get Route</span></button>' +
        '</div>' +
        (h.phone ? '<button class="btn btn-ghost btn-block btn-sm" data-act="call" data-num="' + U.esc(h.phone) + '">' +
          U.icon('call') + '<span>Call ' + U.esc(h.phone) + '</span></button>' : '') +
      '</div>';
  }

  /* ================================================================== */
  /* Route screen behaviour                                              */
  /* ================================================================== */

  App.mountRoute = function (h) {
    var container = document.getElementById('route-map');
    var loc = App.location;
    var ok = MapKit.init(container, { center: [h.latitude, h.longitude], zoom: 13 });

    if (!ok) {
      container.innerHTML = '<div class="map-fallback show">' + U.icon('map') +
        '<div class="empty-title">Map unavailable</div>' +
        '<div class="empty-text">Road preview needs an internet connection.</div></div>';
    } else {
      MapKit.setHospitals([h], { onSelect: function () {} });
      if (loc) MapKit.setUser(loc, 'Your location');
    }

    var distEl = document.getElementById('route-dist');
    var timeEl = document.getElementById('route-time');
    var modeEl = document.getElementById('route-mode');
    var noteEl = document.getElementById('route-note');

    if (!loc) {
      if (distEl) distEl.textContent = '—';
      if (timeEl) timeEl.textContent = '—';
      if (modeEl) modeEl.textContent = '—';
      if (noteEl) {
        noteEl.innerHTML = '<div class="note warn">' + U.icon('location_off') +
          '<span>Set your starting location to calculate a route. You can still open the hospital in your maps app.</span></div>';
      }
      if (ok) MapKit.fit([[h.latitude, h.longitude]]);
      return;
    }

    var straight = U.haversineKm(loc.lat, loc.lng, h.latitude, h.longitude);
    if (distEl) distEl.textContent = U.fmtDistance(straight);

    var from = { lat: loc.lat, lng: loc.lng };
    var to = { lat: h.latitude, lng: h.longitude };

    function showFallback() {
      if (timeEl) timeEl.textContent = '—';
      if (modeEl) modeEl.textContent = 'Straight';
      if (noteEl) {
        noteEl.innerHTML = '<div class="note warn">' + U.icon('cloud_off') +
          '<span>Online route unavailable. Showing the straight line between you and the hospital — ' +
          'start navigation below for live road directions.</span></div>';
      }
      if (ok) {
        MapKit.drawRoute([[from.lat, from.lng], [to.lat, to.lng]], { dashed: true });
        MapKit.fit([[from.lat, from.lng], [to.lat, to.lng]]);
      }
    }

    if (!App.online) {
      showFallback();
      return;
    }

    MapKit.fetchRoute(from, to)
      .then(function (route) {
        if (distEl) distEl.textContent = U.fmtDistance(route.distanceKm);
        if (timeEl) timeEl.textContent = U.fmtDuration(route.durationS);
        if (modeEl) modeEl.textContent = 'Road';
        if (noteEl) {
          noteEl.innerHTML = '<div class="note info">' + U.icon('check_circle') +
            '<span>Calculated with OSRM road routing. Start navigation for live turn-by-turn directions.</span></div>';
        }
        if (ok) {
          MapKit.drawRoute(route.coords, {});
          MapKit.fit(route.coords);
        }
      })
      .catch(function () {
        showFallback();
      });
  };

  function startNavigation(h) {
    var dest = h.latitude + ',' + h.longitude;
    var url = 'https://www.google.com/maps/dir/?api=1&destination=' + dest + '&travelmode=driving';
    U.openExternal(url);
    U.toast('Opening navigation app…');
  }

  /* ================================================================== */
  /* Offline                                                             */
  /* ================================================================== */

  function updateOfflineUI() {
    var banner = document.getElementById('offline-banner');
    if (banner) banner.hidden = App.online;

    var mapOffline = document.getElementById('map-offline');
    if (mapOffline) mapOffline.hidden = App.online && !App.mapTilesBlocked;

    var sub = document.querySelector('.header-sub span');
    if (sub && App.currentRoute.name === 'home') {
      /* header already carries the app subtitle; nothing to change */
    }
  }

  App.onTileErrors = function () {
    App.mapTilesBlocked = true;
    var mapOffline = document.getElementById('map-offline');
    if (mapOffline && App.online) {
      mapOffline.hidden = false;
      mapOffline.querySelector('span').textContent =
        'Map tiles are being blocked right now — hospital pins still come from saved data.';
    }
  };

  App.onTilesOk = function () {
    if (App.mapTilesBlocked) {
      App.mapTilesBlocked = false;
      updateOfflineUI();
    }
  };

  App.onTileProviderChange = function (p, auto) {
    var note = document.getElementById('map-note-text');
    if (note) {
      note.textContent = MapKit.providerCredit() + ' · ' + App.hospitals.length + ' hospitals';
    }
    if (auto) {
      App.mapTilesBlocked = false;
      updateOfflineUI();
      U.toast('Map tiles were blocked — switched to backup style');
    }
  };

  function setFindStep(step) {
    App.findStep = step;
    var p1 = document.getElementById('find-step-1');
    var p2 = document.getElementById('find-step-2');
    var tabs = document.querySelectorAll('.find-step-tab');
    if (p1 && p2) {
      p1.hidden = (step !== 1);
      p2.hidden = (step !== 2);
    }
    tabs.forEach(function (t) {
      var p = parseInt(t.getAttribute('data-page'), 10) || 1;
      t.classList.toggle('active', p === step);
    });
    var screen = document.getElementById('screen');
    if (screen) screen.scrollTop = 0;
  }

  /* ================================================================== */
  /* Actions (delegated)                                                 */
  /* ================================================================== */

  var ACTIONS = {
    'nav': function (el) {
      var route = el.getAttribute('data-route');
      if (route) go(route);
    },
    'back': function () { back(); },

    'find-next': function () {
      setFindStep(2);
    },
    'find-prev': function () {
      setFindStep(1);
    },
    'find-goto-page': function (el) {
      var p = parseInt(el.getAttribute('data-page'), 10) || 1;
      setFindStep(p);
    },
    'smart-search': function () {
      App.findQuery = readFindForm();
      App.findResults = App.smartSearch(App.findQuery);
      render();
      var best = App.findResults.results[0];
      if (best) U.toast('Best match: ' + best.h.name, 'ok');
    },
    'find-reset': function () {
      App.findResults = null;
      App.findStep = 1;
      render();
    },

    'get-started': function () {
      U.storeSet(K.onboarded, true);
      go('#/permission');
    },
    'perm-allow': function () {
      U.storeSet(K.onboarded, true);
      U.storeSet(K.permissionAsked, true);
      doLocate(App.pendingLocationThen || 'hospitals');
      App.pendingLocationThen = null;
      if ((location.hash || '').indexOf('permission') !== -1) go('#/home');
    },
    'perm-manual': function () {
      U.storeSet(K.onboarded, true);
      U.storeSet(K.permissionAsked, true);
      go('#/map?select=1');
    },
    'perm-not': function () {
      U.storeSet(K.onboarded, true);
      U.storeSet(K.permissionAsked, true);
      go('#/home');
      U.toast('You can still search hospitals without a location');
    },

    'use-location': function () {
      var onMap = App.currentRoute.name === 'map';
      var onSettings = App.currentRoute.name === 'settings';
      requestLocation({ then: onMap || onSettings ? 'stay' : 'hospitals' });
    },
    'select-location': function () {
      pickedLatLng = null;
      go('#/map?select=1');
    },
    'confirm-location': function () {
      if (!pickedLatLng) return;
      App.setLocation({
        mode: 'manual',
        lat: pickedLatLng.lat,
        lng: pickedLatLng.lng,
        accuracy: null,
        label: pickedLatLng.lat.toFixed(4) + ', ' + pickedLatLng.lng.toFixed(4)
      });
      U.storeSet(K.permissionAsked, true);
      U.storeSet(K.onboarded, true);
      pickedLatLng = null;
      U.toast('Location set — showing nearby hospitals', 'ok');
      go('#/hospitals');
    },
    'clear-location': function () {
      App.setLocation(null);
      U.toast('Saved location cleared');
      render();
    },

    'open-hospital': function (el) {
      var id = el.getAttribute('data-id');
      if (id) go('#/hospital/' + id);
    },
    'get-route': function (el) {
      var id = el.getAttribute('data-id');
      if (id) go('#/route/' + id);
    },
    'start-navigation': function (el) {
      var h = App.byId(el.getAttribute('data-id'));
      if (h) startNavigation(h);
    },
    'call': function (el) {
      U.callNumber(el.getAttribute('data-num'));
    },

    'toggle-filter': function (el) {
      var key = el.getAttribute('data-key');
      if (!key) return;
      App.filters[key] = !App.filters[key];
      el.classList.toggle('active', App.filters[key]);
      Screens.renderHospitalResults();
    },
    'reset-filters': function () {
      App.query = '';
      App.filters = { nearest: true, emergency: false, icu: false, ambulance: false };
      render();
    },
    'clear-search': function () {
      App.query = '';
      var input = U.$('[data-input="search"]');
      if (input) input.value = '';
      el_fade_clear();
      Screens.renderHospitalResults();
    },

    'map-locate': function () {
      if (!App.location) {
        requestLocation({ then: 'stay' });
        return;
      }
      MapKit.setView(App.location, 15);
      U.toast('Centered on your location', 'ok');
    },
    'map-style': function () {
      U.toast(MapKit.toggleStyle());
    },

    'open-github': function () { U.openExternal(GITHUB_URL); },
    'open-osm': function () { U.openExternal(OSM_URL); },

    'show-privacy': function () {
      U.openModal({
        icon: 'lock',
        title: 'Privacy',
        text: 'LifeLink requests your location only when you tap a location feature. The position stays on ' +
          'this device and is used only to calculate distances and routes. It is never uploaded, shared or sold. ' +
          'You can delete it at any time with “Clear saved location”.',
        actions: [{ label: 'Got it', style: 'btn-primary', value: 'ok' }]
      });
    },

    'clear-cache': function () {
      U.openModal({
        icon: 'delete',
        iconClass: 'red',
        title: 'Clear cached data?',
        text: 'This removes saved app cache, your stored location and any hospital changes imported ' +
          'from CSV from this device. The built-in hospital dataset stays available offline.',
        actions: [
          { label: 'Clear data', style: 'btn-danger', value: 'yes' },
          { label: 'Cancel', style: 'btn-ghost', value: 'no' }
        ]
      }).then(function (v) {
        if (v !== 'yes') return;
        clearStorage();
        U.toast('Cached data cleared', 'ok');
        render();
      });
    },

    'export-csv': function () {
      var csv;
      try { csv = App.exportCsv(); } catch (err) { logError(err); U.toast('Export failed', 'err'); return; }
      try {
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'lifelink-hospitals.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        U.toast('Exported ' + U.plural(App.hospitals.length, 'hospital') + ' to CSV', 'ok');
      } catch (err) {
        logError(err);
        U.toast('CSV download is not supported here', 'err');
      }
    },

    'reset-import': function () {
      U.openModal({
        icon: 'restart_alt',
        title: 'Restore original dataset?',
        text: 'Removes the changes imported from CSV and brings back the original hospital information ' +
          'built into the app.',
        actions: [
          { label: 'Restore original', style: 'btn-danger', value: 'yes' },
          { label: 'Cancel', style: 'btn-ghost', value: 'no' }
        ]
      }).then(function (v) {
        if (v !== 'yes') return;
        App.resetImport();
        U.toast('Original hospital data restored', 'ok');
        render();
      });
    }
  };

  function el_fade_clear() {
    var clear = U.$('.search-clear');
    if (clear) clear.classList.remove('show');
  }

  function clearStorage() {
    App.setLocation(null);
    U.storeRemove(K.onboarded);
    U.storeRemove(K.permissionAsked);
    U.storeRemove(K.hospitalEdits);
    U.storeRemove(K.importMeta);
    App.importMeta = null;
    App.hospitals = applyEdits(App.baseHospitals || App.hospitals);
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (r) { r.unregister(); });
      }).catch(function () {});
    }
    if (window.caches && caches.keys) {
      caches.keys().then(function (keys) {
        keys.forEach(function (k) { caches.delete(k); });
      }).catch(function () {});
    }
  }

  /* ================================================================== */
  /* Error capture (helps debugging on-device)                           */
  /* ================================================================== */

  function logError(err) {
    var msg = err && err.message ? err.message : String(err);
    App.errors.push(msg);
    var el = document.getElementById('boot-log');
    if (el) el.textContent = App.errors.join(' | ');
    if (window.console && console.error) console.error('[LifeLink]', err);
  }
  App.logError = logError;

  /* ================================================================== */
  /* Boot                                                                */
  /* ================================================================== */

  function render() { route(); }

  function readFindForm() {
    var get = function (id) {
      var el = document.getElementById(id);
      return el ? String(el.value || '').trim() : '';
    };
    var bmin = get('f-bmin'), bmax = get('f-bmax');
    if (bmin && bmax && Number(bmin) > Number(bmax)) {
      var t = bmin; bmin = bmax; bmax = t;
      U.toast('Budget range adjusted (min ↔ max)');
    }
    var critEl = document.querySelector('input[name="f-crit"]:checked');
    return {
      name: get('f-name'),
      department: get('f-dept'),
      budgetMin: bmin,
      budgetMax: bmax,
      area: get('f-area'),
      bloodGroup: get('f-blood'),
      criticality: critEl ? critEl.value : 'high'
    };
  }

  function handleCsvImport(input) {
    var file = input.files && input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var res = App.importCsv(String(reader.result || ''));
      if (res.error) { U.toast(res.error, 'err'); return; }
      App.importMeta = {
        file: file.name,
        time: new Date().toISOString(),
        updated: res.updated,
        skipped: res.skipped
      };
      U.storeSet(K.importMeta, App.importMeta);
      U.toast('Updated ' + U.plural(res.updated, 'hospital') + ' from CSV', 'ok');
      render();
    };
    reader.onerror = function () { U.toast('Could not read that file', 'err'); };
    reader.readAsText(file);
    input.value = '';
  }

  function bindGlobalEvents() {
    document.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!el) return;
      var act = el.getAttribute('data-act');
      var fn = ACTIONS[act];
      if (!fn) return;
      e.preventDefault();
      try { fn(el, e); } catch (err) { logError(err); }
    });

    document.addEventListener('change', function (e) {
      var el = e.target;
      if (!el || !el.getAttribute || el.getAttribute('data-input') !== 'csv-import') return;
      try { handleCsvImport(el); } catch (err) { logError(err); }
    });

    window.addEventListener('hashchange', function () {
      try { route(); } catch (err) { logError(err); }
    });

    window.addEventListener('online', function () {
      App.online = true;
      updateOfflineUI();
      U.toast('Back online', 'ok');
    });

    window.addEventListener('offline', function () {
      App.online = false;
      updateOfflineUI();
      U.toast('You’re offline. Stored hospital information is still available.');
    });

    window.addEventListener('error', function (e) {
      logError(e.error || e.message || 'Unknown error');
    });

    window.addEventListener('unhandledrejection', function (e) {
      logError(e.reason || 'Unhandled promise rejection');
    });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.protocol !== 'http:') return;
    navigator.serviceWorker.register('sw.js').catch(function (err) {
      logError(err);
    });
  }

  function boot() {
    Screens.deps();
    bindGlobalEvents();

    var screenEl = document.getElementById('screen');
    loadHospitals()
      .then(function (list) {
        App.baseHospitals = list;
        App.hospitals = applyEdits(list);
        App.importMeta = U.storeGet(K.importMeta, null);
        App.datasetUpdated = list.length ? list[0].last_updated : null;
        restoreLocation();
        route();
        registerServiceWorker();
        finishStartup();
      })
      .catch(function (err) {
        logError(err);
        screenEl.innerHTML =
          '<div class="wrap"><div class="empty">' + U.icon('error') +
          '<div class="empty-title">Hospital data could not be loaded</div>' +
          '<div class="empty-text">' + U.esc(err.message) + '</div>' +
          '<button class="btn btn-primary btn-sm" data-act="nav" data-route="#/home">Reload app</button>' +
          '</div></div>';
        finishStartup();
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
