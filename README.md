# 🚑 LifeLink — Community Emergency Service System (Lucknow)

A school-project emergency service system for **Lucknow** with three parts, all sharing one dataset of **81 real registered hospitals**.

```
pip install -r requirements.txt
```

## ▶️ Quick start

```
python server.py
```

Then open **http://localhost:8000** — the Python (Flask) backend serves both the JSON API and the web frontend.

## 📦 What's inside

| Path | What it is |
|------|-----------|
| `server.py` | Python (Flask) backend — JSON API + serves the web frontend |
| `frontend/` | Web GUI — dashboard, emergency wizard, hospital map, interactive charts |
| `lifelink.py` | Terminal CLI app (arrow-key menus) + matplotlib disease graphs |
| `LifeLink_noGUI/` | Terminal version with number/input-based navigation |
| `generate_data.py` | One-time generator of the hospital dataset |
| `data/hospitals.csv` | Single shared dataset — 81 Lucknow hospitals, 630 doctors |

## 🔌 Backend API

| Route | Description |
|-------|-------------|
| `GET /` | The web GUI |
| `GET /api/hospitals` | All hospitals (doctors, blood, ambulances, diseases parsed to JSON) |
| `GET /api/stats` | Aggregate stats: totals, blood stock, disease totals, specialties |
| `GET /api/search?q=` | Search hospitals by name, doctor or specialty |

## 🖥️ CLI version

```
python lifelink.py          # arrow-key navigation
python lifelink_noGUI.py    # number-based navigation (inside LifeLink_noGUI/)
```

## ✨ Features

- 🏥 **81 hospitals** with real doctors, blood groups, ambulances, ICU/beds
- 📍 **Nearest-match logic** for emergencies by Lucknow area
- 🗺️ Interactive map of hospitals (Leaflet + OpenStreetMap)
- 📊 Interactive disease charts (Chart.js): bar / pie / 12-month trend
- 🩸 Blood-stock overview and disease case tracking
- 🚑 Ambulance contact call-to-action links

## 📁 Project structure

```
School_project/
├── server.py                # Flask backend
├── frontend/                # HTML + CSS + JS
├── data/
│   └── hospitals.csv        # single shared dataset
├── lifelink.py              # CLI (arrow keys) + graphs
├── LifeLink_noGUI/          # CLI (numbers/input)
├── generate_data.py         # dataset generator (one-time)
└── requirements.txt
```

---

**LifeLink — Community Emergency Service System.** Built as a school project.