"""
==================================================================
 LifeLink Backend Server (Flask)
 Serves the JSON API to the HTML frontend and the frontend itself.

 Run:
     python server.py
 Then open:  http://localhost:8000

 APIs:
     GET /                  -> the HTML GUI (frontend/index.html)
     GET /api/hospitals     -> all hospitals (fully parsed JSON)
     GET /api/stats         -> aggregate statistics
==================================================================
"""

import csv
import math
import os

from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "data", "hospitals.csv")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

app = Flask(__name__, static_folder=None)


# ------------------------------------------------------------
#  Data parsing helpers
# ------------------------------------------------------------
def parse_doctors(text):
    result = []
    for part in (text or "").split("|"):
        p = part.split(":")
        if len(p) == 4:
            result.append({"name": p[0], "specialty": p[1],
                           "experience": int(p[2]), "fee": int(p[3])})
    return result


def parse_blood(text):
    result = {}
    for part in (text or "").split("|"):
        p = part.split(":")
        if len(p) == 2:
            result[p[0]] = int(p[1])
    return result


def parse_ambulances(text):
    result = []
    for part in (text or "").split("|"):
        p = part.split(":")
        if len(p) == 3:
            result.append({"vehicle": p[0], "driver": p[1], "phone": p[2]})
    return result


def parse_diseases(text):
    result = []
    for part in (text or "").split(","):
        p = part.split(":")
        if len(p) == 2:
            result.append({"name": p[0].strip(), "cases": int(p[1])})
    return result


def hospital_to_dict(raw):
    """Convert one CSV row into clean JSON for the frontend."""
    return {
        "id": raw["hospital_id"],
        "name": raw["name"],
        "location": raw["location"],
        "area": raw["area"],
        "contact": raw["contact"],
        "lat": float(raw["lat"]),
        "lon": float(raw["lon"]),
        "rating": float(raw["rating"]),
        "price_range": raw["price_range"],
        "doctors": parse_doctors(raw["doctors"]),
        "blood": parse_blood(raw["blood_stock"]),
        "ambulances": parse_ambulances(raw["ambulances"]),
        "icu": 1 if raw["icu_available"].strip().lower() == "yes" else 0,
        "beds": int(raw["beds_available"]),
        "emergency": raw["emergency_services"],
        "diseases": parse_diseases(raw["disease_cases"]),
    }


def load_hospitals():
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return [hospital_to_dict(row) for row in csv.DictReader(f)]


# ------------------------------------------------------------
#  API Routes
# ------------------------------------------------------------
@app.route("/api/hospitals")
def api_hospitals():
    return jsonify(load_hospitals())


@app.route("/api/search")
def api_search():
    q = (request.args.get("q") or "").strip().lower()
    hospitals = load_hospitals()
    if not q:
        return jsonify(hospitals)
    matches = []
    for h in hospitals:
        haystack = " ".join([
            h["name"], h["location"], h["area"],
            " ".join(d["name"] + " " + d["specialty"] for d in h["doctors"]),
        ]).lower()
        if q in haystack:
            matches.append(h)
    return jsonify(matches)


@app.route("/api/stats")
def api_stats():
    hospitals = load_hospitals()
    blood = {}
    diseases = {}
    specialties = set()

    total_doctors = total_beds = total_ambulances = 0
    for h in hospitals:
        for group, units in h["blood"].items():
            blood[group] = blood.get(group, 0) + units
        for d in h["diseases"]:
            diseases[d["name"]] = diseases.get(d["name"], 0) + d["cases"]
        for doc in h["doctors"]:
            specialties.add(doc["specialty"])
        total_doctors += len(h["doctors"])
        total_beds += h["beds"]
        total_ambulances += len(h["ambulances"])

    return jsonify({
        "hospitals": len(hospitals),
        "doctors": total_doctors,
        "beds": total_beds,
        "ambulances": total_ambulances,
        "rating": round(sum(h["rating"] for h in hospitals) / max(len(hospitals), 1), 2),
        "blood": dict(sorted(blood.items(), key=lambda kv: -kv[1])),
        "diseases": diseases,
        "specialties": sorted(specialties),
    })


# ------------------------------------------------------------
#  Frontend (static) routes
# ------------------------------------------------------------
@app.route("/")
def serve_index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/<path:path>")
def serve_static(path):
    return send_from_directory(FRONTEND_DIR, path)


if __name__ == "__main__":
    # Bind to 0.0.0.0 so other devices on the network can connect too.
    app.run(host="0.0.0.0", port=8000, debug=True)