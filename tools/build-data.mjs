/**
 * LifeLink data build script.
 *
 * Converts the original LifeLink dataset (tools/hospitals.csv) into:
 *   - data/hospitals.json  (canonical offline dataset, loaded via fetch)
 *   - js/data.js           (identical copy embedded as a JS global, used when
 *                           the app is opened from the filesystem where fetch()
 *                           of local files is blocked)
 *
 * Run with:  node tools/build-data.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const LAST_UPDATED = '2026-10-07';

const DEFAULT_DOCUMENTS = [
  'Government ID',
  'Previous medical reports',
  'Prescription',
  'Insurance/health card',
];

/* ------------------------------------------------------------------ */
/* Minimal RFC4180-ish CSV parser                                      */
/* ------------------------------------------------------------------ */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = ''; rows.push(row); row = [];
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows
    .filter((r) => r.length > 1 && String(r[0]).trim() !== '')
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

function parseKeyValues(text, pairCount) {
  const out = {};
  for (const part of String(text || '').split('|')) {
    const bits = part.split(':');
    if (bits.length === pairCount) out[bits[0]] = bits.slice(1);
  }
  return out;
}

function parseDoctors(text) {
  return String(text || '').split('|').map((p) => {
    const b = p.split(':');
    if (b.length === 4) return { name: b[0], specialty: b[1], experience: +b[2], fee: +b[3] };
    if (b.length === 2) return { name: b[0], specialty: b[1], experience: null, fee: null };
    return null;
  }).filter(Boolean);
}

function parseBlood(text) {
  const out = {};
  for (const part of String(text || '').split('|')) {
    const b = part.split(':');
    if (b.length === 2 && b[0]) out[b[0]] = parseInt(b[1], 10) || 0;
  }
  return out;
}

function parseAmbulances(text) {
  return String(text || '').split('|').map((p) => {
    const b = p.split(':');
    if (b.length === 3) return { vehicle: b[0], driver: b[1], phone: b[2] };
    return null;
  }).filter(Boolean);
}

/* "Dengue:26,Asthma:13,..." -> { Dengue: 26, Asthma: 13 } */
function parseDiseaseCases(text) {
  const out = {};
  for (const part of String(text || '').split(',')) {
    const idx = part.lastIndexOf(':');
    if (idx < 1) continue;
    const name = part.slice(0, idx).trim();
    const count = parseInt(part.slice(idx + 1), 10);
    if (name && Number.isFinite(count)) out[name] = count;
  }
  return out;
}

const yes = (v) => String(v || '').trim().toLowerCase() === 'yes';

/* ------------------------------------------------------------------ */
/* Convert                                                             */
/* ------------------------------------------------------------------ */
const csv = readFileSync(join(__dirname, 'hospitals.csv'), 'utf8');
const rows = parseCSV(csv);

const hospitals = rows.map((r) => {
  const doctors = parseDoctors(r.doctors);
  const blood = parseBlood(r.blood_stock);
  const ambulances = parseAmbulances(r.ambulances);
  const diseaseCases = parseDiseaseCases(r.disease_cases);
  const beds = parseInt(r.beds_available, 10);
  const emergency = yes(r.emergency_services);
  const icu = yes(r.icu_available);

  const specialties = [...new Set(doctors.map((d) => d.specialty).filter(Boolean))].sort();

  const facilities = [];
  if (emergency) facilities.push('24/7 Emergency');
  if (icu) facilities.push('Intensive Care Unit (ICU)');
  if (Number.isFinite(beds) && beds > 0) facilities.push('Inpatient beds');
  if (ambulances.length) facilities.push('Ambulance service');
  if (Object.keys(blood).length) facilities.push('Blood stock information');
  if (doctors.length) facilities.push('Outpatient department');

  return {
    id: 'hospital-' + String(r.hospital_id).padStart(3, '0'),
    source_id: parseInt(r.hospital_id, 10),
    name: r.name.trim(),
    source_location: (r.location || '').trim(),
    address: `${(r.area || r.location || '').trim()}, Lucknow`,
    area: (r.area || r.location || '').trim(),
    locality: (r.area || r.location || '').split('-').pop().trim(),
    latitude: parseFloat(r.lat),
    longitude: parseFloat(r.lon),
    phone: (r.contact || '').trim(),
    emergency_phone: '',
    emergency_available: emergency,
    icu_available: icu,
    ambulance_available: ambulances.length > 0,
    beds_available: Number.isFinite(beds) ? beds : null,
    blood_availability: Object.keys(blood).length ? blood : {},
    facilities,
    specialties,
    doctors,
    ambulances,
    rating: parseFloat(r.rating) || null,
    price_range: (r.price_range || '').trim(),
    disease_cases: diseaseCases,
    required_documents: DEFAULT_DOCUMENTS.slice(),
    last_updated: LAST_UPDATED,
  };
});

if (hospitals.length !== 81) {
  console.warn(`Warning: expected 81 hospitals, built ${hospitals.length}.`);
}

const json = JSON.stringify(hospitals, null, 1) + '\n';
mkdirSync(join(ROOT, 'data'), { recursive: true });
mkdirSync(join(ROOT, 'js'), { recursive: true });
writeFileSync(join(ROOT, 'data', 'hospitals.json'), json, 'utf8');
writeFileSync(
  join(ROOT, 'js', 'data.js'),
  '/* AUTO-GENERATED from tools/hospitals.csv by tools/build-data.mjs - do not edit by hand. */\n' +
    'window.LIFELINK_HOSPITALS = ' + json.trim() + ';\n',
  'utf8'
);

console.log(`Built ${hospitals.length} hospitals -> data/hospitals.json, js/data.js`);
console.log(`With emergency: ${hospitals.filter((h) => h.emergency_available).length}`);
console.log(`With ICU: ${hospitals.filter((h) => h.icu_available).length}`);
console.log(`With ambulance: ${hospitals.filter((h) => h.ambulance_available).length}`);
