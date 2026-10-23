"""
PakAudio Retail Management System - Comprehensive Realistic Seed Data
Seeds authentic catalog items, categories, brands, customers, suppliers, and opening stock
for a car audio, home audio, and car accessories retail store in Pakistan.
"""
from backend.database import get_db
from backend.auth import AuthService
from backend.services.catalog_service import CatalogService
from backend.services.stock_service import StockService
from backend.services.customer_supplier_service import CustomerSupplierService

def seed_database(db=None):
    db = db or get_db()
    auth = AuthService(db)
    owner = auth.login("admin", "admin123")["user"]

    catalog = CatalogService(db)
    stock = StockService(db)
    cust_supp = CustomerSupplierService(db)

    # 1. Categories
    cat_names = [
        ("Android Tabs & Head Units", "Multimedia displays, touchscreens, and stereo receivers"),
        ("Amplifiers", "4-channel, 2-channel, and monoblock car amplifiers"),
        ("Speakers & Subwoofers", "Door speakers, component systems, 6x9 ovals, and subwoofers"),
        ("Wiring & Harnesses", "Power cables, RCA interconnects, fuse holders, and car harnesses"),
        ("LED Lighting & Fog Lamps", "Headlight LED bulbs, projector fog lamps, and daytime running lights"),
        ("Car Care & Accessories", "Polishes, waxes, tire gels, dashboard cleaners, and washers"),
        ("Fragrances & Air Fresheners", "Car perfumes, organic cans, and spray fragrances"),
        ("Installation & Labour", "Billable automotive installation, wiring, and tuning labour")
    ]
    categories = {}
    existing_cats = {c["name"].lower(): c for c in catalog.list_categories()}
    for name, desc in cat_names:
        if name.lower() in existing_cats:
            categories[name] = existing_cats[name.lower()]
        else:
            categories[name] = catalog.create_category(owner, name, desc)

    # 2. Brands
    brand_names = [
        "Pioneer", "Sony", "Kenwood", "JBL", "Infinity",
        "Novsight", "SoundX", "Turtle Wax", "Meguiar's",
        "Poppy Grace Mate", "Little Trees", "PakAudio OEM"
    ]
    brands = {}
    existing_brands = {b["name"].lower(): b for b in catalog.list_brands()}
    for b_name in brand_names:
        if b_name.lower() in existing_brands:
            brands[b_name] = existing_brands[b_name.lower()]
        else:
            brands[b_name] = catalog.create_brand(owner, b_name)

    # 3. Suppliers
    suppliers_data = [
        ("Al-Madina Sound Imports", "Haji Aslam", "0300-4411223", "Hall Road Electronics Market, Lahore"),
        ("Audio Tech Distribution", "Tariq Mahmood", "0321-8844556", "Montgomery Road Auto Market, Lahore"),
        ("Nova LED & Car Care Co.", "Sohail Akram", "0333-6677889", "Sultan Pura, Badami Bagh, Lahore")
    ]
    suppliers = {}
    existing_suppliers = {s["name"].lower(): s for s in cust_supp.list_suppliers()}
    for s_name, contact, phone, addr in suppliers_data:
        if s_name.lower() in existing_suppliers:
            suppliers[s_name] = existing_suppliers[s_name.lower()]
        else:
            suppliers[s_name] = cust_supp.create_supplier(owner, {
                "name": s_name, "contact_person": contact, "phone": phone, "address": addr
            })

    # 4. Customers
    cust_data = [
        ("Usman Rafiq", "0300-8451122", "Model Town, Lahore", "LEA-18-4921", "Toyota Corolla 2018", "RETAIL"),
        ("Shahid Autos Workshop", "0322-4112299", "Gulberg III, Lahore", "RI-16-8802", "Honda Civic 2016", "WHOLESALE"),
        ("Muhammad Bilal", "0345-7766554", "DHA Phase 5, Lahore", "ICT-21-3011", "Suzuki Swift 2021", "RETAIL")
    ]
    customers = {}
    existing_custs = {c["phone"]: c for c in cust_supp.list_customers()}
    for c_name, phone, addr, reg, model, c_type in cust_data:
        if phone in existing_custs:
            customers[c_name] = existing_custs[phone]
        else:
            customers[c_name] = cust_supp.create_customer(owner, {
                "name": c_name, "phone": phone, "address": addr,
                "car_registration": reg, "car_model": model, "customer_type": c_type
            })

    # 5. Products & Variants & Opening Stock
    # A. Android 9" Tab (Serialized)
    tab_prod = catalog.create_product(owner, {
        "name": "SoundX 9-inch IPS Android Multimedia Player",
        "category_id": categories["Android Tabs & Head Units"]["id"],
        "brand_id": brands["SoundX"]["id"],
        "description": "Full HD 1080P IPS Glass, Wireless Apple CarPlay & Android Auto, DSP Sound, GPS",
        "is_serialized": 1,
        "warranty_months": 12,
        "car_compatibility": "Toyota Corolla 2008-2022, Honda Civic 2006-2022, Suzuki Cultus/Swift, Universal 9-inch",
        "variants": [
            {
                "variant_name": "2GB RAM + 32GB ROM",
                "sku": "TAB-9IN-232",
                "barcode": "8960010010011",
                "cost_paisa": 1150000,          # PKR 11,500
                "retail_price_paisa": 1650000,   # PKR 16,500
                "wholesale_price_paisa": 1400000,# PKR 14,000
                "min_price_paisa": 1350000,      # PKR 13,500
                "reorder_level": 3
            },
            {
                "variant_name": "4GB RAM + 64GB ROM (4G SIM)",
                "sku": "TAB-9IN-464",
                "barcode": "8960010010028",
                "cost_paisa": 1650000,          # PKR 16,500
                "retail_price_paisa": 2350000,   # PKR 23,500
                "wholesale_price_paisa": 2050000,# PKR 20,500
                "min_price_paisa": 1950000,      # PKR 19,500
                "reorder_level": 2
            }
        ]
    })
    # Receive Tab Stock with Serials
    stock.receive_purchase(owner, {
        "supplier_id": suppliers["Al-Madina Sound Imports"]["id"],
        "invoice_number": "INV-ALM-801",
        "paid_amount_paisa": 5600000,
        "payment_method": "BANK_TRANSFER",
        "items": [
            {
                "variant_id": tab_prod["variants"][0]["id"],
                "quantity": 3,
                "unit_cost_paisa": 1150000,
                "serials": ["SX9-232-00101", "SX9-232-00102", "SX9-232-00103"]
            },
            {
                "variant_id": tab_prod["variants"][1]["id"],
                "quantity": 2,
                "unit_cost_paisa": 1650000,
                "serials": ["SX9-464-00201", "SX9-464-00202"]
            }
        ]
    })

    # B. Pioneer 4-Channel Amplifier (Serialized)
    amp_prod = catalog.create_product(owner, {
        "name": "Pioneer GM-A6704 4-Channel 1000W Bridgeable Amplifier",
        "category_id": categories["Amplifiers"]["id"],
        "brand_id": brands["Pioneer"]["id"],
        "description": "1000W Max Power, High Quality Sound Performance, Bass Boost Control",
        "is_serialized": 1,
        "warranty_months": 12,
        "car_compatibility": "Universal all vehicles",
        "variants": [
            {
                "variant_name": "Standard",
                "sku": "AMP-PIO-6704",
                "barcode": "8960010020010",
                "cost_paisa": 1850000,          # PKR 18,500
                "retail_price_paisa": 2500000,   # PKR 25,000
                "wholesale_price_paisa": 2200000,# PKR 22,000
                "min_price_paisa": 2100000,      # PKR 21,000
                "reorder_level": 2
            }
        ]
    })
    stock.receive_purchase(owner, {
        "supplier_id": suppliers["Audio Tech Distribution"]["id"],
        "invoice_number": "ATD-4412",
        "paid_amount_paisa": 3700000,
        "payment_method": "CASH",
        "items": [
            {
                "variant_id": amp_prod["variants"][0]["id"],
                "quantity": 2,
                "unit_cost_paisa": 1850000,
                "serials": ["PIO-6704-981", "PIO-6704-982"]
            }
        ]
    })

    # C. Pioneer 6x9 600W Coaxial Speakers
    spk_prod = catalog.create_product(owner, {
        "name": "Pioneer TS-A6977S 6x9-inch 4-Way 650W Speakers",
        "category_id": categories["Speakers & Subwoofers"]["id"],
        "brand_id": brands["Pioneer"]["id"],
        "description": "Deep punchy bass and crystal clear high frequencies",
        "is_serialized": 0,
        "warranty_months": 6,
        "car_compatibility": "Toyota Corolla, Honda Civic, Honda City, Suzuki Sedan rear trays",
        "variants": [
            {
                "variant_name": "Pair (Box of 2)",
                "sku": "SPK-PIO-6977",
                "barcode": "8960010030019",
                "cost_paisa": 520000,           # PKR 5,200
                "retail_price_paisa": 750000,    # PKR 7,500
                "wholesale_price_paisa": 620000, # PKR 6,200
                "min_price_paisa": 580000,       # PKR 5,800
                "reorder_level": 4
            }
        ]
    })
    stock.manual_adjustment(owner, spk_prod["variants"][0]["id"], 12, "COUNT_ADJUSTMENT", "Opening inventory count")

    # D. Novsight LED Headlights (Variants by bulb type: H4, H7, H11)
    led_prod = catalog.create_product(owner, {
        "name": "Novsight A500-N37 Super Bright 70W 6000K LED Bulbs",
        "category_id": categories["LED Lighting & Fog Lamps"]["id"],
        "brand_id": brands["Novsight"]["id"],
        "description": "15,000 Lumens per pair, Pure Xenon White 6000K, Aircraft Grade Aluminum with Fan",
        "is_serialized": 0,
        "warranty_months": 12,
        "car_compatibility": "H4: Corolla/City/Cultus/Mehran/Civic 2005. H11: Civic X, Hilux Revo, Prado. H7: German & Euro spec",
        "variants": [
            {
                "variant_name": "H4 High/Low Beam",
                "sku": "LED-NOV-H4",
                "barcode": "8960010040018",
                "cost_paisa": 320000,           # PKR 3,200
                "retail_price_paisa": 480000,    # PKR 4,800
                "wholesale_price_paisa": 400000, # PKR 4,000
                "min_price_paisa": 360000,       # PKR 3,600
                "reorder_level": 5
            },
            {
                "variant_name": "H11 Low Beam / Fog",
                "sku": "LED-NOV-H11",
                "barcode": "8960010040025",
                "cost_paisa": 320000,           # PKR 3,200
                "retail_price_paisa": 480000,    # PKR 4,800
                "wholesale_price_paisa": 400000, # PKR 4,000
                "min_price_paisa": 360000,       # PKR 3,600
                "reorder_level": 5
            },
            {
                "variant_name": "H7 Single Beam",
                "sku": "LED-NOV-H7",
                "barcode": "8960010040032",
                "cost_paisa": 320000,           # PKR 3,200
                "retail_price_paisa": 480000,    # PKR 4,800
                "wholesale_price_paisa": 400000, # PKR 4,000
                "min_price_paisa": 360000,       # PKR 3,600
                "reorder_level": 3
            }
        ]
    })
    for v in led_prod["variants"]:
        stock.manual_adjustment(owner, v["id"], 8, "COUNT_ADJUSTMENT", "Opening balance")

    # E. 4-Gauge & 8-Gauge Wiring Kits
    wire_prod = catalog.create_product(owner, {
        "name": "SoundX Complete Pure Copper Amplifier Wiring Kit",
        "category_id": categories["Wiring & Harnesses"]["id"],
        "brand_id": brands["SoundX"]["id"],
        "description": "Includes 5m power cable, 1m ground cable, 5m RCA cable, remote wire, ANL fuse holder",
        "is_serialized": 0,
        "warranty_months": 0,
        "car_compatibility": "Universal car audio amplifiers and active subwoofers",
        "variants": [
            {
                "variant_name": "4-Gauge Heavy Duty",
                "sku": "WIR-SX-4GA",
                "barcode": "8960010050017",
                "cost_paisa": 220000,           # PKR 2,200
                "retail_price_paisa": 350000,    # PKR 3,500
                "wholesale_price_paisa": 280000, # PKR 2,800
                "min_price_paisa": 260000,       # PKR 2,600
                "reorder_level": 4
            },
            {
                "variant_name": "8-Gauge Standard",
                "sku": "WIR-SX-8GA",
                "barcode": "8960010050024",
                "cost_paisa": 140000,           # PKR 1,400
                "retail_price_paisa": 220000,    # PKR 2,200
                "wholesale_price_paisa": 180000, # PKR 1,800
                "min_price_paisa": 160000,       # PKR 1,600
                "reorder_level": 4
            }
        ]
    })
    for v in wire_prod["variants"]:
        stock.manual_adjustment(owner, v["id"], 10, "COUNT_ADJUSTMENT", "Opening balance")

    # F. Car Care: Meguiar's Compound, Turtle Wax Tire Gel, Little Trees
    care_prod = catalog.create_product(owner, {
        "name": "Turtle Wax Wet 'N Black Ultra Wet Tire Gel 500ml",
        "category_id": categories["Car Care & Accessories"]["id"],
        "brand_id": brands["Turtle Wax"]["id"],
        "description": "High gloss wet shine tire dressing with UV protection",
        "is_serialized": 0,
        "warranty_months": 0,
        "car_compatibility": "All vehicle tires",
        "variants": [
            {
                "variant_name": "500ml Bottle",
                "sku": "CARE-TW-TIRE",
                "barcode": "8960010060016",
                "cost_paisa": 95000,            # PKR 950
                "retail_price_paisa": 150000,    # PKR 1,500
                "wholesale_price_paisa": 120000, # PKR 1,200
                "min_price_paisa": 110000,       # PKR 1,100
                "reorder_level": 6
            }
        ]
    })
    stock.manual_adjustment(owner, care_prod["variants"][0]["id"], 15, "COUNT_ADJUSTMENT", "Opening balance")

    frag_prod = catalog.create_product(owner, {
        "name": "Little Trees Air Freshener Hanging Card",
        "category_id": categories["Fragrances & Air Fresheners"]["id"],
        "brand_id": brands["Little Trees"]["id"],
        "description": "World's most famous car fragrance tree",
        "is_serialized": 0,
        "warranty_months": 0,
        "car_compatibility": "All cars",
        "variants": [
            {
                "variant_name": "Black Ice Scent",
                "sku": "FRAG-LT-ICE",
                "barcode": "8960010070015",
                "cost_paisa": 18000,            # PKR 180
                "retail_price_paisa": 35000,     # PKR 350
                "wholesale_price_paisa": 25000,  # PKR 250
                "min_price_paisa": 22000,        # PKR 220
                "reorder_level": 10
            },
            {
                "variant_name": "Vanilla Pride Scent",
                "sku": "FRAG-LT-VAN",
                "barcode": "8960010070022",
                "cost_paisa": 18000,            # PKR 180
                "retail_price_paisa": 35000,     # PKR 350
                "wholesale_price_paisa": 25000,  # PKR 250
                "min_price_paisa": 22000,        # PKR 220
                "reorder_level": 10
            }
        ]
    })
    for v in frag_prod["variants"]:
        stock.manual_adjustment(owner, v["id"], 25, "COUNT_ADJUSTMENT", "Opening balance")

    # G. Services (is_service = 1)
    services = [
        ("Android Tab & Camera Installation Labour", "Professional fitment, reverse camera wiring and dashboard integration", 150000), # PKR 1,500
        ("4-Channel Amp & Woofer Wiring Labour", "Battery to boot power line, ground, RCA routing and tuning", 300000),            # PKR 3,000
        ("Door Speakers Pair Fitment Labour", "Door trim removal, wooden spacer fitment and speaker connection", 100000),          # PKR 1,000
        ("Fog Lamp & Relay Wiring Labour", "Bumper removal, switch wiring, relay connection and beam alignment", 120000)          # PKR 1,200
    ]
    for s_title, s_desc, labour_paisa in services:
        catalog.create_product(owner, {
            "name": s_title,
            "category_id": categories["Installation & Labour"]["id"],
            "brand_id": brands["PakAudio OEM"]["id"],
            "description": s_desc,
            "is_service": 1,
            "warranty_months": 3,
            "variants": [
                {
                    "variant_name": "Standard Service",
                    "sku": f"SRV-{s_title[:4].upper()}-{labour_paisa // 100}",
                    "barcode": "",
                    "cost_paisa": 0,
                    "retail_price_paisa": labour_paisa,
                    "wholesale_price_paisa": labour_paisa,
                    "min_price_paisa": labour_paisa - 20000,
                    "reorder_level": 0
                }
            ]
        })

    # H. Fascia Frame for Bundle
    frame_prod = catalog.create_product(owner, {
        "name": "Corolla 2014-2021 9-inch Dashboard Fascia Frame",
        "category_id": categories["Android Tabs & Head Units"]["id"],
        "brand_id": brands["PakAudio OEM"]["id"],
        "description": "OEM textured matte black frame matching Corolla interior",
        "is_serialized": 0,
        "variants": [{
            "variant_name": "Corolla 2014-2021",
            "sku": "FAS-COR-1421",
            "barcode": "8960010080014",
            "cost_paisa": 80000,
            "retail_price_paisa": 150000,
            "wholesale_price_paisa": 110000,
            "min_price_paisa": 100000,
            "reorder_level": 2
        }]
    })
    frame_var_id = frame_prod["variants"][0]["id"]
    stock.manual_adjustment(owner, frame_var_id, 5, "COUNT_ADJUSTMENT", "Opening frame stock")

    # Plug & play harness
    harness_prod = catalog.create_product(owner, {
        "name": "Toyota Plug & Play Radio Canbus Wiring Harness",
        "category_id": categories["Wiring & Harnesses"]["id"],
        "brand_id": brands["PakAudio OEM"]["id"],
        "description": "Direct plug into factory wiring without cutting",
        "is_serialized": 0,
        "variants": [{
            "variant_name": "Toyota 16-pin OEM",
            "sku": "HAR-TOY-16P",
            "barcode": "8960010090013",
            "cost_paisa": 40000,
            "retail_price_paisa": 80000,
            "wholesale_price_paisa": 60000,
            "min_price_paisa": 50000,
            "reorder_level": 3
        }]
    })
    harness_var_id = harness_prod["variants"][0]["id"]
    stock.manual_adjustment(owner, harness_var_id, 10, "COUNT_ADJUSTMENT", "Opening harness stock")

    # I. Bundle Product: Head Unit + Fascia + Harness sold at bundle price
    tab_232_var_id = tab_prod["variants"][0]["id"]
    catalog.create_product(owner, {
        "name": "Corolla Complete 9-inch Android Bundle Kit",
        "category_id": categories["Android Tabs & Head Units"]["id"],
        "brand_id": brands["SoundX"]["id"],
        "description": "Includes 9-inch Android IPS Tab, Corolla OEM Fascia Frame, and Toyota Plug & Play Harness",
        "is_bundle": 1,
        "warranty_months": 12,
        "car_compatibility": "Toyota Corolla 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021",
        "variants": [
            {
                "variant_name": "Corolla 2014-2021 Complete Kit",
                "sku": "BND-COR-9IN-KIT",
                "barcode": "8960010990010",
                "cost_paisa": 1270000,          # PKR 12,700
                "retail_price_paisa": 1780000,   # PKR 17,800
                "wholesale_price_paisa": 1550000,
                "min_price_paisa": 1450000,
                "reorder_level": 2,
                "bundle_items": [
                    {"component_variant_id": tab_232_var_id, "quantity": 1},
                    {"component_variant_id": frame_var_id, "quantity": 1},
                    {"component_variant_id": harness_var_id, "quantity": 1}
                ]
            }
        ]
    })

    print("Realistic retail store data seeded successfully.")

if __name__ == "__main__":
    seed_database()
