import csv
import random
import os

random.seed(42)

HOSPITALS = [
    # (name, area, lat, lon, est_specialties, beds_range, fee_range, rating)
    ("Max Super Speciality Hospital", "Viraj Khand, Gomti Nagar", 26.8590, 81.0140, 65, (250, 500), (500, 1200), 4.5),
    ("Cloudnine Hospital", "Gomtinagar", 26.8624, 81.0203, 8, (60, 120), (800, 1000), 3.5),
    ("Apollomedics Super Speciality Hospital", "LDA Colony, Kanpur Road", 26.7982, 80.9015, 44, (330, 500), (700, 5000), 4.0),
    ("Charak Hospital", "Dubagga", 26.8840, 80.8660, 33, (100, 200), (250, 800), 4.5),
    ("Chandan Hospital", "Gomti Nagar", 26.8640, 81.0000, 40, (300, 350), (400, 2000), 4.0),
    ("Shekhar Hospital", "Shakti Khand III, Indira Nagar", 26.8780, 80.9860, 36, (100, 150), (300, 1200), 4.3),
    ("Regency Hospital", "Shakti Khand II, Indira Nagar", 26.8760, 80.9880, 30, (150, 250), (400, 1500), 4.2),
    ("Medanta Hospital", "Sector C, Gomti Nagar", 26.8700, 81.0100, 80, (300, 1000), (600, 3000), 4.6),
    ("Sanjay Gandhi Postgraduate Institute (SGPGIMS)", "Raebareli Road", 26.7500, 81.0100, 50, (400, 600), (100, 500), 4.7),
    ("King George's Medical University (KGMU)", "Chowk, Hazratganj", 26.8660, 80.9230, 40, (800, 1200), (50, 300), 4.2),
    ("Dr. Ram Manohar Lohia Institute of Medical Sciences (RMLIMS)", "Vibhuti Khand, Gomti Nagar", 26.8300, 81.0500, 30, (300, 500), (100, 400), 4.4),
    ("Nirvan Hospital", "Khurram Nagar / Ismailganj", 26.8490, 80.9510, 4, (40, 80), (800, 1200), 4.5),
    ("Rajendra Nagar Hospital", "Rajendranagar", 26.8600, 80.9400, 3, (30, 60), (1200, 1400), 4.5),
    ("Jwala Hospital", "Indira Nagar", 26.8840, 80.9830, 3, (50, 100), (500, 800), 4.5),
    ("Neera Hospital", "Mahanagar", 26.8730, 80.9600, 3, (40, 80), (300, 600), 3.5),
    ("Garg Ophthalmic Centre", "Nirala Nagar", 26.8680, 80.9750, 1, (20, 40), (1500, 2000), 3.5),
    ("Radius Joint Surgery Hospital", "Gomtinagar", 26.8650, 81.0150, 1, (30, 60), (500, 800), 4.5),
    ("Dr. K.N.S. Memorial Hospital", "Krishna Nagar", 26.8700, 80.9520, 15, (80, 150), (300, 1000), 4.0),
    ("Sanjivini Super Speciality Hospital", "Indira Nagar", 26.8820, 80.9840, 20, (100, 180), (400, 1500), 4.1),
    ("Nova Hospital", "Aliganj", 26.9000, 80.9300, 25, (150, 250), (500, 2000), 4.2),
    ("Globe Healthcare & Diagnostics", "Hazratganj", 26.8520, 80.9443, 10, (50, 100), (300, 800), 3.9),
    ("Lucknow Health City Hospital", "Transport Nagar", 26.8800, 80.9050, 20, (100, 200), (400, 1200), 3.8),
    ("Shalby Multi-Speciality Hospital", "Ayodhya Vihar", 26.8950, 81.0300, 10, (50, 100), (500, 1500), 4.3),
    ("Indira IVF Centre", "Wazirganj, Hazratganj", 26.8560, 80.9410, 2, (20, 40), (800, 2000), 4.4),
    ("Birla Fertility & IVF Centre", "Hazratganj", 26.8530, 80.9450, 2, (20, 40), (900, 2200), 4.5),
    ("Mayo Hospital", "Hazratganj", 26.8520, 80.9430, 25, (250, 400), (100, 400), 4.1),
    ("Balrampur Hospital", "Chowk", 26.8650, 80.9200, 30, (500, 800), (50, 200), 4.0),
    ("Vivekanand Polyclinic", "Gole Market, Hazratganj", 26.8550, 80.9460, 15, (60, 120), (200, 800), 4.0),
    ("Era's Lucknow Medical College & Hospital", "Sarfarazganj, Hardoi Road", 26.9100, 80.9200, 35, (300, 500), (200, 800), 4.1),
    ("Sahara Hospital", "Viraj Khand, Gomti Nagar", 26.8580, 81.0120, 30, (378, 554), (400, 1500), 4.3),
    ("Divine Heart Multispecialty Hospital", "Gomtinagar", 26.8650, 81.0180, 15, (60, 120), (300, 1000), 4.0),
    ("Zenith Super Specialty Hospital", "Vishal Khand, Gomti Nagar", 26.8570, 81.0160, 12, (50, 100), (400, 1200), 4.1),
    ("Life Line Hospital", "Indira Nagar", 26.8830, 80.9850, 8, (40, 80), (300, 1000), 3.8),
    ("City Hospital", "Alambagh", 26.8350, 80.9050, 10, (60, 120), (200, 800), 3.9),
    ("Lucknow Heart Institute", "Indira Nagar", 26.8800, 80.9900, 6, (40, 80), (500, 1500), 4.4),
    ("Sai Hospital", "Alambagh", 26.8330, 80.9070, 6, (30, 60), (200, 600), 3.7),
    ("Anand Hospital", "Chowk", 26.8660, 80.9220, 8, (30, 70), (150, 500), 3.8),
    ("Gyan Hospital", "Rajajipuram", 26.8700, 80.8800, 10, (50, 100), (200, 700), 4.0),
    ("Krishna Hospital", "Bakshi Ka Talab", 26.9400, 80.8600, 8, (40, 80), (150, 500), 3.9),
    ("Mother Teresa Hospital", "Mahanagar", 26.8740, 80.9610, 10, (50, 100), (200, 700), 4.1),
    ("Saraswati Hospital", "PGI Road, Bandaria Bagh", 26.7560, 81.0080, 7, (40, 80), (200, 600), 3.8),
    ("Navjeevan Hospital", "Devraha, Alambagh", 26.8360, 80.9080, 8, (40, 90), (200, 650), 4.0),
    ("Aastha Hospital", "Aminabad", 26.8580, 80.9300, 6, (30, 60), (200, 700), 4.2),
    ("Metro Hospital & Heart Institute", "Indira Nagar", 26.8810, 80.9870, 18, (100, 180), (400, 1500), 4.2),
    ("Surya Hospital", "Jankipuram", 26.9000, 80.9000, 12, (60, 120), (250, 900), 4.0),
    ("Apolio Nursing Home", "Lucknow", 26.8480, 80.9550, 4, (20, 40), (200, 600), 3.6),
    ("Shanti Hospital", "Hazratganj", 26.8530, 80.9440, 6, (30, 60), (250, 800), 3.9),
    ("Bai-Bei (BSM) Hospital", "Aminabad", 26.8590, 80.9310, 8, (40, 80), (150, 500), 3.6),
    ("Manas Hospital", "Aliganj", 26.9010, 80.9310, 10, (50, 100), (200, 700), 3.8),
    ("Navin Hospital", "Rajajipuram", 26.8710, 80.8810, 6, (30, 60), (200, 600), 3.7),
    ("Eye Care & Laser Centre", "Hazratganj", 26.8525, 80.9445, 2, (10, 30), (1000, 2500), 4.3),
    ("Raj Hospital", "Jankipuram", 26.8990, 80.8990, 8, (40, 80), (200, 700), 3.9),
    ("Sanjay Hospital", "Chowk", 26.8640, 80.9210, 5, (25, 50), (150, 500), 3.7),
    ("Gandhi Hospital", "Alambagh", 26.8340, 80.9060, 6, (30, 60), (200, 600), 3.8),
    ("Uttam Hospital", "Mahanagar", 26.8720, 80.9590, 7, (35, 70), (200, 650), 3.9),
    ("Life Care Hospital", "Hazratganj", 26.8510, 80.9430, 9, (45, 90), (250, 800), 4.0),
    ("Sainik Hospital", "Aminabad", 26.8570, 80.9290, 5, (25, 50), (200, 600), 3.6),
    ("Aditya Hospital", "Vikas Nagar", 26.8950, 80.9500, 6, (30, 60), (200, 700), 3.8),
    ("Triloki Nath Hospital", "Mahanagar", 26.8750, 80.9620, 8, (40, 80), (250, 800), 4.0),
    ("Lal Bahadur Shastri Hospital", "Keshav Nagar", 26.8900, 80.9400, 7, (35, 70), (150, 500), 3.6),
    ("Jain Hospital", "Rajajipuram", 26.8730, 80.8830, 5, (25, 50), (200, 600), 3.7),
    ("Saroj Hospital", "Lucknow", 26.8500, 80.9500, 6, (30, 60), (200, 650), 3.8),
    ("Health Care Hospital", "Gomtinagar", 26.8630, 81.0190, 8, (40, 80), (300, 900), 4.0),
    ("Ram Krishna Hospital", "Hardoi Road", 26.9150, 80.9250, 7, (35, 70), (200, 700), 3.9),
    ("Kamla Hospital", "Alambagh", 26.8355, 80.9065, 5, (25, 50), (200, 600), 3.6),
    ("Shivam Hospital", "Indira Nagar", 26.8825, 80.9845, 8, (40, 80), (250, 800), 4.0),
    ("Lifeline Multispeciality Hospital", "Telibagh", 26.8900, 80.9400, 10, (50, 100), (250, 900), 4.1),
    ("Balaji Hospital", "Naka Hindola", 26.8550, 80.9350, 6, (30, 60), (200, 650), 3.7),
    ("Sudhir Hospital", "Lucknow", 26.8490, 80.9530, 5, (25, 50), (200, 600), 3.6),
    ("Nityanand Hospital", "Lucknow", 26.8550, 80.9380, 6, (30, 60), (200, 700), 3.8),
    ("Siddhartha Hospital", "Aliganj", 26.9020, 80.9320, 7, (35, 70), (250, 800), 3.9),
    ("Bhagwan Hospital", "Mahanagar", 26.8735, 80.9615, 6, (30, 60), (200, 650), 3.7),
    ("Prakash Hospital", "Chowk", 26.8655, 80.9215, 5, (25, 50), (150, 500), 3.6),
    ("Om Hospital", "Jankipuram", 26.8980, 80.8980, 6, (30, 60), (200, 600), 3.8),
    ("Versailles Hospital", "Hazratganj", 26.8525, 80.9448, 12, (50, 120), (500, 2000), 4.3),
    ("South City Hospital", "Lucknow", 26.8450, 80.9560, 7, (35, 70), (250, 800), 3.9),
    ("Alina Hospital", "Indira Nagar", 26.8805, 80.9865, 5, (25, 50), (250, 800), 4.0),
    ("Rajwinder Hospital", "Lucknow", 26.8540, 80.9500, 6, (30, 60), (200, 700), 3.8),
    ("Mohak Hospital", "Gomtinagar", 26.8645, 81.0170, 8, (40, 80), (300, 1000), 4.1),
    ("Kalpana Hospital", "Alambagh", 26.8345, 80.9068, 5, (25, 50), (200, 600), 3.7),
    ("Santoshi Hospital", "Lucknow", 26.8500, 80.9520, 5, (25, 50), (200, 650), 3.7),
]

DOCTOR_FIRST = ["Rajesh", "Suresh", "Amit", "Priya", "Sunita", "Vikram", "Meera", "Rahul",
                "Arjun", "Kavita", "Sandeep", "Sanjay", "Garima", "Anil", "Neha", "Pooja",
                "Rakesh", "Anita", "Manoj", "Sunil", "Deepak", "Ritu", "Alok", "Nisha",
                "Rohit", "Anju", "Varun", "Sneha", "Ajay", "Pankaj", "Divya", "Aman"]

DOCTOR_LAST = ["Sharma", "Verma", "Gupta", "Singh", "Malhotra", "Yadav", "Mishra", "Srivastava",
               "Tiwari", "Pandey", "Agarwal", "Trivedi", "Dubey", "Saxena", "Pathak", "Bajpai",
               "Rastogi", "Nigam", "Chaturvedi", "Awasthi", "Shukla", "Tripathi", "Saksena",
               "Dwivedi", "Bhargava", "Kaushik", "Mehrotra", "Sinha"]

SPECIALTIES = ["Cardiology", "General", "Orthopedics", "Neurology", "Gynecology", "Pediatrics",
               "Dermatology", "ENT", "Pulmonology", "Gastroenterology", "Ophthalmology",
               "Psychiatry", "Nephrology", "Urology", "Endocrinology", "General Surgery",
               "Infertility"]

DISEASES = [
    ("Fever", 30), ("Pneumonia", 15), ("Dengue", 12), ("Malaria", 10), ("Accident/Trauma", 18),
    ("Heart Attack", 8), ("Diabetes", 25), ("Asthma", 15), ("Migraine", 12), ("Allergy", 20),
    ("Skin Infection", 12), ("Chicken Pox", 6), ("Typhoid", 9), ("Tuberculosis", 7),
    ("Jaundice", 5), ("Hypertension", 22), ("Fracture", 10), ("Arthritis", 14)
]

# Dr. suffixes per known appointments from practo for the "real" ones
KNOWN_DOCTORS = {
    "Nirvan Hospital": [
        ("Dr.H.K. Agarwal", "Psychiatry", 41, 800),
        ("Dr.Deeptanshu Hanu Agarwal", "Infertility", 13, 900),
        ("Dr.Jesna Manoj", "Psychiatry", 28, 700),
        ("Dr.Sumitabh", "Psychiatry", 12, 600),
    ],
    "Rajendra Nagar Hospital": [
        ("Dr.Sunita Chandra", "Infertility", 38, 1400),
    ],
    "Jwala Hospital": [
        ("Dr.Rama Srivastava", "General Surgery", 43, 600),
        ("Dr.Manoj Kumar", "General", 37, 500),
    ],
    "Neera Hospital": [
        ("Dr.Sandeep Gupta", "General", 28, 400),
        ("Dr.Sanjay Rohatgi", "Pediatrics", 42, 450),
        ("Dr.Garima Gupta", "Gynecology", 30, 450),
    ],
    "Max Super Speciality Hospital": [
        ("Dr.Hriday Nath Tripathi", "General", 49, 900),
        ("Dr.Swadesh Kumar Singh", "General", 27, 800),
        ("Dr.A K Awasthi", "General", 36, 800),
        ("Dr.Deepali Mohanty", "General", 29, 800),
        ("Dr.Sushil Kumar Gupta", "General", 42, 850),
        ("Dr.Sunil Verma", "General", 25, 750),
        ("Dr.Samir Mishra", "General", 20, 700),
        ("Dr.Niraj Agarwal", "General", 14, 600),
        ("Dr.Bhumika Bansal", "Gynecology", 17, 900),
        ("Dr.Alok Srivastava", "Pulmonology", 22, 1000),
    ],
    "Cloudnine Hospital": [
        ("Dr.Ruchi Garg", "Gynecology", 22, 1000),
        ("Dr.Anjana Jain", "Gynecology", 25, 1100),
        ("Dr.Tanima Shukla", "Gynecology", 13, 900),
        ("Dr.Fareha Khatoon", "Gynecology", 17, 950),
        ("Dr.Richa Gangwar", "Gynecology", 21, 1000),
        ("Dr.Arun Gautam", "Pediatrics", 13, 900),
        ("Dr.Sadia Mansoor", "Gynecology", 14, 950),
        ("Dr.Shreshtha Jain", "Radiology", 10, 800),
    ],
    "Garg Ophthalmic Centre": [
        ("Dr.Vinay Kumar Garg", "Ophthalmology", 45, 2000),
        ("Dr.Mamta Agarwal", "Ophthalmology", 29, 1500),
        ("Dr.Tushar Kumar", "Ophthalmology", 12, 1500),
    ],
    "Radius Joint Surgery Hospital": [
        ("Dr.Sanjai K Srivastava", "Orthopedics", 33, 700),
        ("Dr.Praveen Kumar", "Orthopedics", 33, 700),
    ],
    "Charak Hospital": [
        ("Dr.Zeeshan Ahmad", "ENT", 15, 500),
        ("Dr.Anuj Yadav", "General", 19, 400),
        ("Dr.Abhijat Mishra", "General", 18, 400),
        ("Dr.Sumit Saraswat", "General", 14, 350),
        ("Dr.Komal Agarwal", "General", 9, 300),
        ("Dr.Mohd Tauseef Khan", "General", 11, 320),
    ],
    "Apollomedics Super Speciality Hospital": [
        ("Dr.Gopal Poduval", "Neurology", 46, 1200),
        ("Dr.Archana Kumar", "Pediatrics", 52, 900),
    ],
}

AMBO_NUM = 1000


def gen_doctors(name, est):
    if name in KNOWN_DOCTORS:
        return KNOWN_DOCTORS[name]
    n = max(3, min(est, 12))
    docs = []
    used = set()
    for _ in range(n):
        first = random.choice(DOCTOR_FIRST)
        last = random.choice(DOCTOR_LAST)
        full = f"Dr.{first} {last}"
        while full in used:
            first = random.choice(DOCTOR_FIRST)
            last = random.choice(DOCTOR_LAST)
            full = f"Dr.{first} {last}"
        used.add(full)
        spec = random.choice(SPECIALTIES)
        exp = random.randint(5, 45)
        fee = random.choice([250, 300, 400, 500, 600, 800, 1000])
        docs.append((full, spec, exp, fee))
    return docs


def gen_blood():
    groups = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]
    parts = []
    for g in groups:
        units = max(0, int(random.gauss(12, 6)))
        parts.append(f"{g}:{units}")
    return "|".join(parts)


def gen_ambulances():
    global AMBO_NUM
    vehicles = []
    for _ in range(random.randint(2, 4)):
        AMBO_NUM += 1
        veh = f"UP32-AB-{AMBO_NUM}"
        driver = f"{random.choice(DOCTOR_FIRST)} {random.choice(DOCTOR_LAST)}"
        phone = f"98{random.randint(10000000, 99999999)}"
        vehicles.append(f"{veh}:{driver}:{phone}")
    return "|".join(vehicles)


def gen_diseases():
    chosen = random.sample(DISEASES, random.randint(5, 8))
    parts = [f"{name}:{random.randint(3, 40)}" for name, _ in chosen]
    return ",".join(parts)


def build():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(base_dir, "data")
    os.makedirs(data_dir, exist_ok=True)
    path = os.path.join(data_dir, "hospitals.csv")

    fieldnames = ["hospital_id", "name", "location", "area", "contact", "lat", "lon",
                  "rating", "price_range", "doctors", "blood_stock", "ambulances",
                  "icu_available", "beds_available", "emergency_services", "disease_cases"]

    rows = []
    for i, (name, area, lat, lon, est, beds_r, fee_r, rating) in enumerate(HOSPITALS):
        docs = gen_doctors(name, est)
        doc_str = "|".join(f"{d[0]}:{d[1]}:{d[2]}:{d[3]}" for d in docs)
        bed_min, bed_max = beds_r
        fee_min, fee_max = fee_r
        row = {
            "hospital_id": str(i + 1),
            "name": name,
            "location": area.split(",")[0].strip(),
            "area": area.replace(",", "-"),
            "contact": f"0522-{random.randint(2000000, 2999999)}",
            "lat": f"{lat:.4f}",
            "lon": f"{lon:.4f}",
            "rating": f"{rating}",
            "price_range": f"{fee_min}-{fee_max}",
            "doctors": doc_str,
            "blood_stock": gen_blood(),
            "ambulances": gen_ambulances(),
            "icu_available": random.choice(["Yes", "Yes", "Yes", "No"]),
            "beds_available": str(random.randint(bed_min, bed_max)),
            "emergency_services": "Yes",
            "disease_cases": gen_diseases(),
        }
        rows.append(row)

    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Generated {len(rows)} hospitals -> {path}")


if __name__ == "__main__":
    build()
