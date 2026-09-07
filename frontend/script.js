/* =============================================================
   LifeLink — Community Emergency Service System (Lucknow)
   Frontend logic: data, dashboard, emergency wizard, map,
   hospital detail modal, interactive disease charts.
   ============================================================= */

/* ---------------- tiny helpers ---------------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/</g, "&lt;");
const stars = (r) => "★".repeat(Math.round(r)) + "☆".repeat(5 - Math.round(r));
const round1 = (n) => Math.round(n * 10) / 10;

let toastTimer = null;
function toast(msg, isError = false) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.toggle("error", isError);
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}

/* =============================================================
   DATA LOADING — from the Python backend API
   ============================================================= */

const state = { hospitals: [], ready: false, error: null };

async function loadData() {
    try {
        const res = await fetch("/api/hospitals");
        if (!res.ok) throw new Error("API returned " + res.status);
        state.hospitals = await res.json();
        state.ready = true;
        buildAnalytics();
        renderEverything();
    } catch (e) {
        state.error = String(e && e.message ? e.message : e);
        renderBackendError();
    }
}

function renderBackendError() {
    const msg = `
        <div class="empty-note" style="padding:60px 20px">
            <div style="font-size:44px;margin-bottom:14px">🔌</div>
            <h3 style="font-size:18px;color:var(--text)">Python backend is not running</h3>
            <p style="max-width:460px;margin:10px auto;color:var(--muted)">
                This page gets its data from <b>server.py</b>. Start it, then refresh:<br><br>
                <code style="color:var(--blue)">python server.py</code> &nbsp;→&nbsp; open
                <span style="color:var(--green)">http://localhost:8000</span>
            </p>
        </div>`;
    ["stats-grid", "blood-stock-list", "top-diseases-list", "hospitals-list",
     "emergency-result", "review-summary", "modal-body"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = "";
    });
    $("stats-grid").innerHTML = msg;
    toast("Could not reach backend: " + state.error, true);
}

/* =============================================================
   ANALYTICS
   ============================================================= */
const analytics = { bloodTotals: {}, diseaseTotals: {}, specialists: [], stats: {} };

function buildAnalytics() {
    const hs = state.hospitals;
    const blood = {}, diseases = {}, docs = new Map();

    hs.forEach((h) => {
        Object.entries(h.blood).forEach(([k, v]) => (blood[k] = (blood[k] || 0) + v));
        h.diseases.forEach((d) => (diseases[d.name] = (diseases[d.name] || 0) + d.cases));
        h.doctors.forEach((d) => {
            const s = d.specialty.trim().toLowerCase();
            if (s && !docs.has(s)) docs.set(s, d.specialty.trim());
        });
    });

    analytics.bloodTotals = blood;
    analytics.diseaseTotals = diseases;
    analytics.specialists = Array.from(docs.values()).sort();

    const totalDocs = hs.reduce((a, h) => a + h.doctors.length, 0);
    const totalBeds = hs.reduce((a, h) => a + h.beds, 0);
    const totalAmbs = hs.reduce((a, h) => a + h.ambulances.length, 0);
    const avgRating = hs.length ? round1(hs.reduce((a, h) => a + h.rating, 0) / hs.length) : 0;
    analytics.stats = {
        hospitals: hs.length, doctors: totalDocs, beds: totalBeds,
        ambulances: totalAmbs, rating: avgRating,
    };
}

/* =============================================================
   PAGE NAVIGATION
   ============================================================= */
function goToPage(name) {
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.page === name));
    $("page-" + name).classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (name === "hospitals" && map) setTimeout(() => map.invalidateSize(), 60);
}

/* =============================================================
   DISTANCE / MATCHING
   ============================================================= */
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371, rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestHospitals(lat, lon, count = 3) {
    return state.hospitals
        .map((h) => ({ h, d: haversine(lat, lon, h.lat, h.lon) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, count)
        .map((x) => ({ hospital: x.h, distance: x.d }));
}

function findDoctor(h, specialty) {
    const sp = (specialty || "").toLowerCase();
    const exact = h.doctors.find((d) => d.specialty.toLowerCase() === sp);
    if (exact) return exact;
    return h.doctors.find((d) => d.specialty.toLowerCase().includes(sp)) || h.doctors[0] || null;
}

/* Lucknow area coordinates for distance matching */
const AREA_COORDS = {
    Hazratganj: [26.8520, 80.9443], "Gomti Nagar": [26.8624, 81.0203],
    "Indira Nagar": [26.8840, 80.9830], Aliganj: [26.9000, 80.9300],
    Mahanagar: [26.8730, 80.9600], Chowk: [26.8660, 80.9230],
    Alambagh: [26.8350, 80.9050], "Vibhuti Khand": [26.8300, 81.0500],
    Jankipuram: [26.9000, 80.9000], "Kanpur Road": [26.7982, 80.9015],
    Rajajipuram: [26.8700, 80.8800], "Nirala Nagar": [26.8680, 80.9750],
};
const LUCKNOW_CENTER = [26.8467, 80.9462];
const AREA_NAMES = Object.keys(AREA_COORDS);

function resolveLocation(areaName, custom = "") {
    const key = (areaName || custom || "").trim().toLowerCase();
    if (AREA_COORDS[areaName]) return AREA_COORDS[areaName];
    const found = Object.entries(AREA_COORDS).find(([k]) => k.toLowerCase().includes(key));
    return found ? found[1] : LUCKNOW_CENTER;
}

/* =============================================================
   RENDER: DASHBOARD
   ============================================================= */
const STAT_META = [
    { key: "hospitals", label: "Hospitals", icon: "🏥", accent: "var(--grad-red)", glow: "rgba(239,68,68,.35)" },
    { key: "doctors", label: "Doctors", icon: "🩺", accent: "var(--grad-blue)", glow: "rgba(56,189,248,.3)" },
    { key: "beds", label: "Beds", icon: "🛏️", accent: "var(--grad-green)", glow: "rgba(34,197,94,.3)" },
    { key: "ambulances", label: "Ambulances", icon: "🚑", accent: "var(--grad-amber)", glow: "rgba(245,158,11,.3)" },
    { key: "rating", label: "Avg Rating", icon: "⭐", accent: "var(--grad-violet)", glow: "rgba(167,139,250,.3)" },
];

function renderDashboard() {
    const s = analytics.stats;
    $("stats-grid").innerHTML = STAT_META.map((m) => `
        <div class="stat-card" style="--card-accent:${m.accent};--card-glow:${m.glow};animation-delay:${0.05 * STAT_META.indexOf(m)}s">
            <div class="stat-icon" style="background:${m.accent}">${m.icon}</div>
            <div class="stat-num">${m.key === "rating" ? s.rating + " / 5" : s[m.key]}</div>
            <div class="stat-label">${m.label}</div>
        </div>`).join("");

    const maxBlood = Math.max(...Object.values(analytics.bloodTotals), 1);
    const rows = Object.entries(analytics.bloodTotals).sort((a, b) => b[1] - a[1]);
    $("blood-stock-list").innerHTML = rows.map(([g, v]) => {
        const w = (v / maxBlood) * 100;
        return `
        <div class="bar-row">
            <div class="bar-top"><b>${g}</b><span>${v} units</span></div>
            <div class="bar-track"><div class="bar-fill ${fillClass(w)}" style="width:0%"></div></div>
        </div>`;
    }).join("");
    requestAnimationFrame(() => {
        setTimeout(() => {
            document.querySelectorAll("#blood-stock-list .bar-fill").forEach((el, i) => {
                const v = rows[i][1];
                el.style.width = (v / maxBlood) * 100 + "%";
            });
        }, 150);
    });

    const dise = Object.entries(analytics.diseaseTotals).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxDise = Math.max(...dise.map(([, v]) => v), 1);
    $("top-diseases-list").innerHTML = dise.map(([name, v], i) => `
        <div class="bar-row">
            <div class="bar-top"><b>${esc(name)}</b><span>${v} cases</span></div>
            <div class="bar-track"><div class="bar-fill ${["is-red", "is-blue", "is-green", "is-amber", "is-violet"][i % 5]}" style="width:${(v / maxDise) * 100}%"></div></div>
        </div>`).join("");
}

function fillClass(percent) {
    if (percent > 70) return "is-green";
    if (percent > 40) return "is-amber";
    return "is-red";
}

/* =============================================================
   EMERGENCY WIZARD
   ============================================================= */
let wizardStep = 1;
const MAX_STEP = 3;

function fillSpecialists() {
    const sel = $("doctor-type");
    sel.innerHTML = '<option value="">Select specialist…</option>' +
        analytics.specialists.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
}
function fillAreas() {
    const sel = $("area-select");
    sel.innerHTML = AREA_NAMES.map((a) => `<option value="${a}">${a}</option>`).join("") +
        '<option value="__other">Other / type manually…</option>';
    sel.onchange = () => {
        $("custom-area-field").style.display = sel.value === "__other" ? "flex" : "none";
    };
}

function showStep(n) {
    wizardStep = n;
    document.querySelectorAll(".step-panel").forEach((p) => p.classList.remove("active"));
    document.querySelector(`.step-panel[data-panel="${n}"]`).classList.add("active");
    document.querySelectorAll(".step-dot").forEach((d, i) => {
        d.classList.toggle("done", i + 1 < n);
        d.classList.toggle("active", i + 1 === n);
    });
    if (n === 3) renderReview();
}
function wizardNext() {
    if (wizardStep === 1) {
        if (!$("patient-name").value.trim()) return toast("Enter the patient name", true);
        if (!$("doctor-type").value) return toast("Choose a doctor type", true);
    } else if (wizardStep === 2) {
        const area = $("area-select").value;
        if (area === "__other" && !$("custom-area").value.trim()) return toast("Type your area", true);
    }
    showStep(wizardStep + 1);
}
function wizardBack() {
    if (wizardStep <= 1) return;
    showStep(wizardStep - 1);
}

function gatherRequest() {
    const area = $("area-select").value;
    return {
        name: $("patient-name").value.trim(),
        doctorType: $("doctor-type").value,
        criticality: $("criticality").value,
        blood: $("blood-group").value,
        areaLabel: area === "__other" ? $("custom-area").value.trim() : area,
        coords: resolveLocation(area === "__other" ? "" : area, $("custom-area").value),
    };
}

function renderReview() {
    const r = gatherRequest();
    $("review-summary").innerHTML = [
        ["Patient", esc(r.name)], ["Doctor Type", esc(r.doctorType)],
        ["Area", esc(r.areaLabel)], ["Criticality", esc(r.criticality)],
        ["Blood Group", r.blood ? esc(r.blood) : "Not needed"],
    ].map(([k, v]) => `<div class="review-row"><span>${k}</span><b>${v}</b></div>`).join("");
}

function findMatch() {
    const r = gatherRequest();
    if (!r.name || !r.doctorType) return toast("Please complete all steps first", true);

    const nearest = nearestHospitals(r.coords[0], r.coords[1], 3);
    const best = nearest[0];
    const doc = findDoctor(best.hospital, r.doctorType);
    const units = best.hospital.blood[r.blood] || 0;
    const bloodOk = !r.blood || units > 0;
    const amb = best.hospital.ambulances[0];

    $("emergency-result").innerHTML = `
        <div class="result-hero">
            <div class="result-hero-inner">
                <div class="result-badge">🏥</div>
                <h3>${esc(best.hospital.name)}</h3>
                <div class="hospital-loc">${esc(best.hospital.location)} · ${esc(best.hospital.area)} · ~${best.distance.toFixed(1)} km away</div>
                <span class="flag ${esc(r.criticality)}">${esc(r.criticality)}</span>
                <span class="stars" style="margin-left:8px">${stars(best.hospital.rating)} ${best.hospital.rating}</span>
                ${best.hospital.emergency === "Yes" ? '<span class="badge red" style="margin-left:6px;vertical-align:2px">24×7 ER</span>' : ""}
                <button class="btn btn-primary btn-sm" style="margin-top:16px" onclick="viewHospitalOnMap('${esc(best.hospital.id)}')">📍 Show on Map</button>
            </div>
        </div>

        <div class="result-grid">
            <div class="info-card">
                <h4>Patient &amp; Needs</h4>
                <div class="info-row"><span>Patient</span><b>${esc(r.name)}</b></div>
                <div class="info-row"><span>Ailment / Doctor</span><b>${esc(r.doctorType)}</b></div>
                <div class="info-row"><span>Area</span><b>${esc(r.areaLabel)}</b></div>
                <div class="info-row"><span>Blood Group</span><b>${r.blood ? esc(r.blood) : "—"}</b></div>
                <div class="info-row"><span>Blood Available</span><b class="${bloodOk ? "ok" : "err"}">${r.blood ? (bloodOk ? "Yes · " + units + " units" : "No, not in stock") : "Not required"}</b></div>
            </div>
            <div class="info-card">
                <h4>Recommended Doctor</h4>
                ${doc ? `
                    <div class="info-row"><span>Doctor</span><b>${esc(doc.name)}</b></div>
                    <div class="info-row"><span>Specialty</span><b>${esc(doc.specialty)}</b></div>
                    <div class="info-row"><span>Experience</span><b>${doc.experience} years</b></div>
                    <div class="info-row"><span>Consult Fee</span><b>Rs.${doc.fee}</b></div>` : `<div class="info-row"><span>No doctor listed</span><b>—</b></div>`}
            </div>
            <div class="info-card">
                <h4>Hospital Capacity</h4>
                <div class="info-row"><span>Beds Available</span><b>${best.hospital.beds}</b></div>
                <div class="info-row"><span>ICU Beds</span><b>${best.hospital.icu}</b></div>
                <div class="info-row"><span>Price Range</span><b>Rs.${esc(best.hospital.price_range)}</b></div>
                <div class="info-row"><span>Contact</span><b>${esc(best.hospital.contact)}</b></div>
            </div>
            <div class="info-card">
                <h4>Ambulance</h4>
                ${amb ? `
                    <div class="info-row"><span>Vehicle</span><b>${esc(amb.vehicle)}</b></div>
                    <div class="info-row"><span>Driver</span><b>${esc(amb.driver)}</b></div>
                    <div class="info-row"><span>Call</span><b><a class="phone-link" href="tel:${amb.phone}">${esc(amb.phone)}</a></b></div>` : `<div class="info-row"><span>Ambulance</span><b>Not listed</b></div>`}
            </div>
        </div>

        <div class="nearby-list">
            ${nearest.slice(1).map((n) => `
                <div class="nearby-item">
                    <span><b>${esc(n.hospital.name)}</b> · ${esc(n.hospital.location)}</span>
                    <span class="muted" style="color:var(--faint)">${n.distance.toFixed(1)} km · ★${n.hospital.rating}</span>
                </div>`).join("")}
        </div>`;

    showStep(4);
    toast("Best match found — " + best.hospital.name);
}
function startNewRequest() {
    ["patient-name", "custom-area"].forEach((id) => ($(id).value = ""));
    $("blood-group").selectedIndex = 0;
    showStep(1);
}

function viewHospitalOnMap(id) {
    const h = state.hospitals.find((x) => x.id === id);
    if (!h) return;
    goToPage("hospitals");
    setTimeout(() => {
        if (map) map.flyTo([h.lat, h.lon], 14);
        openModal(h);
    }, 200);
}

/* =============================================================
   HOSPITALS: list + filter + modal
   ============================================================= */
let map = null;

function renderHospitals() {
    const q = ($("hospital-search").value || "").toLowerCase();
    const minRating = parseFloat($("rating-filter").value) || 0;
    const sortBy = $("sort-option").value;

    let list = state.hospitals.filter((h) => {
        const hay = (h.name + " " + h.area + " " + h.location + " " + h.doctors.map((d) => d.name + " " + d.specialty).join(" ")).toLowerCase();
        return hay.includes(q) && h.rating >= minRating;
    });

    list.sort((a, b) => {
        if (sortBy === "rating") return b.rating - a.rating;
        if (sortBy === "beds") return b.beds - a.beds;
        if (sortBy === "price") {
            const pa = (a.price_range.split("-").map(Number)[0]) || 0;
            const pb = (b.price_range.split("-").map(Number)[0]) || 0;
            return pa - pb;
        }
        return a.name.localeCompare(b.name);
    });

    const grid = $("hospitals-list");
    if (!list.length) {
        grid.innerHTML = '<div class="empty-note">No hospitals match your search. Try a broader query.</div>';
        return;
    }
    grid.innerHTML = list.map((h, i) => `
        <div class="hosp-card" onclick="openModal('${esc(h.id)}')" style="animation-delay:${Math.min(i * 0.04, 0.4)}s">
            <div class="hosp-top">
                <div class="hosp-name">${esc(h.name)}</div>
                <div class="stars">${stars(h.rating)} <span style="color:var(--faint);font-size:11px">${h.rating}</span></div>
            </div>
            <div class="hosp-area">📍 ${esc(h.location)} · ${esc(h.area)}</div>
            <div class="hosp-meta">
                <span class="badge ${h.emergency === "Yes" ? "red" : ""}" >${esc(h.emergency)}</span>
                <span class="badge blue">${h.beds} beds</span>
                <span class="badge ${h.icu ? "green" : "amber"}">ICU: ${h.icu}</span>
                <span class="badge">Rs.${esc(h.price_range)}</span>
            </div>
            <div class="chips">${h.doctors.slice(0, 3).map((d) => `<span class="chip">${esc(d.specialty)}</span>`).join("")}</div>
            <div class="hosp-footer"><span>${h.doctors.length} doctors</span><span>${h.ambulances.length} ambulances</span></div>
        </div>`).join("");
}

function renderHospitalModal(h) {
    const max = Math.max(...Object.values(h.blood), 1);
    const markBlood = (units) => (units / h.beds) > 0.15 ? "is-green" : units > 0 ? "is-amber" : "is-red";
    $("modal-body").innerHTML = `
        <h2>${esc(h.name)} <span class="stars" style="font-size:14px">${stars(h.rating)}</span></h2>
        <div class="m-sub">${esc(h.location)} · ${esc(h.area)}</div>

        <div class="info-row"><span>Contact</span><b>${esc(h.contact)}</b></div>
        <div class="info-row"><span>24×7 Emergency</span><b class="${h.emergency === "Yes" ? "ok" : "err"}">${esc(h.emergency)}</b></div>
        <div class="info-row"><span>Price Range</span><b>Rs.${esc(h.price_range)}</b></div>
        <div class="info-row"><span>Beds / ICU</span><b>${h.beds} / ${h.icu}</b></div>
        <div style="height:14px"></div>

        <h3 style="font-size:14px;margin-bottom:6px">🩸 Blood Stock</h3>
        ${Object.entries(h.blood).map(([g, v]) => `
            <div class="bar-row">
                <div class="bar-top"><b>${g}</b><span>${v} units</span></div>
                <div class="bar-track"><div class="bar-fill is-${markBlood(v)}" style="width:${(v / max) * 100}%"></div></div>
            </div>`).join("")}

        <div style="height:16px"></div>
        <h3 style="font-size:14px;margin-bottom:6px">🩺 Doctors (${h.doctors.length})</h3>
        ${h.doctors.length ? `
        <div class="table-wrap" style="overflow-x:auto">
            <table class="doctor-table">
                <thead><tr><th>Doctor</th><th>Specialty</th><th>Exp</th><th>Fee</th></tr></thead>
                <tbody>${h.doctors.map((d) => `
                    <tr><td><b>${esc(d.name)}</b></td><td>${esc(d.specialty)}</td><td>${d.experience} yrs</td><td>Rs.${d.fee}</td></tr>`).join("")}
                </tbody>
            </table>
        </div>` : '<p style="color:var(--faint)">No doctors listed.</p>'}

        <div style="height:16px"></div>
        <h3 style="font-size:14px;margin-bottom:6px">🚑 Ambulances (${h.ambulances.length})</h3>
        ${h.ambulances.map((a) => `
            <div class="amb-row"><span><b>${esc(a.vehicle)}</b> · ${esc(a.driver)}</span>
            <a class="phone-link" href="tel:${a.phone}">${esc(a.phone)}</a></div>`).join("") || '<p style="color:var(--faint)">No ambulances listed.</p>'}

        <div style="height:6px"></div>
        <button class="btn btn-danger" style="width:100%;margin-top:14px" onclick="closeModal();goToPage('emergency')">🚑 Emergency at this hospital</button>`;
}

function openModal(id) {
    const h = typeof id === "string" ? state.hospitals.find((x) => x.id === id) : id;
    if (!h) return;
    renderHospitalModal(h);
    $("modal-overlay").classList.add("show");
    document.body.style.overflow = "hidden";
}
function closeModal() {
    $("modal-overlay").classList.remove("show");
    document.body.style.overflow = "";
}

/* ---------- Leaflet map (free tiles, no API key) ---------- */
function initMap() {
    if (typeof L === "undefined") return;
    map = L.map("hospitals-map", { scrollWheelZoom: false }).setView(LUCKNOW_CENTER, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18, attribution: "© OpenStreetMap",
    }).addTo(map);

    const markers = state.hospitals.map((h) => {
        const color = h.rating >= 4.5 ? "#22c55e" : h.rating >= 4 ? "#38bdf8" : h.rating >= 3.5 ? "#f59e0b" : "#ef4444";
        const icon = L.divIcon({ className: "", html: `<div class="lifepin" style="background:${color};box-shadow:0 4px 10px ${color}55"></div>`, iconSize: [26, 26], iconAnchor: [13, 26] });
        const m = L.marker([h.lat, h.lon], { icon, title: h.name }).addTo(map);
        m.bindPopup(`
            <b>${esc(h.name)}</b><br>
            ${esc(h.location)}<br>
            ★ ${h.rating} &nbsp;·&nbsp; ${h.beds} beds &nbsp;·&nbsp; Rs.${esc(h.price_range)}<br>
            <span class="pop-link" onclick="openModal('${esc(h.id)}')">View details →</span>`);
        return m;
    });

    if (markers.length) {
        const group = L.featureGroup(markers);
        setTimeout(() => map.fitBounds(group.getBounds().pad(0.12), { maxZoom: 13 }), 80);
    }
}

/* =============================================================
   DISEASE CHARTS (Chart.js, interactive)
   ============================================================= */
let diseaseChart = null;

function fillDiseases() {
    const sel = $("disease-select");
    sel.innerHTML = '<option value="">All diseases…</option>' +
        Object.entries(analytics.diseaseTotals)
            .sort((a, b) => b[1] - a[1])
            .map(([name, v]) => `<option value="${esc(name)}">${esc(name)} (${v})</option>`).join("");
    sel.onchange = () => switchChartTab(currentChartTab);
}

let currentChartTab = "bar";
function switchChartTab(tab) {
    currentChartTab = tab;
    document.querySelectorAll(".chart-tabs .btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    renderChart(tab);
}

function monthTrend(total) {
    /* deterministic seasonal variation similar to the Python version */
    const weights = [1.35, 1.10, 1.00, 0.95, 0.90, 1.20, 1.35, 1.45, 0.90, 0.80, 0.85, 1.15];
    const sum = weights.reduce((a, b) => a + b, 0);
    let values = weights.map((w) => Math.round((total * w) / sum));
    values[weights.indexOf(Math.max(...weights))] += total - values.reduce((a, b) => a + b, 0);
    return values;
}

function renderChart(tab) {
    if (typeof Chart === "undefined") {
        $("chart-fallback").style.display = "grid";
        return;
    }
    $("chart-fallback").style.display = "none";

    const ctx = $("disease-chart").getContext("2d");
    if (diseaseChart) diseaseChart.destroy();

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const grid = "#94a3b833", text = "#9fb0c7";
    Chart.defaults.color = text;
    Chart.defaults.font.family = "'Inter', sans-serif";

    const totalDiseases = Object.entries(analytics.diseaseTotals).sort((a, b) => b[1] - a[1]);
    const selected = $("disease-select").value;

    if (tab === "bar") {
        const names = totalDiseases.map(([n]) => n);
        const values = totalDiseases.map(([, v]) => v);
        $("chart-title").textContent = "Disease Comparison";
        $("chart-subtitle").textContent = "Bar · All diseases";
        diseaseChart = new Chart(ctx, {
            type: "bar",
            data: { labels: names, datasets: [{ label: "Cases", data: values, backgroundColor: values.map((v, i) => ["#ef4444", "#38bdf8", "#22c55e", "#f59e0b", "#a78bfa"][i % 5]), borderRadius: 6 }] },
            options: baseOpts({ indexAxis: "x" }),
        });
    } else if (tab === "pie") {
        const top = totalDiseases.slice(0, 8);
        $("chart-title").textContent = "Top 8 Diseases Share";
        $("chart-subtitle").textContent = "Pie · Share of cases";
        diseaseChart = new Chart(ctx, {
            type: "doughnut",
            data: { labels: top.map(([n]) => n), datasets: [{ data: top.map(([, v]) => v), backgroundColor: ["#ef4444", "#38bdf8", "#22c55e", "#f59e0b", "#a78bfa", "#ec4899", "#34d399", "#fb923c"], borderColor: "#0b1220", borderWidth: 3 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "right", labels: { color: text } } } },
        });
    } else {
        const name = selected || totalDiseases[0][0];
        const total = selected ? analytics.diseaseTotals[selected] : totalDiseases[0][1];
        $("chart-title").textContent = name + " — 12 Month Trend";
        $("chart-subtitle").textContent = "Trend · Lucknow";
        diseaseChart = new Chart(ctx, {
            type: "line",
            data: { labels: months, datasets: [{ label: name + " cases", data: monthTrend(total), borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,.15)", pointBackgroundColor: "#f43f5e", pointRadius: 5, tension: 0.35, fill: true }] },
            options: baseOpts({ indexAxis: "x" }),
        });
    }
}

function baseOpts() {
    return {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: "#111a2c", borderColor: "#334155", borderWidth: 1, padding: 12, titleFont: { weight: "700" } } },
        scales: {
            x: { grid: { color: "#94a3b833" }, ticks: { maxRotation: 45, minRotation: 0 } },
            y: { beginAtZero: true, grid: { color: "#94a3b833" } },
        },
    };
}

/* =============================================================
   INIT
   ============================================================= */
function renderEverything() {
    renderDashboard();
    fillAreas();
    fillSpecialists();
    renderHospitals();
    fillDiseases();
    initMap();          // uses state.hospitals
    renderChart("bar");
    $("doctor-type").selectedIndex = 1;
}

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".nav-btn").forEach((b) => b.addEventListener("click", () => goToPage(b.dataset.page)));

    /* live hospital filtering */
    ["hospital-search", "rating-filter", "sort-option"].forEach((id) =>
        $(id).addEventListener(id === "hospital-search" ? "input" : "change", renderHospitals));

    document.querySelectorAll(".chart-tabs .btn").forEach((b) =>
        b.addEventListener("click", () => switchChartTab(b.dataset.tab)));

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeModal();
    });
    $("modal-overlay").addEventListener("click", (e) => {
        if (e.target === $("modal-overlay")) closeModal();
    });

    loadData();
});

/* ---- tiny API surface (used by tests / console debugging) ---- */
window.LifeLink = {
    state, analytics, map: () => map,
    haversine, nearestHospitals, findDoctor,
    resolveLocation, monthTrend, goToPage,
    openModal, closeModal, startNewRequest,
    wizardNext, wizardBack, findMatch, renderHospitals,
    loadData, fetchStats: async () => {
        const r = await fetch("/api/stats");
        return r.json();
    },
};