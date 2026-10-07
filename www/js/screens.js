/* ==========================================================================
   LifeLink — screen renderers
   Each screen returns { tab, header, hideNav, mapMode, html, mount }
   ========================================================================== */

(function () {
  'use strict';

  var esc, icon, fmtDistance, fmtUpdated;
  function deps() {
    esc = U.esc; icon = U.icon;
    fmtDistance = U.fmtDistance; fmtUpdated = U.fmtUpdated;
  }

  /* ------------------------------------------------------------------ */
  /* Shared fragments                                                    */
  /* ------------------------------------------------------------------ */

  function badge(cls, iconName, label) {
    return '<span class="badge ' + cls + '">' + icon(iconName) + esc(label) + '</span>';
  }

  function hospitalBadges(h) {
    var out = '';
    out += h.emergency_available
      ? badge('green', 'emergency', 'Emergency')
      : badge('', 'emergency', 'Emergency not listed');
    out += h.icu_available
      ? badge('green', 'monitoring', 'ICU')
      : badge('', 'monitoring', 'No ICU');
    out += h.ambulance_available
      ? badge('blue', 'ambulance', 'Ambulance')
      : badge('', 'ambulance', 'No ambulance');
    if (h.beds_available !== null && h.beds_available !== undefined) {
      out += badge('', 'hotel', h.beds_available + ' beds');
    }
    return '<div class="badges">' + out + '</div>';
  }

  function hospitalCard(h) {
    var d = App.distanceTo(h);
    return '' +
      '<article class="hosp-card">' +
        '<div class="hosp-top">' +
          '<div class="hosp-avatar">' + icon('local_hospital') + '</div>' +
          '<div class="hosp-main">' +
            '<h3 class="hosp-name">' + esc(h.name) + '</h3>' +
            '<div class="hosp-addr">' + icon('location_on') +
              '<span class="addr-text">' + esc(h.address) + '</span>' +
              (d !== null ? '<span class="hosp-dist">' + fmtDistance(d) + '</span>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
        hospitalBadges(h) +
        '<div class="hosp-actions">' +
          '<button class="btn btn-soft btn-sm" data-act="open-hospital" data-id="' + esc(h.id) + '">View Details</button>' +
          (h.phone
            ? '<button class="btn btn-ghost btn-sm" data-act="call" data-num="' + esc(h.phone) + '">' + icon('call') + 'Call</button>'
            : '<button class="btn btn-ghost btn-sm" data-act="get-route" data-id="' + esc(h.id) + '">' + icon('navigation') + 'Route</button>') +
        '</div>' +
      '</article>';
  }

  function sectionHead(title, linkLabel, linkRoute) {
    return '<div class="section-head">' +
      '<span class="section-title">' + esc(title) + '</span>' +
      (linkLabel ? '<button class="section-link" data-act="nav" data-route="' + esc(linkRoute) + '">' + esc(linkLabel) + '</button>' : '') +
      '</div>';
  }

  function locationStrip() {
    var loc = App.location;
    if (!loc) {
      return '<div class="location-strip">' + icon('location_searching') +
        '<span class="loc-text">No location set — distances unavailable</span>' +
        '<button class="loc-change" data-act="use-location">Set</button></div>';
    }
    return '<div class="location-strip">' + icon(loc.mode === 'gps' ? 'my_location' : 'place') +
      '<span class="loc-text">' + (loc.mode === 'gps' ? 'GPS location' : 'Selected location') +
      ' · <strong>' + esc(loc.label || (loc.lat.toFixed(4) + ', ' + loc.lng.toFixed(4))) + '</strong></span>' +
      '<button class="loc-change" data-act="select-location">Change</button></div>';
  }

  function statusRow(iconName, label, value, cls) {
    return '<div class="status-row">' +
      '<span class="st-label">' + icon(iconName) + esc(label) + '</span>' +
      '<span class="st-value ' + (cls || '') + '"><span class="st-dot"></span>' + esc(value) + '</span>' +
      '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Welcome / permission                                                */
  /* ------------------------------------------------------------------ */

  function welcome(step) {
    if (step === 'permission') {
      return {
        tab: 'home',
        hideNav: true,
        hideHeader: true,
        html: '' +
          '<div class="welcome">' +
            '<div class="welcome-body">' +
              '<div class="welcome-logo">' + icon('location_on') + '</div>' +
              '<h1 class="welcome-name">Allow <span>LifeLink</span> to use your location?</h1>' +
              '<p class="welcome-tag">Your location helps us find nearby hospitals and calculate directions. ' +
                'Your location is only used when you request location-based features.</p>' +
              '<div class="welcome-points">' +
                '<div class="welcome-point">' + icon('check_circle') + '<span>Find hospitals around you</span></div>' +
                '<div class="welcome-point">' + icon('check_circle') + '<span>Get distances and routes</span></div>' +
                '<div class="welcome-point">' + icon('check_circle') + '<span>Never shared — used only on this device</span></div>' +
              '</div>' +
            '</div>' +
            '<div class="welcome-actions">' +
              '<button class="btn btn-primary btn-block btn-lg" data-act="perm-allow">' + icon('my_location') + '<span>Allow Location</span></button>' +
              '<button class="btn btn-outline btn-block" data-act="perm-manual">' + icon('map') + '<span>Choose Location Manually</span></button>' +
              '<button class="btn btn-ghost btn-block" data-act="perm-not"><span>Not Now</span></button>' +
            '</div>' +
          '</div>'
      };
    }

    return {
      tab: 'home',
      hideNav: true,
      hideHeader: true,
      html: '' +
        '<div class="welcome">' +
          '<div class="welcome-body">' +
            '<div class="welcome-logo">' + icon('favorite') + '</div>' +
            '<h1 class="welcome-name">Life<span>Link</span></h1>' +
            '<p class="welcome-tag">Find the right hospital when every second matters.</p>' +
            '<div class="welcome-points">' +
              '<div class="welcome-point">' + icon('check_circle') + '<span>' + App.hospitals.length + ' hospitals available offline</span></div>' +
              '<div class="welcome-point">' + icon('check_circle') + '<span>Nearby search, map and road routes</span></div>' +
              '<div class="welcome-point">' + icon('check_circle') + '<span>Documents, blood and contact details</span></div>' +
            '</div>' +
          '</div>' +
          '<div class="welcome-actions">' +
            '<button class="btn btn-primary btn-block btn-lg" data-act="get-started"><span>Get Started</span>' + icon('arrow_forward') + '</button>' +
          '</div>' +
          '<div class="welcome-version">v' + App.VERSION + ' · RK Studios</div>' +
        '</div>'
    };
  }

  /* ------------------------------------------------------------------ */
  /* Home                                                                */
  /* ------------------------------------------------------------------ */

  function home() {
    var loc = App.location;
    var nearby = App.nearest(3);

    var nearbyHtml = nearby.length
      ? nearby.map(hospitalCard).join('')
      : '<div class="empty">' + icon('location_off') +
        '<div class="empty-title">No hospitals found</div>' +
        '<div class="empty-text">Set a location to see hospitals around you.</div>' +
        '<button class="btn btn-soft btn-sm" data-act="select-location">Select location</button></div>';

    var locNote = loc ? '' :
      '<div class="note info">' + icon('info') +
      '<span>Set your location to see distances and routes. You can also search hospitals without it.</span></div>';

    return {
      tab: 'home',
      header: {
        title: 'LifeLink',
        sub: '',
        brand: true,
        subDot: false,
        action: { icon: 'settings', act: 'nav', route: '#/settings', label: 'Settings' }
      },
      html: '' +
        '<div class="wrap">' +
          '<div class="emergency-card">' +
            '<div class="emergency-head">' +
              '<div class="emergency-icon">' + icon('emergency') + '</div>' +
              '<div>' +
                '<h2 class="emergency-title">Need a hospital?</h2>' +
                '<p class="emergency-text">Find hospitals near your current location.</p>' +
              '</div>' +
            '</div>' +
            '<button class="btn btn-danger btn-block btn-lg" data-act="use-location">' +
              icon('near_me') + '<span>Use My Location</span></button>' +
            '<div class="emergency-hint">OR</div>' +
            '<button class="btn btn-outline btn-block" data-act="select-location">' +
              icon('place') + '<span>Select Location</span></button>' +
          '</div>' +

          '<button class="find-hero" data-act="nav" data-route="#/find">' +
            '<span class="find-hero-icon">' + icon('travel_explore') + '</span>' +
            '<span class="find-hero-body">' +
              '<span class="find-hero-title">Smart Hospital Finder</span>' +
              '<span class="find-hero-text">Tell us the department, budget, area, blood group and ' +
              'criticality — we auto-pick the nearest hospital that matches.</span>' +
            '</span>' +
            icon('chevron_right', 'chev') +
          '</button>' +

          '<div class="list">' +
            '<button class="list-row" data-act="call" data-num="108">' +
              '<span class="lr-icon red">' + icon('ambulance') + '</span>' +
              '<span class="lr-body"><span class="lr-title">Emergency helpline 108</span>' +
              '<span class="lr-sub">Ambulance &amp; medical emergency dispatch</span></span>' +
              icon('call', 'chev') +
            '</button>' +
          '</div>' +

          locNote +
          locationStrip() +

          '<section class="section">' +
            sectionHead('Quick Actions') +
            '<div class="quick-grid">' +
              '<button class="quick-card" data-act="nav" data-route="#/hospitals">' +
                '<span class="quick-icon">' + icon('search') + '</span>' +
                '<span class="quick-label">Find Hospital</span></button>' +
              '<button class="quick-card" data-act="nav" data-route="#/map">' +
                '<span class="quick-icon red">' + icon('near_me') + '</span>' +
                '<span class="quick-label">Nearby Hospitals</span></button>' +
              '<button class="quick-card" data-act="nav" data-route="#/blood">' +
                '<span class="quick-icon orange">' + icon('bloodtype') + '</span>' +
                '<span class="quick-label">Blood Information</span></button>' +
              '<button class="quick-card" data-act="nav" data-route="#/documents">' +
                '<span class="quick-icon green">' + icon('description') + '</span>' +
                '<span class="quick-label">Required Documents</span></button>' +
              '<button class="quick-card" data-act="nav" data-route="#/trends">' +
                '<span class="quick-icon">' + icon('monitoring') + '</span>' +
                '<span class="quick-label">Disease Trends</span></button>' +
              '<button class="quick-card" data-act="nav" data-route="#/settings">' +
                '<span class="quick-icon gray">' + icon('settings') + '</span>' +
                '<span class="quick-label">Settings</span></button>' +
            '</div>' +
          '</section>' +

          '<section class="section">' +
            sectionHead('Nearby Hospitals', 'View all hospitals', '#/hospitals') +
            nearbyHtml +
          '</section>' +

          '<div class="note">' + icon('cloud_done') +
            '<span>Essential hospital information is stored on this device and works without internet.</span></div>' +
        '</div>'
    };
  }

  /* ------------------------------------------------------------------ */
  /* Hospitals list                                                      */
  /* ------------------------------------------------------------------ */

  function hospitals() {
    var f = App.filters;
    var chips = [
      { key: 'nearest', label: 'Nearest', icon: 'near_me' },
      { key: 'emergency', label: 'Emergency', icon: 'emergency' },
      { key: 'icu', label: 'ICU', icon: 'monitoring' },
      { key: 'ambulance', label: 'Ambulance', icon: 'ambulance' }
    ].map(function (c) {
      var active = c.key === 'nearest' ? f.nearest : f[c.key];
      return '<button class="chip' + (active ? ' active' : '') + '" data-act="toggle-filter" data-key="' + c.key + '">' +
        icon(c.icon) + esc(c.label) + '</button>';
    }).join('');

    return {
      tab: 'hospitals',
      header: {
        title: 'Hospitals',
        sub: App.hospitals.length + ' facilities · offline dataset',
        action: { icon: 'settings', act: 'nav', route: '#/settings', label: 'Settings' }
      },
      html: '' +
        '<div class="wrap">' +
          '<div class="search-bar">' +
            '<span class="search-icon material-symbols-outlined">search</span>' +
            '<input class="search-input" type="text" inputmode="search" autocomplete="off" ' +
              'data-input="search" placeholder="Search hospital, area or doctor" value="' + esc(App.query) + '">' +
            '<button class="search-clear' + (App.query ? ' show' : '') + '" data-act="clear-search" aria-label="Clear search">' +
              icon('cancel') + '</button>' +
          '</div>' +
          '<div class="chip-row">' + chips + '</div>' +
          '<div class="meta-row">' +
            '<span class="meta-item"><span class="pulse-dot"></span><span id="result-count"></span></span>' +
            '<span class="meta-item" id="result-sort"></span>' +
          '</div>' +
          '<div id="hospitals-list" class="section"></div>' +
        '</div>',
      mount: function () {
        renderHospitalResults();
        var input = U.$('[data-input="search"]');
        if (input) {
          input.addEventListener('input', U.debounce(function () {
            App.query = input.value;
            var clear = U.$('.search-clear');
            if (clear) clear.classList.toggle('show', !!App.query);
            renderHospitalResults();
          }, 140));
        }
      }
    };
  }

  function renderHospitalResults() {
    var listEl = document.getElementById('hospitals-list');
    if (!listEl) return;
    var list = App.filteredHospitals();

    var countEl = document.getElementById('result-count');
    if (countEl) countEl.textContent = U.plural(list.length, 'facility') + ' found';

    var sortEl = document.getElementById('result-sort');
    if (sortEl) {
      sortEl.innerHTML = App.filters.nearest
        ? icon('near_me') + '<span>' + (App.location ? 'Sorted by distance' : 'Set location to sort') + '</span>'
        : icon('sort') + '<span>Name A–Z</span>';
    }

    if (!list.length) {
      listEl.innerHTML = '<div class="empty">' + icon('search_off') +
        '<div class="empty-title">No matching hospitals</div>' +
        '<div class="empty-text">Try a different name, area, specialty — or clear the filters.</div>' +
        '<button class="btn btn-soft btn-sm" data-act="reset-filters">Reset search &amp; filters</button></div>';
      return;
    }
    listEl.innerHTML = list.map(hospitalCard).join('');
  }

  /* ------------------------------------------------------------------ */
  /* Hospital details                                                    */
  /* ------------------------------------------------------------------ */

  function hospital(params) {
    var h = App.byId(params.id);
    if (!h) {
      return {
        tab: 'hospitals',
        header: { title: 'Hospital', back: true },
        html: '<div class="wrap"><div class="empty">' + icon('error') +
          '<div class="empty-title">Hospital not found</div>' +
          '<div class="empty-text">This hospital is not in the offline dataset.</div>' +
          '<button class="btn btn-soft btn-sm" data-act="nav" data-route="#/hospitals">Back to hospitals</button>' +
          '</div></div>'
      };
    }

    var d = App.distanceTo(h);
    var bloodKeys = h.blood_availability ? Object.keys(h.blood_availability) : [];
    var hasBlood = bloodKeys.length > 0;

    /* --- emergency status --- */
    var statusHtml = '<div class="status-list">' +
      statusRow('emergency', 'Emergency',
        h.emergency_available ? 'Available' : 'Not listed',
        h.emergency_available ? 'ok' : 'off') +
      statusRow('monitoring', 'ICU',
        h.icu_available ? 'Available' : 'Not listed',
        h.icu_available ? 'ok' : 'off') +
      statusRow('ambulance', 'Ambulance',
        h.ambulance_available ? 'Available' : 'Not listed',
        h.ambulance_available ? 'ok' : 'off') +
      (h.beds_available !== null && h.beds_available !== undefined
        ? statusRow('hotel', 'Beds', h.beds_available + ' beds', 'ok')
        : '') +
      '</div>';

    /* --- hospital information --- */
    var info = '';
    if (h.edited) info += infoRow('edit_note', 'Data source', 'Updated locally from a CSV import');
    info += infoRow('location_on', 'Address', esc(h.address));
    if (h.phone) info += infoRow('call', 'Phone', '<a href="tel:' + esc(h.phone.replace(/[^\d+]/g, '')) + '">' + esc(h.phone) + '</a>');
    if (h.emergency_phone) info += infoRow('emergency', 'Emergency phone', '<a href="tel:' + esc(h.emergency_phone.replace(/[^\d+]/g, '')) + '">' + esc(h.emergency_phone) + '</a>');
    if (h.rating) info += infoRow('star', 'Rating', esc(h.rating + ' / 5'));
    if (h.price_range) info += infoRow('payments', 'Consultation range', '₹' + esc(h.price_range));
    if (h.locality) info += infoRow('map', 'Area', esc(h.locality));
    if (h.facilities && h.facilities.length) {
      info += '<div class="info-row"><span class="info-key">' + icon('checklist') + 'Facilities</span>' +
        '<span class="info-val"><span class="tag-list">' +
        h.facilities.map(function (f) { return '<span class="tag">' + esc(f) + '</span>'; }).join('') +
        '</span></span></div>';
    }
    if (h.specialties && h.specialties.length) {
      info += '<div class="info-row"><span class="info-key">' + icon('medical_services') + 'Specialties</span>' +
        '<span class="info-val"><span class="tag-list">' +
        h.specialties.map(function (s) { return '<span class="tag blue">' + esc(s) + '</span>'; }).join('') +
        '</span></span></div>';
    }
    if (!info) info = '<p class="prose small">No additional information is stored for this hospital.</p>';

    /* --- blood --- */
    var bloodHtml = '';
    if (hasBlood) {
      bloodHtml = '<section class="section">' +
        sectionHead('🩸 Blood Availability') +
        '<div class="card card-pad">' +
          '<div class="blood-grid">' +
            bloodKeys.map(function (g) {
              return '<div class="blood-cell"><span class="blood-group">' + esc(g) + '</span>' +
                '<span class="blood-units">' + h.blood_availability[g] + ' units</span></div>';
            }).join('') +
          '</div>' +
          '<div class="note warn">' + icon('warning') +
            '<span>Demo information — verify with hospital. Information last updated: ' + esc(fmtUpdated(h.last_updated)) + '.</span></div>' +
        '</div>' +
      '</section>';
    }

    /* --- ambulances --- */
    var ambHtml = '';
    if (h.ambulances && h.ambulances.length) {
      ambHtml = '<section class="section">' +
        sectionHead('🚑 Ambulance Contacts') +
        '<div class="list">' +
          h.ambulances.map(function (a) {
            return '<button class="list-row" data-act="call" data-num="' + esc(a.phone) + '">' +
              '<span class="lr-icon red">' + icon('ambulance') + '</span>' +
              '<span class="lr-body"><span class="lr-title">' + esc(a.driver) + '</span>' +
              '<span class="lr-sub">' + esc(a.vehicle) + ' · ' + esc(a.phone) + '</span></span>' +
              icon('call', 'chev') + '</button>';
          }).join('') +
        '</div></section>';
    }

    /* --- doctors --- */
    var docHtml = '';
    if (h.doctors && h.doctors.length) {
      docHtml = '<section class="section">' +
        sectionHead('Doctors on dataset (' + h.doctors.length + ')') +
        '<div class="list">' +
          h.doctors.map(function (doc) {
            return '<div class="list-row">' +
              '<span class="lr-icon">' + icon('stethoscope') + '</span>' +
              '<span class="lr-body"><span class="lr-title">' + esc(doc.name) + '</span>' +
              '<span class="lr-sub">' + esc(doc.specialty) +
              (doc.experience ? ' · ' + doc.experience + ' yrs exp' : '') + '</span></span>' +
              (doc.fee ? '<span class="lr-value">₹' + esc(doc.fee) + '</span>' : '') +
              '</div>';
          }).join('') +
        '</div></section>';
    }

    return {
      tab: 'hospitals',
      header: { title: h.name, sub: d !== null ? fmtDistance(d) + ' away' : h.locality, back: true },
      html: '' +
        '<div class="wrap">' +
          '<div class="card card-pad">' +
            '<div class="hosp-top">' +
              '<div class="hosp-avatar">' + icon('local_hospital') + '</div>' +
              '<div class="hosp-main">' +
                '<h2 class="h1" style="font-size:19px">' + esc(h.name) + '</h2>' +
                '<div class="hosp-addr" style="margin-top:5px">' + icon('location_on') +
                  '<span class="addr-text">' + esc(h.address) + '</span>' +
                  (d !== null ? '<span class="hosp-dist">' + fmtDistance(d) + '</span>' : '') +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="badges">' +
              (h.rating ? badge('', 'star', h.rating + ' rating') : '') +
              (h.emergency_available ? badge('green', 'verified_user', 'Emergency listed') : '') +
              (h.locality ? badge('blue', 'map', h.locality) : '') +
            '</div>' +
            '<div class="btn-row">' +
              '<button class="btn btn-primary" data-act="get-route" data-id="' + esc(h.id) + '">' +
                icon('navigation') + '<span>Get Route</span></button>' +
              (h.phone
                ? '<button class="btn btn-soft" data-act="call" data-num="' + esc(h.phone) + '">' +
                  icon('call') + '<span>Call</span></button>'
                : '') +
            '</div>' +
          '</div>' +

          '<section class="section">' +
            sectionHead('Emergency') +
            statusHtml +
          '</section>' +

          '<section class="section">' +
            sectionHead('Hospital Information') +
            '<div class="card"><div class="info-list">' + info + '</div></div>' +
          '</section>' +

          bloodHtml +

          '<section class="section">' +
            sectionHead('📄 Required Documents') +
            '<div class="doc-card">' +
              '<div class="doc-head">' + icon('description') + '<span class="doc-title">You may need:</span></div>' +
              '<div class="doc-list">' +
                (h.required_documents && h.required_documents.length
                  ? h.required_documents.map(function (doc) {
                      return '<div class="doc-item">' + icon('check_circle') + '<span>' + esc(doc) + '</span></div>';
                    }).join('')
                  : '<div class="doc-item">' + icon('help') + '<span>No list stored for this hospital</span></div>') +
              '</div>' +
              '<div class="note">' + icon('info') +
                '<span>Document requirements may vary depending on the hospital and service. Please confirm with the hospital.</span></div>' +
            '</div>' +
          '</section>' +

          ambHtml +
          docHtml +

          '<div class="note">' + icon('database') +
            '<span>From the offline LifeLink dataset · last updated ' + esc(fmtUpdated(h.last_updated)) +
            '. Verify availability directly with the hospital.</span></div>' +
        '</div>'
    };
  }

  function infoRow(iconName, key, valueHtml) {
    return '<div class="info-row">' +
      '<span class="info-key">' + icon(iconName) + esc(key) + '</span>' +
      '<span class="info-val">' + valueHtml + '</span></div>';
  }

  /* ------------------------------------------------------------------ */
  /* Map screen                                                          */
  /* ------------------------------------------------------------------ */

  function map(params) {
    var selectMode = params && params.select === '1';

    return {
      tab: 'map',
      mapMode: true,
      header: {
        title: selectMode ? 'Select Location' : 'Map',
        sub: selectMode ? 'Tap the map to pick a point' : 'Hospitals around you',
        back: true
      },
      html: '' +
        '<div class="map-screen">' +
          '<div class="map-canvas">' +
            '<div id="map"></div>' +
            '<div class="map-fallback" id="map-fallback">' +
              icon('map') +
              '<div class="empty-title">Map unavailable</div>' +
              '<div class="empty-text" id="map-fallback-text">Map tiles need an internet connection. ' +
                'Hospital list, search and details still work offline.</div>' +
              '<button class="btn btn-soft btn-sm" data-act="nav" data-route="#/hospitals">Open hospital list</button>' +
            '</div>' +
            '<div class="map-topbar">' +
              '<div class="map-pill">' + icon(selectMode ? 'place' : 'near_me') +
                '<span class="pill-text" id="map-pill-text">' +
                  (selectMode ? 'Tap anywhere to drop a pin' : 'Locating…') +
                  '<span class="pill-sub" id="map-pill-sub"></span>' +
                '</span>' +
              '</div>' +
            '</div>' +
            '<div class="map-offline" id="map-offline" hidden>' + icon('cloud_off') +
              '<span>Offline — map tiles unavailable, hospital pins still show from saved data.</span></div>' +
            '<div class="map-controls">' +
              '<button class="map-fab" data-act="map-locate" aria-label="Use my location">' + icon('my_location') + '</button>' +
              '<button class="map-fab" data-act="map-style" aria-label="Change map style">' + icon('layers') + '</button>' +
            '</div>' +
            '<div class="map-note">' + icon('public') + '<span id="map-note-text">© OpenStreetMap</span></div>' +
          '</div>' +
          '<div id="map-sheet"></div>' +
        '</div>',
      mount: function () { App.mountMap(selectMode); }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Route screen                                                        */
  /* ------------------------------------------------------------------ */

  function route(params) {
    var h = App.byId(params.id);
    if (!h) {
      return hospital({ id: params.id });
    }
    var loc = App.location;
    var fromLabel = !loc
      ? 'Location not set'
      : (loc.mode === 'gps' ? 'Your location' : 'Selected location');
    var fromValue = !loc
      ? 'Choose a starting point to calculate a route'
      : (loc.label || (loc.lat.toFixed(4) + ', ' + loc.lng.toFixed(4)));

    var destValue = h.name;

    return {
      tab: 'map',
      header: { title: 'Route', sub: h.name, back: true },
      html: '' +
        '<div class="route-hero">' +
          '<div class="route-od">' +
            '<div class="od-rail">' +
              '<span class="rail-dot start"></span>' +
              '<span class="rail-line"></span>' +
              '<span class="rail-dot end"></span>' +
            '</div>' +
            '<div class="od-body">' +
              '<div class="od-step"><div class="rn-label">From</div>' +
                '<div class="rn-name' + (loc ? '' : ' muted') + '">' + esc(fromValue) + '</div>' +
                '<div class="rn-sub">' + esc(fromLabel) + '</div></div>' +
              '<div class="od-step"><div class="rn-label">To</div>' +
                '<div class="rn-name">' + esc(destValue) + '</div>' +
                '<div class="rn-sub">' + esc(h.address) + '</div></div>' +
            '</div>' +
          '</div>' +
          '<div class="route-stats">' +
            '<div class="route-stat"><div class="rs-val" id="route-dist">—</div><div class="rs-key">DISTANCE</div></div>' +
            '<div class="route-stat"><div class="rs-val" id="route-time">…</div><div class="rs-key">EST. TIME</div></div>' +
            '<div class="route-stat"><div class="rs-val" id="route-mode">…</div><div class="rs-key">ROUTE</div></div>' +
          '</div>' +
          '<div id="route-note"></div>' +
        '</div>' +
        '<div class="route-map" id="route-map"></div>' +
        '<div class="wrap">' +
          '<button class="btn btn-primary btn-block btn-lg" data-act="start-navigation" data-id="' + esc(h.id) + '">' +
            icon('directions') + '<span>Start Navigation</span></button>' +
          '<div class="btn-row">' +
            (h.phone
              ? '<button class="btn btn-soft" data-act="call" data-num="' + esc(h.phone) + '">' + icon('call') + '<span>Call Hospital</span></button>'
              : '') +
            '<button class="btn btn-ghost" data-act="open-hospital" data-id="' + esc(h.id) + '">' +
              icon('info') + '<span>View Details</span></button>' +
          '</div>' +
          '<div class="note">' + icon('explore') +
            '<span>Start Navigation opens Google Maps / your preferred navigation app for live turn-by-turn directions.</span></div>' +
        '</div>',
      mount: function () { App.mountRoute(h); }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Blood information                                                   */
  /* ------------------------------------------------------------------ */

  function blood() {
    var totals = App.bloodTotals();
    var groups = Object.keys(totals).sort();
    var ranked = App.hospitals
      .filter(function (h) { return h.blood_availability && Object.keys(h.blood_availability).length; })
      .map(function (h) {
        var sum = Object.keys(h.blood_availability).reduce(function (a, k) { return a + h.blood_availability[k]; }, 0);
        return { h: h, sum: sum };
      })
      .sort(function (a, b) { return b.sum - a.sum; })
      .slice(0, 12);

    var maxTotal = groups.length ? Math.max.apply(null, groups.map(function (g) { return totals[g]; })) : 1;

    return {
      tab: 'home',
      header: { title: 'Blood Information', sub: 'Offline dataset overview', back: true },
      html: '' +
        '<div class="wrap">' +
          '<div class="note warn">' + icon('warning') +
            '<span>Demo information from the offline dataset — verify with the hospital before relying on it. ' +
            'Information last updated: ' + esc(fmtUpdated(App.datasetUpdated)) + '.</span></div>' +

          '<section class="section">' +
            sectionHead('Blood units recorded (all hospitals)') +
            '<div class="card">' +
              '<div class="blood-grid">' +
                groups.map(function (g) {
                  return '<div class="blood-cell"><span class="blood-group">' + esc(g) + '</span>' +
                    '<span class="blood-units">' + totals[g] + ' units</span></div>';
                }).join('') +
              '</div>' +
            '</div>' +
          '</section>' +

          '<section class="section">' +
            sectionHead('Hospitals with blood stock') +
            '<div class="list">' +
              ranked.map(function (row) {
                return '<button class="list-row" data-act="open-hospital" data-id="' + esc(row.h.id) + '">' +
                  '<span class="lr-icon red">' + icon('bloodtype') + '</span>' +
                  '<span class="lr-body"><span class="lr-title">' + esc(row.h.name) + '</span>' +
                  '<span class="lr-sub">' + esc(row.h.locality || row.h.address) + '</span></span>' +
                  '<span class="lr-value">' + row.sum + ' units</span>' +
                  icon('chevron_right', 'chev') + '</button>';
              }).join('') +
            '</div>' +
            '<div class="card">' +
              '<div class="section-title" style="margin-bottom:8px">Stock level overview</div>' +
              groups.map(function (g) {
                var pct = maxTotal ? Math.round((totals[g] / maxTotal) * 100) : 0;
                return '<div style="margin-bottom:9px">' +
                  '<div class="meta-row" style="padding:0 0 4px"><span>' + esc(g) + '</span><span>' + totals[g] + ' units</span></div>' +
                  '<div class="blood-bar"><span style="width:' + pct + '%"></span></div></div>';
              }).join('') +
            '</div>' +
          '</section>' +

          '<button class="btn btn-outline btn-block" data-act="nav" data-route="#/hospitals">' +
            icon('local_hospital') + '<span>View all hospitals</span></button>' +
        '</div>'
    };
  }

  /* ------------------------------------------------------------------ */
  /* Disease trends                                                      */
  /* ------------------------------------------------------------------ */

  function trends() {
    var t = App.diseaseTrends();
    var top = t.ranked.slice(0, 15);
    var rest = t.ranked.slice(15);
    var restTotal = rest.reduce(function (a, d) { return a + d.count; }, 0);
    var max = top.length ? top[0].count : 1;

    function statRow(value, label) {
      return '<div class="route-stat"><div class="rs-val">' + value + '</div>' +
        '<div class="rs-key">' + label + '</div></div>';
    }

    return {
      tab: 'home',
      header: { title: 'Disease Trends', sub: 'Offline dataset overview', back: true },
      html: '' +
        '<div class="wrap">' +
          '<div class="note warn">' + icon('warning') +
            '<span>Aggregated from the offline demo dataset — this is not live surveillance data. ' +
            'Check with local health authorities for actual outbreak information. Last updated: ' +
            esc(fmtUpdated(App.datasetUpdated)) + '.</span></div>' +

          '<div class="route-stats">' +
            statRow(t.totalCases, 'TOTAL CASES') +
            statRow(t.diseaseCount, 'CONDITIONS') +
            statRow(t.reporting, 'HOSPITALS') +
          '</div>' +

          '<section class="section">' +
            sectionHead('Most reported conditions') +
            '<div class="card">' +
              (top.length ? top.map(function (d) {
                var pct = max ? Math.round((d.count / max) * 100) : 0;
                return '<div class="trend-row">' +
                  '<div class="meta-row trend-head"><span class="trend-name">' + esc(d.name) + '</span>' +
                  '<span>' + d.count + ' cases</span></div>' +
                  '<div class="trend-bar"><span style="width:' + pct + '%"></span></div></div>';
              }).join('')
                : '<div class="tiny muted">No condition data in this dataset.</div>') +
              (rest.length
                ? '<div class="tiny muted trend-more">…and ' + rest.length + ' more conditions (' + restTotal + ' cases)</div>'
                : '') +
            '</div>' +
          '</section>' +

          '<section class="section">' +
            sectionHead('Hospitals reporting the most cases') +
            '<div class="list">' +
              t.byHospital.slice(0, 10).map(function (row) {
                return '<button class="list-row" data-act="open-hospital" data-id="' + esc(row.h.id) + '">' +
                  '<span class="lr-icon">' + icon('monitoring') + '</span>' +
                  '<span class="lr-body"><span class="lr-title">' + esc(row.h.name) + '</span>' +
                  '<span class="lr-sub">Most reported: ' +
                    esc(row.top.map(function (d) { return d.name + ' (' + d.count + ')'; }).join(', ')) +
                  '</span></span>' +
                  '<span class="lr-value">' + row.total + '</span>' +
                  icon('chevron_right', 'chev') + '</button>';
              }).join('') +
            '</div>' +
          '</section>' +

          '<section class="section">' +
            sectionHead('Cases by area') +
            '<div class="card">' +
              t.byArea.slice(0, 10).map(function (a) {
                var pct = t.byArea[0] ? Math.round((a.count / t.byArea[0].count) * 100) : 0;
                return '<div class="trend-row">' +
                  '<div class="meta-row trend-head"><span class="trend-name">' + esc(a.name) + '</span>' +
                  '<span>' + a.count + ' cases</span></div>' +
                  '<div class="trend-bar"><span style="width:' + pct + '%"></span></div></div>';
              }).join('') +
            '</div>' +
          '</section>' +

          '<button class="btn btn-outline btn-block" data-act="nav" data-route="#/hospitals">' +
            icon('local_hospital') + '<span>View all hospitals</span></button>' +
        '</div>'
    };
  }

  /* ------------------------------------------------------------------ */
  /* Smart hospital finder                                               */
  /* ------------------------------------------------------------------ */

  function critChip(level) {
    var label = level.charAt(0).toUpperCase() + level.slice(1);
    var iconName = level === 'critical' ? 'emergency' : level === 'high' ? 'priority_high' : 'low_priority';
    return '<span class="prio-chip prio-' + esc(level) + '">' + icon(iconName) + esc(label) + '</span>';
  }

  function findForm(q) {
    var depts = App.departments();
    var areas = App.areasList();
    var crit = q.criticality || 'high';
    var step = (typeof App.findStep === 'number') ? App.findStep : 1;

    function field(id, label, control) {
      return '<div class="field">' +
        '<label for="' + id + '">' + esc(label) + '</label>' + control + '</div>';
    }

    var critBtns = [['critical', 'Critical'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]
      .map(function (c) {
        return '<label class="seg">' +
          '<input type="radio" name="f-crit" value="' + c[0] + '"' +
          (crit === c[0] ? ' checked' : '') + '>' +
          '<span>' + c[1] + '</span></label>';
      }).join('');

    /* Step tabs */
    var stepTabs =
      '<div class="find-step-tabs">' +
        '<button class="find-step-tab' + (step === 1 ? ' active' : '') + '" data-act="find-goto-page" data-page="1">' +
          '<span class="find-step-num">1</span><span>Patient &amp; Location</span>' +
        '</button>' +
        '<div class="find-step-divider"></div>' +
        '<button class="find-step-tab' + (step === 2 ? ' active' : '') + '" data-act="find-goto-page" data-page="2">' +
          '<span class="find-step-num">2</span><span>Medical Needs</span>' +
        '</button>' +
      '</div>';

    /* Page 1: Patient name + Area */
    var page1 =
      '<div id="find-step-1"' + (step !== 1 ? ' hidden' : '') + '>' +
        '<section class="section">' +
          sectionHead('Patient &amp; Location') +
          '<div class="find-form">' +
            field('f-name', 'Patient name',
              '<input id="f-name" type="text" autocomplete="name" placeholder="e.g. Anita Sharma" value="' + esc(q.name || '') + '">') +
            field('f-area', 'Area',
              '<input id="f-area" type="text" list="area-list" placeholder="e.g. Hazratganj (blank = current location)" value="' + esc(q.area || '') + '">' +
              '<datalist id="area-list">' +
                areas.map(function (a) { return '<option value="' + esc(a) + '"></option>'; }).join('') +
              '</datalist>') +
            '<div class="field">' +
              '<label for="f-bmin">Budget range (₹ per consultation)</label>' +
              '<div class="budget-row">' +
                '<input id="f-bmin" type="number" min="0" inputmode="numeric" placeholder="Min" value="' + esc(q.budgetMin || '') + '">' +
                '<span class="budget-sep">to</span>' +
                '<input id="f-bmax" type="number" min="0" inputmode="numeric" placeholder="Max" value="' + esc(q.budgetMax || '') + '">' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</section>' +
        '<button class="btn btn-primary btn-block btn-lg" data-act="find-next">' +
          icon('arrow_forward') + '<span>Next: Medical Needs</span>' +
        '</button>' +
      '</div>';

    /* Page 2: Department + Blood + Criticality */
    var page2 =
      '<div id="find-step-2"' + (step !== 2 ? ' hidden' : '') + '>' +
        '<section class="section">' +
          sectionHead('Medical Needs') +
          '<div class="find-form">' +
            field('f-dept', 'Department / medication required',
              '<input id="f-dept" type="text" list="dept-list" placeholder="e.g. Cardiology, Orthopedics" value="' + esc(q.department || '') + '">' +
              '<datalist id="dept-list">' +
                depts.map(function (d) { return '<option value="' + esc(d) + '"></option>'; }).join('') +
              '</datalist>') +
            field('f-blood', 'Blood group needed',
              '<select id="f-blood">' +
                '<option value="">Not needed</option>' +
                App.bloodGroups.map(function (g) {
                  return '<option value="' + g + '"' + (q.bloodGroup === g ? ' selected' : '') + '>' + g + '</option>';
                }).join('') +
              '</select>') +
            '<div class="field">' +
              '<label id="crit-label">Criticality</label>' +
              '<div class="seg-row" role="radiogroup" aria-labelledby="crit-label">' + critBtns + '</div>' +
            '</div>' +
          '</div>' +
        '</section>' +
        '<div class="find-page2-actions">' +
          '<button class="btn btn-ghost btn-lg find-back-btn" data-act="find-prev">' +
            icon('arrow_back') + '<span>Back</span>' +
          '</button>' +
          '<button class="btn btn-primary btn-lg find-submit-btn" data-act="smart-search">' +
            icon('search') + '<span>Find hospital</span>' +
          '</button>' +
        '</div>' +
        '<div class="note">' + icon('info') +
          '<span>Results come from the offline demo dataset for Lucknow — confirm details with the ' +
          'hospital before travelling.</span></div>' +
      '</div>';

    return {
      tab: 'home',
      header: { title: 'Smart Hospital Finder', sub: 'Fill in what you know — all fields optional', back: true },
      html: '' +
        '<div class="wrap">' +
          stepTabs +
          page1 +
          page2 +
        '</div>'
    };
  }

  function findResults(res) {
    var q = res.query || {};
    var list = res.results || [];
    if (!list.length) {
      return {
        tab: 'home',
        header: { title: 'Smart Search Results', sub: 'No match', back: true },
        html: '<div class="wrap"><div class="empty">' + icon('search_off') +
          '<div class="empty-title">No hospitals match</div>' +
          '<div class="empty-text">Try widening the budget range or clearing a filter.</div>' +
          '<button class="btn btn-soft btn-sm" data-act="find-reset">Adjust search</button>' +
          '</div></div>'
      };
    }

    var best = list[0];
    var h = best.h;
    var prio = res.criticality;

    var summaryRows = '';
    if (q.name) summaryRows += infoRow('person', 'Patient', esc(q.name));
    summaryRows += '<div class="info-row"><span class="info-key">' + icon('emergency') + 'Priority</span>' +
      '<span class="info-val">' + critChip(prio) + '</span></div>';
    if (q.department) summaryRows += infoRow('medical_services', 'Department', esc(q.department));
    if (q.budgetMin || q.budgetMax) {
      summaryRows += infoRow('payments', 'Budget',
        '₹' + esc(q.budgetMin || '0') + ' – ₹' + esc(q.budgetMax || 'any'));
    }
    if (q.area) summaryRows += infoRow('location_on', 'Area', esc(q.area));
    if (q.bloodGroup) summaryRows += infoRow('bloodtype', 'Blood group', esc(q.bloodGroup));

    var doctorHtml = '';
    if (q.department && best.doctor && best.doctor.doctor) {
      var d = best.doctor.doctor;
      doctorHtml =
        '<div class="find-doc">' +
          '<div class="find-doc-head">' + icon('stethoscope') +
            '<span>' + (best.doctor.matched ? 'Recommended doctor' : 'Suggested doctor') + '</span></div>' +
          '<div class="find-doc-name">' + esc(d.name) + '</div>' +
          '<div class="find-doc-meta">' + esc(d.specialty) + ' · ' + d.experience + ' yrs · ₹' + d.fee + ' fee</div>' +
        '</div>';
    }

    var bloodHtml = '';
    if (q.bloodGroup) {
      var units = h.blood_availability ? h.blood_availability[q.bloodGroup] : undefined;
      bloodHtml = '<div class="find-extra">' + icon('bloodtype') +
        '<span><strong>' + esc(q.bloodGroup) + ':</strong> ' +
        (units > 0 ? units + ' units in stock' : (units === 0 ? 'out of stock' : 'not listed')) +
        '</span></div>';
    }

    var amb = (h.ambulances && h.ambulances[0]) ? h.ambulances[0] : null;
    var ambHtml = amb
      ? '<div class="find-extra">' + icon('ambulance') +
        '<span><strong>' + esc(amb.vehicle) + '</strong> · ' + esc(amb.driver) +
        ' · <a href="tel:' + esc(String(amb.phone).replace(/[^\d+]/g, '')) + '">' + esc(amb.phone) + '</a></span></div>'
      : '';

    var relaxNotes = '';
    if (res.relaxedBudget) {
      relaxNotes += '<div class="note warn">' + icon('warning') +
        '<span>No hospital fits that budget range — showing the nearest options instead.</span></div>';
    }
    if (res.relaxedCritical) {
      relaxNotes += '<div class="note warn">' + icon('warning') +
        '<span>No hospital in the dataset lists ICU for a critical case — check the beds/ICU field on each profile.</span></div>';
    }

    var others = list.slice(1, 7).map(function (row, i) {
      var rh = row.h;
      return '<button class="list-row" data-act="open-hospital" data-id="' + esc(rh.id) + '">' +
        '<span class="lr-rank">' + (i + 2) + '</span>' +
        '<span class="lr-body"><span class="lr-title">' + esc(rh.name) + '</span>' +
        '<span class="lr-sub">' + esc(rh.locality || rh.area || '') + ' · ' + fmtDistance(row.dist) +
        (row.reasons.length ? ' · ' + esc(row.reasons.slice(0, 2).join(' · ')) : '') +
        '</span></span>' + icon('chevron_right', 'chev') + '</button>';
    }).join('');

    return {
      tab: 'home',
      header: { title: 'Smart Search Results', sub: 'Best match first', back: true },
      html: '' +
        '<div class="wrap">' +
          '<div class="card card-pad find-summary">' + summaryRows + '</div>' +

          relaxNotes +

          '<section class="section">' +
            sectionHead('Best match') +
            '<div class="find-best">' +
              '<div class="find-rank">' + icon('verified') +
                '<span>Top match</span>' + critChip(prio) + '</div>' +
              '<h3 class="find-name">' + esc(h.name) + '</h3>' +
              '<div class="hosp-addr">' + icon('location_on') +
                '<span class="addr-text">' + esc(h.address) + '</span>' +
                '<span class="hosp-dist">' + fmtDistance(best.dist) + '</span></div>' +
              '<div class="meta-row"><span>' + (h.rating ? '★ ' + h.rating + '/5' : 'No rating') + '</span>' +
                '<span>' + (h.price_range ? '₹' + esc(h.price_range) : 'Fee not listed') + '</span></div>' +
              hospitalBadges(h) +
              '<div class="reason-chips">' +
                best.reasons.slice(0, 6).map(function (rr) {
                  return '<span class="reason-chip">' + icon('check') + esc(rr) + '</span>';
                }).join('') +
              '</div>' +
              doctorHtml +
              bloodHtml +
              ambHtml +
              '<div class="btn-row">' +
                '<button class="btn btn-primary" data-act="open-hospital" data-id="' + esc(h.id) + '">' +
                  icon('visibility') + '<span>View profile</span></button>' +
                (h.phone
                  ? '<button class="btn btn-outline" data-act="call" data-num="' + esc(h.phone) + '">' +
                    icon('call') + '<span>Call</span></button>'
                  : '') +
                '<button class="btn btn-outline" data-act="get-route" data-id="' + esc(h.id) + '">' +
                  icon('navigation') + '<span>Route</span></button>' +
              '</div>' +
            '</div>' +
          '</section>' +

          (others
            ? '<section class="section">' +
                sectionHead('Other matches') +
                '<div class="list">' + others + '</div>' +
              '</section>'
            : '') +

          '<div class="btn-row">' +
            '<button class="btn btn-outline" data-act="find-reset">' + icon('edit') +
              '<span>Adjust search</span></button>' +
            '<button class="btn btn-soft" data-act="nav" data-route="#/hospitals">' +
              icon('local_hospital') + '<span>All hospitals</span></button>' +
          '</div>' +

          '<div class="note">' + icon('info') +
            '<span>Distances measured from ' + esc(res.origin.label) +
            '. Ranked from the offline demo dataset — this is guidance, not a medical triage tool.</span></div>' +
        '</div>'
    };
  }

  function find() {
    if (App.findResults) return findResults(App.findResults);
    return findForm(App.findQuery || {});
  }

  function documents() {
    var defaults = App.defaultDocuments();
    return {
      tab: 'home',
      header: { title: 'Required Documents', sub: 'What to carry to the hospital', back: true },
      html: '' +
        '<div class="wrap">' +
          '<div class="doc-card">' +
            '<div class="doc-head">' + icon('description') + '<span class="doc-title">You may need:</span></div>' +
            '<div class="doc-list">' +
              defaults.map(function (d) {
                return '<div class="doc-item">' + icon('check_circle') + '<span>' + esc(d) + '</span></div>';
              }).join('') +
            '</div>' +
            '<div class="note">' + icon('info') +
              '<span>Document requirements may vary depending on the hospital and service. Please confirm with the hospital.</span></div>' +
          '</div>' +

          '<section class="section">' +
            sectionHead('Tips') +
            '<div class="list">' +
              tipRow('folder', 'Keep documents ready', 'Carry them in one folder so admission is faster.') +
              tipRow('call', 'Call the hospital first', 'Confirm requirements on the hospital profile before leaving.') +
              tipRow('insurance', 'Insurance / health card', 'Carry your policy number and a valid photo ID.') +
            '</div>' +
          '</section>' +

          '<div class="note info">' + icon('info') +
            '<span>Every hospital profile shows the document list stored for that hospital in the offline dataset.</span></div>' +

          '<button class="btn btn-primary btn-block" data-act="nav" data-route="#/hospitals">' +
            icon('local_hospital') + '<span>Open hospital list</span></button>' +
        '</div>'
    };
  }

  function tipRow(iconName, title, sub) {
    return '<div class="list-row">' +
      '<span class="lr-icon">' + icon(iconName) + '</span>' +
      '<span class="lr-body"><span class="lr-title">' + esc(title) + '</span>' +
      '<span class="lr-sub">' + esc(sub) + '</span></span></div>';
  }

  /* ------------------------------------------------------------------ */
  /* About                                                               */
  /* ------------------------------------------------------------------ */

  function about() {
    return {
      tab: 'about',
      header: { title: 'About', sub: 'LifeLink' },
      html: '' +
        '<div class="wrap">' +
          '<div class="about-hero">' +
            '<div class="ah-logo"><img src="icons/icon.png" alt="LifeLink" class="brand-img brand-img--lg"></div>' +
            '<h2>LifeLink</h2>' +
            '<div class="about-meta">' +
              '<span class="am-chip">Version v' + App.VERSION + '</span>' +
              '<span class="am-chip">RK Studios</span>' +
            '</div>' +
          '</div>' +

          '<section class="section">' +
            sectionHead('About LifeLink') +
            '<div class="card"><p class="prose">' +
              'LifeLink helps you find the right hospital when every second matters. It shows hospitals around ' +
              'you or a location you choose, their emergency status, contacts, required documents and a route ' +
              'to reach them — with essential information stored on your device so it keeps working offline.' +
            '</p></div>' +
          '</section>' +

          '<section class="section">' +
            sectionHead('Technologies') +
            '<div class="card"><div class="tag-list">' +
              ['HTML', 'CSS', 'JavaScript', 'JSON', 'Leaflet', 'OpenStreetMap', 'OSRM', 'PWA / Service Worker']
                .map(function (t) { return '<span class="tag blue">' + t + '</span>'; }).join('') +
            '</div></div>' +
          '</section>' +

          '<section class="section">' +
            sectionHead('Offline Mode') +
            '<div class="card"><p class="prose">' +
              'Essential hospital information — names, addresses, coordinates, contacts, facilities, blood data ' +
              'and required documents — is stored locally in <strong>data/hospitals.json</strong> and cached by ' +
              'the app. Search, details and distance calculation work without internet. Map tiles and road ' +
              'routing need a connection; when they are unavailable the app says so and keeps everything else working.' +
            '</p></div>' +
          '</section>' +

          '<section class="section">' +
            sectionHead('Privacy') +
            '<div class="card"><p class="prose">' +
              'Your location is requested only when you tap a location feature. It is used on this device to ' +
              'calculate distances and routes, and is never uploaded or shared. You can use LifeLink fully with ' +
              'a manually selected location instead of GPS.' +
            '</p></div>' +
          '</section>' +

          '<section class="section">' +
            sectionHead('Disclaimer') +
            '<div class="card"><p class="prose">' +
              'LifeLink is a student project designed to demonstrate emergency hospital discovery and navigation. ' +
              'Hospital availability and other information may change and should be verified directly with the hospital.' +
            '</p></div>' +
          '</section>' +

          '<div class="list">' +
            '<button class="list-row" data-act="open-github">' +
              '<span class="lr-icon">' + icon('code') + '</span>' +
              '<span class="lr-body"><span class="lr-title">GitHub Project</span>' +
              '<span class="lr-sub">RKStudios-hub/LifeLink</span></span>' +
              icon('open_in_new', 'chev') + '</button>' +
            '<button class="list-row" data-act="open-osm">' +
              '<span class="lr-icon green">' + icon('public') + '</span>' +
              '<span class="lr-body"><span class="lr-title">OpenStreetMap attribution</span>' +
              '<span class="lr-sub">Map data © OpenStreetMap contributors</span></span>' +
              icon('open_in_new', 'chev') + '</button>' +
          '</div>' +

          '<div class="footer-links">' +
            '<span>LifeLink v' + App.VERSION + ' · Built by RK Studios</span>' +
          '</div>' +
        '</div>'
    };
  }

  /* ------------------------------------------------------------------ */
  /* Settings                                                            */
  /* ------------------------------------------------------------------ */

  function settings() {
    var loc = App.location;
    var locValue = !loc
      ? 'Not set'
      : (loc.mode === 'gps' ? 'GPS (' + (loc.label || 'current position') + ')' : 'Manual: ' + (loc.label || loc.lat.toFixed(3) + ', ' + loc.lng.toFixed(3)));

    return {
      tab: 'home',
      header: { title: 'Settings', sub: 'Location, offline data and privacy', back: true },
      html: '' +
        '<div class="wrap">' +
          '<section class="section">' +
            sectionHead('Location') +
            '<div class="list">' +
              '<div class="list-row">' +
                '<span class="lr-icon">' + icon('my_location') + '</span>' +
                '<span class="lr-body"><span class="lr-title">Current location</span>' +
                '<span class="lr-sub">' + esc(locValue) + '</span></span>' +
              '</div>' +
              '<button class="list-row" data-act="use-location">' +
                '<span class="lr-icon green">' + icon('gps_fixed') + '</span>' +
                '<span class="lr-body"><span class="lr-title">Use my location</span>' +
                '<span class="lr-sub">Request GPS position</span></span>' +
                icon('chevron_right', 'chev') + '</button>' +
              '<button class="list-row" data-act="select-location">' +
                '<span class="lr-icon orange">' + icon('edit_location') + '</span>' +
                '<span class="lr-body"><span class="lr-title">Choose location manually</span>' +
                '<span class="lr-sub">Pick a point on the map</span></span>' +
                icon('chevron_right', 'chev') + '</button>' +
              (loc ? '<button class="list-row" data-act="clear-location">' +
                '<span class="lr-icon red">' + icon('location_off') + '</span>' +
                '<span class="lr-body"><span class="lr-title">Clear saved location</span>' +
                '<span class="lr-sub">Removes it from this device</span></span>' +
                icon('chevron_right', 'chev') + '</button>' : '') +
            '</div>' +
          '</section>' +

          '<section class="section">' +
            sectionHead('Offline data') +
            '<div class="list">' +
              '<div class="list-row">' +
                '<span class="lr-icon">' + icon('database') + '</span>' +
                '<span class="lr-body"><span class="lr-title">Hospital dataset</span>' +
                '<span class="lr-sub">' + App.hospitals.length + ' hospitals stored on this device</span></span>' +
                '<span class="lr-value">' + esc(fmtUpdated(App.datasetUpdated)) + '</span>' +
              '</div>' +
              '<div class="list-row">' +
                '<span class="lr-icon green">' + icon('cloud_done') + '</span>' +
                '<span class="lr-body"><span class="lr-title">Offline availability</span>' +
                '<span class="lr-sub">Home, search, details, documents and distances</span></span>' +
              '</div>' +
              '<button class="list-row" data-act="clear-cache">' +
                '<span class="lr-icon orange">' + icon('delete') + '</span>' +
                '<span class="lr-body"><span class="lr-title">Clear cached data</span>' +
                '<span class="lr-sub">Clears app cache and saved location</span></span>' +
                icon('chevron_right', 'chev') + '</button>' +
            '</div>' +
          '</section>' +

          '<section class="section">' +
            sectionHead('Update hospital data') +
            '<div class="list">' +
              '<label class="list-row" for="csv-import">' +
                '<span class="lr-icon">' + icon('upload_file') + '</span>' +
                '<span class="lr-body"><span class="lr-title">Import hospital CSV</span>' +
                '<span class="lr-sub">Update details using the original columns — hospital_id, name, ' +
                'contact, lat/lon, beds, ICU, blood stock, doctors, disease cases…</span></span>' +
                icon('chevron_right', 'chev') +
                '<input id="csv-import" class="visually-hidden" type="file" ' +
                  'accept=".csv,text/csv" data-input="csv-import">' +
              '</label>' +
              '<button class="list-row" data-act="export-csv">' +
                '<span class="lr-icon green">' + icon('download') + '</span>' +
                '<span class="lr-body"><span class="lr-title">Export current data as CSV</span>' +
                '<span class="lr-sub">Download every hospital in the import format — edit and re-import</span></span>' +
                icon('chevron_right', 'chev') + '</button>' +
              (App.editCount()
                ? '<button class="list-row" data-act="reset-import">' +
                    '<span class="lr-icon orange">' + icon('restart_alt') + '</span>' +
                    '<span class="lr-body"><span class="lr-title">Restore original dataset</span>' +
                    '<span class="lr-sub">Discards ' + U.plural(App.editCount(), 'hospital') +
                    ' updated from CSV</span></span>' +
                    icon('chevron_right', 'chev') + '</button>'
                : '') +
              '<div class="list-row">' +
                '<span class="lr-icon">' + icon(App.importMeta ? 'fact_check' : 'database') + '</span>' +
                '<span class="lr-body"><span class="lr-title">' +
                  (App.importMeta
                    ? 'Updated ' + U.plural(App.importMeta.updated, 'hospital') + ' from CSV'
                    : 'Using built-in dataset') +
                '</span><span class="lr-sub">' +
                  (App.importMeta
                    ? esc(App.importMeta.file) + ' · ' + esc(fmtUpdated(App.importMeta.time.slice(0, 10)))
                    : 'No CSV changes imported on this device') +
                '</span></span>' +
              '</div>' +
            '</div>' +
            '<div class="note">' + icon('info') +
              '<span>Imported changes are stored on this device only and apply over the built-in ' +
              'dataset. Rows match hospitals by hospital_id; unknown ids are ignored.</span></div>' +
          '</section>' +

          '<section class="section">' +
            sectionHead('Privacy &amp; About') +
            '<div class="list">' +
              '<button class="list-row" data-act="show-privacy">' +
                '<span class="lr-icon">' + icon('lock') + '</span>' +
                '<span class="lr-body"><span class="lr-title">Privacy</span>' +
                '<span class="lr-sub">How location data is handled</span></span>' +
                icon('chevron_right', 'chev') + '</button>' +
              '<button class="list-row" data-act="nav" data-route="#/about">' +
                '<span class="lr-icon">' + icon('info') + '</span>' +
                '<span class="lr-body"><span class="lr-title">About LifeLink</span>' +
                '<span class="lr-sub">Purpose, technologies and disclaimer</span></span>' +
                icon('chevron_right', 'chev') + '</button>' +
              '<div class="list-row">' +
                '<span class="lr-icon green">' + icon('tag') + '</span>' +
                '<span class="lr-body"><span class="lr-title">App version</span>' +
                '<span class="lr-sub">Developer: RK Studios</span></span>' +
                '<span class="lr-value">v' + App.VERSION + '</span>' +
              '</div>' +
            '</div>' +
          '</section>' +
        '</div>'
    };
  }

  /* ------------------------------------------------------------------ */

  window.Screens = {
    deps: deps,
    welcome: welcome,
    home: home,
    hospitals: hospitals,
    hospital: hospital,
    map: map,
    route: route,
    blood: blood,
    trends: trends,
    find: find,
    documents: documents,
    about: about,
    settings: settings,
    renderHospitalResults: renderHospitalResults,
    hospitalCard: hospitalCard
  };
})();
