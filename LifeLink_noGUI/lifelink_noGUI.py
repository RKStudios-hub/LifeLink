"""
==================================================================
 LifeLink_noGUI - Community Emergency Service System (Lucknow)
 Terminal version. Number-based navigation.
 Uses matplotlib for graphs. No external libraries other than
 matplotlib (install with: pip install matplotlib)
==================================================================
"""

import os
import csv
import math
import time
import random

# ---------- matplotlib for graphs ----------
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# ============================================================
#  DATA LOADING (reads data/hospitals.csv)
# ============================================================
DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "hospitals.csv")


def load_hospitals():
    """Read all hospitals from the CSV file."""
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def parse_doctors(text):
    """Convert 'Dr.X:Cardiology:10:500|Dr.Y:General:8:300' into a list of dicts."""
    result = []
    for part in (text or "").split("|"):
        p = part.split(":")
        if len(p) == 4:
            result.append({"name": p[0], "specialty": p[1],
                           "experience": int(p[2]), "fee": int(p[3])})
    return result


def parse_blood(text):
    """Convert 'A+:15|B+:10' into {'A+': 15, 'B+': 10}."""
    result = {}
    for part in (text or "").split("|"):
        p = part.split(":")
        if len(p) == 2:
            result[p[0]] = int(p[1])
    return result


def parse_ambulances(text):
    """Convert 'UP32-123:Ravi:9876543210' into a list of dicts."""
    result = []
    for part in (text or "").split("|"):
        p = part.split(":")
        if len(p) == 3:
            result.append({"vehicle": p[0], "driver": p[1], "phone": p[2]})
    return result


def parse_diseases(text):
    """Convert 'Fever:40,Dengue:12' into a list of dicts."""
    result = []
    for part in (text or "").split(","):
        p = part.split(":")
        if len(p) == 2:
            result.append({"name": p[0].strip(), "cases": int(p[1])})
    return result


# ============================================================
#  DISTANCE & MATCHING HELPERS
# ============================================================
def haversine(lat1, lon1, lat2, lon2):
    """Distance in km between two points on Earth."""
    R = 6371.0
    a = (math.sin(math.radians(lat2 - lat1) / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def find_nearest(user_lat, user_lon, count=3):
    """Return the nearest hospitals sorted by distance."""
    hospitals = load_hospitals()
    for h in hospitals:
        h["_distance"] = haversine(user_lat, user_lon,
                                   float(h["lat"]), float(h["lon"]))
    hospitals.sort(key=lambda h: h["_distance"])
    return hospitals[:count]


def find_doctor(hospital, specialty):
    """Find the best doctor for the given specialty."""
    doctors = parse_doctors(hospital["doctors"])
    sp = specialty.lower()
    for doc in doctors:
        if sp in doc["specialty"].lower():
            return doc
    return doctors[0] if doctors else None


def blood_status(hospital, blood_group):
    """Check how many units of a blood group a hospital has."""
    stock = parse_blood(hospital["blood_stock"])
    units = stock.get(blood_group, 0)
    return units, units > 0


# ============================================================
#  DISPLAY HELPERS
# ============================================================
WIDTH = 60


def clear():
    os.system("cls" if os.name == "nt" else "clear")


def banner():
    print()
    print("  " + "=" * WIDTH)
    print("  ||" + "  L I F E   L I N K   noGUI".center(WIDTH - 4) + "||")
    print("  ||" + "  Community Emergency Service System".center(WIDTH - 4) + "||")
    print("  ||" + "  L U C K N O W".center(WIDTH - 4) + "||")
    print("  " + "=" * WIDTH)
    print()


def line():
    print("  " + "-" * WIDTH)


def show(msg):
    print("  " + msg)


def pause():
    input("\n  Press Enter to continue...")


def get_text(prompt):
    return input("  " + prompt + ": ").strip()


def get_number(prompt, low, high):
    """Ask the user to type a number between low and high."""
    while True:
        try:
            n = int(input("  " + prompt + f" ({low}-{high}): ").strip())
            if low <= n <= high:
                return n
            print(f"  ! Please enter a number from {low} to {high}.")
        except ValueError:
            print("  ! Please enter a valid number.")


# ============================================================
#  MENU: NEW EMERGENCY REQUEST
# ============================================================
def emergency_request():
    clear()
    banner()
    line()
    show("NEW EMERGENCY REQUEST")
    line()
    print()

    patient = get_text("Patient name")
    doctor_type = get_text("Doctor type needed (e.g. Cardiology, General)")

    # Choose location from a numbered list of Lucknow areas
    areas = ["Hazratganj", "Gomti Nagar", "Indira Nagar", "Aliganj", "Mahanagar",
             "Chowk", "Alambagh", "Vibhuti Khand", "Jankipuram", "Kanpur Road",
             "Rajajipuram", "Nirala Nagar", "Other (type yourself)"]
    print()
    show("Choose your area in Lucknow:")
    for i, area in enumerate(areas, 1):
        print(f"       {i}. {area}")
    area_choice = get_number("  Enter area number", 1, len(areas))
    if area_choice == len(areas):
        location = get_text("Type your area / location")
    else:
        location = areas[area_choice - 1]

    print()
    print("  Blood group needed (optional):")
    blood_groups = ["(none)", "A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]
    for i, bg in enumerate(blood_groups):
        print(f"       {i}. {bg}")
    bg_choice = get_number("  Enter blood group number", 0, len(blood_groups) - 1)
    blood_group = "" if bg_choice == 0 else blood_groups[bg_choice]

    print()
    print("  Criticality level:")
    levels = ["Critical", "High", "Medium", "Low"]
    for i, lv in enumerate(levels, 1):
        print(f"       {i}. {lv}")
    crit_choice = get_number("  Enter criticality number", 1, 4)
    criticality = levels[crit_choice - 1]

    # Location coordinates for distance
    area_coords = {
        "hazratganj": (26.8520, 80.9443), "gomti": (26.8624, 81.0203),
        "indira": (26.8840, 80.9830), "aliganj": (26.9000, 80.9300),
        "mahanagar": (26.8730, 80.9600), "chowk": (26.8660, 80.9230),
        "alambagh": (26.8350, 80.9050), "vibhuti": (26.8300, 81.0500),
        "jankipuram": (26.9000, 80.9000), "kanpur": (26.7982, 80.9015),
        "rajajipuram": (26.8700, 80.8800), "nirala": (26.8680, 80.9750),
    }
    user_lat, user_lon = 26.8467, 80.9462
    for key, coord in area_coords.items():
        if key in location.lower():
            user_lat, user_lon = coord
            break

    nearest = find_nearest(user_lat, user_lon, 3)
    best = nearest[0]
    doc = find_doctor(best, doctor_type)
    units, available = blood_status(best, blood_group) if blood_group else (0, False)
    ambs = parse_ambulances(best["ambulances"])

    # ---------- Result ----------
    clear()
    banner()
    line()
    show("RESULT FOR " + patient.upper())
    line()
    print()
    print(f"  Patient       : {patient}")
    print(f"  Doctor Needed : {doctor_type}")
    print(f"  Location      : {location}")
    print(f"  Criticality   : {criticality}")
    if blood_group:
        print(f"  Blood Group   : {blood_group}")
    print()
    line()
    print("  NEAREST HOSPITAL")
    line()
    rating = float(best["rating"])
    print(f"  Name      : {best['name']}")
    print(f"  Location  : {best['location']}")
    print(f"  Contact   : {best['contact']}")
    print(f"  Rating    : {'*' * int(rating)}{'.' * (5 - int(rating))} {rating}/5")
    print(f"  Price     : Rs.{best['price_range']}")
    print(f"  Beds      : {best['beds_available']}  |  ICU: {best['icu_available']}")
    print(f"  Distance  : ~{best['_distance']:.1f} km")
    print()
    line()
    print("  RECOMMENDED DOCTOR")
    line()
    if doc:
        print(f"  Name        : {doc['name']}")
        print(f"  Specialty   : {doc['specialty']}")
        print(f"  Experience  : {doc['experience']} years")
        print(f"  Fee         : Rs.{doc['fee']}")
    else:
        print("  No doctor found.")
    print()
    if blood_group:
        print("  BLOOD: " + blood_group + (" AVAILABLE (" + str(units) + " units)" if available else " NOT AVAILABLE"))
        print()
    if ambs:
        a = ambs[0]
        print(f"  AMBULANCE: {a['vehicle']} | Driver: {a['driver']} | Phone: {a['phone']}")
        print()
    if len(nearest) > 1:
        print("  Other nearby hospitals:")
        for h in nearest[1:]:
            print(f"    - {h['name']} ({h['location']}) ~{h['_distance']:.1f} km")
    print()
    pause()


# ============================================================
#  MENU: VIEW HOSPITALS
# ============================================================
def view_hospitals():
    hospitals = load_hospitals()
    clear()
    banner()
    line()
    show(f"ALL HOSPITALS IN LUCKNOW ({len(hospitals)} total)")
    line()
    print()
    for i, h in enumerate(hospitals, 1):
        print(f"  {i}. {h['name']}")
        print(f"     Location: {h['area']}  |  Rating: {h['rating']}/5  |  Price: Rs.{h['price_range']}")
        print(f"     Beds: {h['beds_available']}  |  ICU: {h['icu_available']}")
        docs = parse_doctors(h["doctors"])
        names = ", ".join(d["name"] + " (" + d["specialty"] + ")" for d in docs[:4])
        print(f"     Doctors: {names}" + ("..." if len(docs) > 4 else ""))
        print()
    pause()


# ============================================================
#  MENU: DISEASE TREND GRAPH (matplotlib)
# ============================================================
def disease_graph():
    # Collect all disease totals
    totals = {}
    for h in load_hospitals():
        for d in parse_diseases(h["disease_cases"]):
            totals[d["name"]] = totals.get(d["name"], 0) + d["cases"]

    clear()
    banner()
    line()
    show("DISEASE TREND GRAPH")
    line()
    print()
    print("  Choose a disease:")
    names = sorted(totals.keys())
    for i, name in enumerate(names, 1):
        print(f"    {i}. {name} ({totals[name]} cases)")
    choice = get_number("  Enter disease number", 1, len(names))
    disease = names[choice - 1]
    total = totals[disease]

    # Build a realistic 12-month trend from the total
    rng = random.Random(42)
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    values = []
    for i in range(12):
        values.append(max(0, int(total / 12 * (0.75 + rng.random() * 0.5))))
    values[values.index(max(values))] += total - sum(values)

    clear()
    banner()
    print(f"  Generating graph for: {disease}  (Total {total} cases)")
    print()

    plt.figure(figsize=(9, 5))
    plt.bar(months, values, color="#dc2626", edgecolor="white", linewidth=1.2)
    for i, v in enumerate(values):
        plt.text(i, v + total * 0.01, str(v), ha="center", fontsize=8, fontweight="bold")
    plt.title(f"Disease Trend - {disease} (Lucknow, 12 months)", fontsize=14, fontweight="bold")
    plt.xlabel("Month")
    plt.ylabel("Number of Cases")
    plt.grid(axis="y", alpha=0.3)
    plt.tight_layout()

    graph_name = f"noGUI_trend_{disease.replace(' ', '_').replace('/', '_')}.png"
    graph_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), graph_name)
    plt.savefig(graph_path, dpi=150)
    plt.close()

    print("  Graph saved as: " + graph_name)
    print("  Opening graph...")
    time.sleep(1)
    try:
        os.startfile(graph_path)
    except Exception:
        print("  (Could not auto-open, please open the saved image manually)")
    pause()


# ============================================================
#  MENU: SYSTEM STATISTICS
# ============================================================
def statistics():
    hospitals = load_hospitals()
    total_beds = sum(int(h["beds_available"]) for h in hospitals)
    total_doctors = sum(len(parse_doctors(h["doctors"])) for h in hospitals)
    total_ambs = sum(len(parse_ambulances(h["ambulances"])) for h in hospitals)
    avg_rating = sum(float(h["rating"]) for h in hospitals) / len(hospitals)

    blood = {}
    for h in hospitals:
        for bg, u in parse_blood(h["blood_stock"]).items():
            blood[bg] = blood.get(bg, 0) + u

    clear()
    banner()
    line()
    show("SYSTEM STATISTICS (LUCKNOW)")
    line()
    print()
    print(f"  Total Hospitals   : {len(hospitals)}")
    print(f"  Total Doctors     : {total_doctors}")
    print(f"  Total Beds        : {total_beds}")
    print(f"  Total Ambulances  : {total_ambs}")
    print(f"  Average Rating    : {avg_rating:.1f} / 5")
    print()
    print("  Blood Stock Summary:")
    for bg in ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]:
        if bg in blood:
            print(f"    {bg}: {blood[bg]} units")
    print()
    pause()


# ============================================================
#  MENU: CHAT (placeholder)
# ============================================================
def chat():
    clear()
    banner()
    line()
    show("CHAT WITH HOSPITAL")
    line()
    print()
    print("  This feature will let you chat directly with hospitals")
    print("  to ask about availability, book appointments, and get")
    print("  real-time updates on your emergency request.")
    print()
    print("  " + "-" * WIDTH)
    print("  We will add it in next update")
    print("  " + "-" * WIDTH)
    print()
    pause()


# ============================================================
#  MAIN MENU (number based)
# ============================================================
def main():
    while True:
        clear()
        banner()
        print("  MAIN MENU")
        print()
        print("  1. New Emergency Request")
        print("  2. View All Hospitals")
        print("  3. Disease Trend Graph")
        print("  4. System Statistics")
        print("  5. Chat with Hospital")
        print()
        print("  0. Exit")
        print()
        choice = get_number("Enter your choice", 0, 5)

        if choice == 1:
            emergency_request()
        elif choice == 2:
            view_hospitals()
        elif choice == 3:
            disease_graph()
        elif choice == 4:
            statistics()
        elif choice == 5:
            chat()
        elif choice == 0:
            clear()
            banner()
            print("  Thank you for using LifeLink. Stay safe. Help others.")
            print()
            print("  " + "=" * WIDTH)
            print()
            break


if __name__ == "__main__":
    main()