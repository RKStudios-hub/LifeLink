"""
LifeLink - Community Emergency Service System (Lucknow)
Single self-contained file. No external modules except matplotlib (optional).
CSV data is embedded and read from data/hospitals.csv which lives next to this file.
"""

import os
import csv
import math
import random
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    HAS_MPL = True
except Exception:
    HAS_MPL = False

# ---------- Windows arrow-key / raw input support ----------
try:
    import msvcrt
    USE_MSVCRT = True
except ImportError:
    USE_MSVCRT = False

DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "hospitals.csv")

# ============================================================
#  COLORS
# ============================================================
class C:
    R = "\033[91m"; G = "\033[92m"; Y = "\033[93m"; B = "\033[94m"
    M = "\033[95m"; CY = "\033[96m"; W = "\033[97m"; K = "\033[90m"
    DIM = "\033[2m"; BOLD = "\033[1m"; RESET = "\033[0m"
    BG_R = "\033[41m"; BG_G = "\033[42m"; BG_Y = "\033[43m"; BG_B = "\033[44m"
    BG_M = "\033[45m"; BG_C = "\033[46m"; BG_W = "\033[47m"
    UNDER = "\033[4m"


def r(t): return t + C.RESET


# ============================================================
#  LOGO (clean, correctly aligned)
# ============================================================
LOGO = [
    r(f"{C.BG_R}{C.W}{C.BOLD}   L I F E   L I N K   {C.RESET}"),
    r(f"{C.Y}{C.BOLD}Community Emergency Service System{C.RESET}"),
    r(f"{C.K}------------------------------------{C.RESET}"),
]


def banner():
    print()
    for line in LOGO:
        print("  " + line)
    print()


# ============================================================
#  CSV LOADING & PARSING
# ============================================================
def load_hospitals():
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def parse_doctors(s):
    out = []
    for entry in (s or "").split("|"):
        p = entry.split(":")
        if len(p) == 4:
            out.append({"name": p[0], "specialty": p[1],
                        "experience": int(p[2]), "fee": int(p[3])})
    return out


def parse_blood(s):
    out = {}
    for entry in (s or "").split("|"):
        p = entry.split(":")
        if len(p) == 2:
            out[p[0]] = int(p[1])
    return out


def parse_ambulances(s):
    out = []
    for entry in (s or "").split("|"):
        p = entry.split(":")
        if len(p) == 3:
            out.append({"vehicle": p[0], "driver": p[1], "phone": p[2]})
    return out


def parse_diseases(s):
    out = []
    for entry in (s or "").split(","):
        p = entry.split(":")
        if len(p) == 2:
            out.append({"name": p[0].strip(), "cases": int(p[1])})
    return out


# ============================================================
#  HELPERS
# ============================================================
def clear():
    os.system("cls" if os.name == "nt" else "clear")


def pause():
    print(r(f"\n  {C.DIM}Press Enter to continue...{C.RESET}"))
    input()


def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def find_nearest(user_lat, user_lon, count=3):
    hospitals = load_hospitals()
    for h in hospitals:
        h["_dist"] = haversine(user_lat, user_lon, float(h["lat"]), float(h["lon"]))
    hospitals.sort(key=lambda h: h["_dist"])
    return hospitals[:count]


def find_doctor(hospital, specialty):
    docs = parse_doctors(hospital["doctors"])
    sp = specialty.lower()
    for d in docs:
        if sp in d["specialty"].lower():
            return d
    for d in docs:
        for w in sp.split():
            if w in d["specialty"].lower():
                return d
    return docs[0] if docs else None


def star_rating(rating):
    val = float(rating)
    full = int(val)
    return "★" * full + "☆" * (5 - full) + f" {val:.1f}/5"


def priority_level(criticality):
    c = criticality.lower()
    if c in ("critical", "immediate", "very high"):
        return "CRITICAL", C.R
    if c in ("high", "severe", "urgent"):
        return "HIGH", C.Y
    if c in ("medium", "moderate"):
        return "MEDIUM", C.CY
    return "LOW", C.G


# ============================================================
#  ARROW-KEY MENU NAVIGATION
# ============================================================
def select_from_list(title, options, header=None):
    """Return selected index (0-based). Navigate with up/down arrows, Enter to pick."""
    idx = 0
    while True:
        clear()
        banner()
        print(r(f"  {C.CY}{C.BOLD}{title}{C.RESET}"))
        if header:
            print(r(f"  {C.K}{header}{C.RESET}"))
        print()
        for i, opt in enumerate(options):
            marker = r(f"{C.BG_C}{C.K}{C.BOLD} > {C.RESET}") if i == idx else "   "
            text = opt if i == idx else r(f"{C.K}{opt}{C.RESET}")
            print(f"    {marker}{text}")
        print()
        print(r(f"  {C.K}Use {C.CY}(Up/Down){C.K} arrows to move, {C.G}(Enter){C.K} to select, {C.R}(Esc){C.K} to cancel{C.RESET}"))

        key = get_key()
        if key == "up":
            idx = (idx - 1) % len(options)
        elif key == "down":
            idx = (idx + 1) % len(options)
        elif key == "enter":
            return idx
        elif key == "esc":
            return None


def get_key():
    """Read a single keypress; return 'up','down','left','right','enter','esc', or a char."""
    if USE_MSVCRT:
        ch = msvcrt.getwch()
        if ch in ("\x00", "\xe0"):
            ch2 = msvcrt.getwch()
            return {"H": "up", "P": "down", "K": "left", "M": "right"}.get(ch2, ch2)
        if ch == "\r":
            return "enter"
        if ch == "\x1b":
            return "esc"
        return ch
    return input()


# ============================================================
#  TEXT INPUT WITH SAFE READING
# ============================================================
def get_input(prompt):
    return input(r(f"  {C.CY}▸{C.RESET} {C.BOLD}{prompt}{C.RESET}: ")).strip()


# ============================================================
#  EMERGENCY REQUEST
# ============================================================
def emergency_request():
    clear()
    banner()
    print(r(f"  {C.CY}{C.BOLD}━━━  NEW EMERGENCY REQUEST  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{C.RESET}"))
    print()

    patient = get_input("Patient name")
    specialty = get_input("Doctor type needed (e.g. Cardiology, General, Orthopedics)")
    location = get_input("Your location / area in Lucknow")
    blood_group = get_input("Blood group needed (or Enter to skip)")

    # criticality via arrow keys
    crit_options = ["Critical", "High", "Medium", "Low"]
    ci = select_from_list("Select Criticality Level", crit_options)
    if ci is None:
        return
    criticality = crit_options[ci].lower()
    prio_label, prio_color = priority_level(criticality)

    # default center of Lucknow unless a known area keyword is found
    user_lat, user_lon = 26.8467, 80.9462
    lk = location.lower()
    area_coords = {
        "gomti": (26.8624, 81.0203), "indira": (26.8840, 80.9830),
        "hazratganj": (26.8520, 80.9443), "golaganj": (26.8550, 80.9280),
        "aliganj": (26.9000, 80.9300), "kanpur": (26.7982, 80.9015),
        "chowk": (26.8660, 80.9230), "mahanagar": (26.8730, 80.9600),
        "rajajipuram": (26.8700, 80.8800), "alambagh": (26.8350, 80.9050),
        "vibhuti": (26.8300, 81.0500), "jankipuram": (26.9000, 80.9000),
        "ama": (26.8490, 80.9510), "nirala": (26.8680, 80.9750),
    }
    for key, coord in area_coords.items():
        if key in lk:
            user_lat, user_lon = coord
            break

    nearest = find_nearest(user_lat, user_lon, 3)
    best = nearest[0]
    doc = find_doctor(best, specialty)
    blood = parse_blood(best["blood_stock"])
    ambs = parse_ambulances(best["ambulances"])

    clear()
    banner()
    print(r(f"  {C.G}{C.BOLD}━━━━━━━━━━━━━━━━  PATIENT RESULT  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━{C.RESET}"))
    print()
    print(r(f"  {C.W}{C.BOLD}Patient       :{C.RESET} {patient}"))
    print(r(f"  {C.W}{C.BOLD}Doctor Needed :{C.RESET} {specialty}"))
    print(r(f"  {C.W}{C.BOLD}Location      :{C.RESET} {location}"))
    print(r(f"  {C.W}{C.BOLD}Priority      :{C.RESET} {prio_color}{C.BOLD}{prio_label}{C.RESET}"))
    if blood_group:
        print(r(f"  {C.W}{C.BOLD}Blood Group   :{C.RESET} {blood_group}"))
    print()

    print(r(f"  {C.G}{C.BOLD}── NEAREST HOSPITAL ─────────────────────────────────────────{C.RESET}"))
    print(r(f"  {C.W}{C.BOLD}Name     :{C.RESET} {C.G}{best['name']}{C.RESET}"))
    print(r(f"  {C.W}{C.BOLD}Area     :{C.RESET} {best['area']}"))
    print(r(f"  {C.W}{C.BOLD}Contact  :{C.RESET} {best['contact']}"))
    print(r(f"  {C.W}{C.BOLD}Rating   :{C.RESET} {C.Y}{star_rating(best['rating'])}{C.RESET}"))
    print(r(f"  {C.W}{C.BOLD}Price    :{C.RESET} ₹{best['price_range']}"))
    print(r(f"  {C.W}{C.BOLD}Beds     :{C.RESET} {best['beds_available']} | ICU: {'Yes' if best['icu_available']=='Yes' else 'No'}"))
    print(r(f"  {C.W}{C.BOLD}Distance :{C.RESET} ~{best['_dist']:.1f} km"))
    print()

    if doc:
        print(r(f"  {C.CY}{C.BOLD}── RECOMMENDED DOCTOR ─────────────────────────────────────{C.RESET}"))
        print(r(f"  {C.W}{C.BOLD}Name       :{C.RESET} {C.CY}{doc['name']}{C.RESET}"))
        print(r(f"  {C.W}{C.BOLD}Specialty  :{C.RESET} {doc['specialty']}"))
        print(r(f"  {C.W}{C.BOLD}Experience :{C.RESET} {doc['experience']} years"))
        print(r(f"  {C.W}{C.BOLD}Fee        :{C.RESET} ₹{doc['fee']}"))
        print()

    if blood_group:
        units = blood.get(blood_group, 0)
        status = r(f"{C.G}{C.BOLD}Available ({units} units){C.RESET}") if units > 0 else r(f"{C.R}{C.BOLD}Not Available{C.RESET}")
        print(r(f"  {C.R}{C.BOLD}── BLOOD ─────────────────────────────────────────────────{C.RESET}"))
        print(r(f"  {C.W}{C.BOLD}{blood_group}    :{C.RESET} {status}"))
        print()

    if ambs:
        a = ambs[0]
        print(r(f"  {C.M}{C.BOLD}── AMBULANCE ──────────────────────────────────────────────{C.RESET}"))
        print(r(f"  {C.W}{C.BOLD}Vehicle :{C.RESET} {C.M}{a['vehicle']}{C.RESET}  Driver: {a['driver']}  📞 {a['phone']}"))
        print()

    if len(nearest) > 1:
        print(r(f"  {C.K}{C.BOLD}── OTHER NEARBY HOSPITALS ──────────────────────────────────{C.RESET}"))
        for h in nearest[1:]:
            print(r(f"  {C.K}• {h['name']} ({h['location']}) - {h['_dist']:.1f}km - {star_rating(h['rating'])}{C.RESET}"))
    print()
    pause()


# ============================================================
#  VIEW HOSPITALS (browsable with page navigation)
# ============================================================
def view_hospitals():
    hospitals = load_hospitals()
    idx = 0
    per_page = 5
    while True:
        clear()
        banner()
        print(r(f"  {C.CY}{C.BOLD}ALL HOSPITALS IN LUCKNOW({len(hospitals)} total){C.RESET}"))
        print(r(f"  {C.K}────────────{C.RESET}\n"))
        page_items = hospitals[idx:idx + per_page]
        for h in page_items:
            print(r(f"  {C.G}{C.BOLD}{h['hospital_id']}.{C.RESET} {C.W}{h['name']}{C.RESET} - {C.K}{h['location']}{C.RESET}"))
            print(r(f"     {C.K}Rating: {h['rating']}/5 | Price: ₹{h['price_range']} | Beds: {h['beds_available']} | ICU: {'Y' if h['icu_available']=='Yes' else 'N'}{C.RESET}"))
        print()
        print(r(f"  {C.K}({idx+1}-{min(idx+per_page, len(hospitals))} of {len(hospitals)})  [←→] page   [Enter] back{C.RESET}"))

        key = get_key()
        if key == "left":
            idx = max(0, idx - per_page)
        elif key == "right":
            idx = min(len(hospitals) - per_page, idx + per_page)
        elif key == "enter":
            break
        elif key == "esc":
            break


# ============================================================
#  DISEASE TREND GRAPH (live, only selected disease)
# ============================================================
def disease_graphs():
    if not HAS_MPL:
        clear()
        banner()
        print(r(f"  {C.R}matplotlib not installed. Run: pip install matplotlib{C.RESET}"))
        pause()
        return

    diseases = {}
    for h in load_hospitals():
        for d in parse_diseases(h["disease_cases"]):
            diseases[d["name"]] = diseases.get(d["name"], 0) + d["cases"]

    options = sorted(diseases.keys())
    idx = select_from_list("Select a Disease for Trend Graph", options,
                           header=f"Total distinct diseases: {len(options)}")
    if idx is None:
        return
    disease = options[idx]

    # Build a realistic 12-month trend seeded from the total cases
    seeded = random.Random(42)
    total = diseases[disease]
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    weights = {
        "fever": [1.2, 1.1, 1.1, 1.0, 1.2, 1.4, 1.6, 1.5, 1.3, 1.0, 0.9, 0.8],
        "dengue": [0.6, 0.5, 0.6, 0.8, 1.4, 1.8, 2.0, 1.9, 1.5, 1.0, 0.7, 0.6],
        "malaria": [0.7, 0.7, 0.8, 1.0, 1.4, 1.9, 2.1, 1.8, 1.4, 1.0, 0.8, 0.7],
        "pneumonia": [1.6, 1.5, 1.3, 1.0, 0.8, 0.6, 0.5, 0.5, 0.7, 1.0, 1.3, 1.6],
        "allergy": [1.0, 1.2, 1.5, 1.6, 1.3, 1.0, 0.9, 0.9, 1.0, 1.1, 1.0, 0.9],
    }
    base_w = 1.0
    for k, wl in weights.items():
        if k in disease.lower():
            base_w = sum(wl) / len(wl)
            break
    month_vals = []
    for i in range(12):
        seasonal = 0.75 + seeded.random() * 0.5
        month_vals.append(max(0, int(total / 12 * base_w * seasonal)))
    # normalize to exact total
    diff = total - sum(month_vals)
    month_vals[month_vals.index(max(month_vals))] += diff

    clear()
    banner()
    print(r(f"  {C.CY}{C.BOLD}Generating trend graph for: {C.W}{disease}{C.RESET}"))
    print(r(f"  {C.K}Total cases across Lucknow hospitals: {total}{C.RESET}\n"))

    plt.figure(figsize=(10, 6))
    bars = plt.bar(months, month_vals, color="#ef4444", edgecolor="white", linewidth=1.2)
    for b, v in zip(bars, month_vals):
        plt.text(b.get_x() + b.get_width() / 2, b.get_height() + 0.3,
                 str(v), ha="center", va="bottom", fontsize=8, fontweight="bold")
    peak = max(month_vals)
    plt.ylim(0, peak * 1.25)
    plt.title(f"Disease Trend - {disease} (Lucknow, 12 months)", fontsize=14, fontweight="bold", pad=15)
    plt.xlabel("Month")
    plt.ylabel("Number of Cases")
    plt.grid(axis="y", alpha=0.3)
    plt.tight_layout()

    plot_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             f"trend_{disease.replace(' ','_').replace('/','_')}.png")
    plt.savefig(plot_path, dpi=150)
    plt.close()

    print(r(f"  {C.G}✔ Graph saved: {os.path.basename(plot_path)}{C.RESET}"))
    print(r(f"  {C.DIM}Opening graph in viewer...{C.RESET}"))
    try:
        os.startfile(plot_path)
    except Exception:
        pass
    pause()


# ============================================================
#  STATISTICS
# ============================================================
def statistics():
    hospitals = load_hospitals()
    clear()
    banner()
    print(r(f"  {C.CY}{C.BOLD}━━━  SYSTEM STATISTICS (LUCKNOW)  ━━━━━━━━━━━━━━━━━━━━━━━━━━{C.RESET}"))
    print()
    print(r(f"  {C.W}{C.BOLD}Total Hospitals   :{C.RESET} {C.G}{len(hospitals)}{C.RESET}"))
    total_beds = sum(int(h["beds_available"]) for h in hospitals)
    total_docs = sum(len(parse_doctors(h["doctors"])) for h in hospitals)
    total_ambs = sum(len(parse_ambulances(h["ambulances"])) for h in hospitals)
    avg_rating = sum(float(h["rating"]) for h in hospitals) / len(hospitals)
    print(r(f"  {C.W}{C.BOLD}Total Doctors     :{C.RESET} {C.CY}{total_docs}{C.RESET}"))
    print(r(f"  {C.W}{C.BOLD}Total Beds        :{C.RESET} {C.B}{total_beds}{C.RESET}"))
    print(r(f"  {C.W}{C.BOLD}Total Ambulances  :{C.RESET} {C.M}{total_ambs}{C.RESET}"))
    print(r(f"  {C.W}{C.BOLD}Average Rating    :{C.RESET} {C.Y}{star_rating(round(avg_rating,1))}{C.RESET}"))

    blood = {}
    for h in hospitals:
        for bg, u in parse_blood(h["blood_stock"]).items():
            blood[bg] = blood.get(bg, 0) + u
    print()
    print(r(f"  {C.R}{C.BOLD}Blood Stock (all hospitals):{C.RESET}"))
    for bg in ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]:
        if bg in blood:
            color = C.G if blood[bg] >= 300 else C.Y if blood[bg] >= 150 else C.R
            print(r(f"    {color}{bg}: {blood[bg]} units{C.RESET}"))
    print()
    pause()


# ============================================================
#  CHAT PLACEHOLDER
# ============================================================
def chat():
    clear()
    banner()
    print(r(f"  {C.Y}{C.BOLD}━━━  CHAT WITH HOSPITAL  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{C.RESET}"))
    print()
    print(r(f"  {C.W}Connect directly with a Lucknow hospital to ask about"))
    print(r(f"  availability, book appointments, and get live updates on"))
    print(r(f"  your emergency request.{C.RESET}"))
    print()
    print(r(f"  {C.DIM}{'─' * 46}{C.RESET}"))
    print(r(f"  {C.Y}{C.BOLD}We will add it in next update{C.RESET}"))
    print(r(f"  {C.DIM}{'─' * 46}{C.RESET}"))
    print()
    pause()


# ============================================================
#  MAIN MENU (arrow-key)
# ============================================================
def main():
    if not os.path.exists(DATA_FILE):
        # Regenerate if missing
        print("Hospitals data file missing. Run generate_data.py first.")
        return

    menu = [
        ("New Emergency Request", "1"),
        ("View All Hospitals", "2"),
        ("Disease Trend Graph", "3"),
        ("System Statistics", "4"),
        ("Chat with Hospital", "5"),
        ("Exit", "0"),
    ]
    idx = 0
    while True:
        clear()
        banner()
        print(r(f"  {C.W}{C.BOLD}MAIN MENU{C.RESET}"))
        print(r(f"  {C.K}Use Up/Down arrows, Enter to select{C.RESET}"))
        print()
        for i, (label, num) in enumerate(menu):
            if i == idx:
                print(r(f"    {C.BG_C}{C.K}{C.BOLD}  ▶ {label.ljust(30)} {num}  {C.RESET}"))
            else:
                print(r(f"    {C.K}    {label.ljust(28)} {num}{C.RESET}"))
        print()

        key = get_key()
        if key == "up":
            idx = (idx - 1) % len(menu)
        elif key == "down":
            idx = (idx + 1) % len(menu)
        elif key == "enter":
            choice = menu[idx][1]
            if choice == "1":
                emergency_request()
            elif choice == "2":
                view_hospitals()
            elif choice == "3":
                disease_graphs()
            elif choice == "4":
                statistics()
            elif choice == "5":
                chat()
            elif choice == "0":
                clear()
                banner()
                print(r(f"  {C.G}{C.BOLD}Thank you for using LifeLink.{C.RESET}"))
                print(r(f"  {C.W}Stay safe. Help others.{C.RESET}"))
                print()
                break
        elif key == "esc":
            clear()
            break


if __name__ == "__main__":
    main()
