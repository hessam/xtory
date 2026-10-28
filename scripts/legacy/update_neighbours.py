import json

# Define the neighbor polygons shaped realistically to mirror actual geographic lines
# and correctly translate the Farsi display titles.

# Shared borders with the core regions
J_Az_Cau_Casp = [48.5, 39.5]
J_Cau_Casp_North = [49.5, 40.0]

neighbours = [
    {
        "id": "anatolia",
        "name": "Anatolia (Asia Minor)",
        "nameFa": "آناتولی (آسیای صغیر)",
        "coordinates": [
            [[41.5, 40.0], [38.0, 41.0], [34.0, 42.0], [29.0, 41.0], [26.0, 39.0], [27.0, 36.5], [30.0, 36.0], [33.0, 36.0], [36.0, 36.0], [41.5, 36.5], [44.0, 36.5], [44.0, 39.5], [41.5, 40.0]]
        ]
    },
    {
        "id": "levant",
        "name": "Levant & Syria",
        "nameFa": "شام و سوریه",
        "coordinates": [
            [[36.0, 36.0], [35.5, 34.0], [34.5, 31.0], [38.0, 30.0], [43.0, 31.0], [41.5, 34.0], [41.5, 36.5], [36.0, 36.0]]
        ]
    },
    {
        "id": "arabia",
        "name": "Syrian Desert & Arabia",
        "nameFa": "صحرای سوریه و عربستان",
        "coordinates": [
            [[34.5, 31.0], [34.0, 27.0], [37.0, 20.0], [43.0, 12.0], [50.0, 14.0], [55.0, 16.0], [58.5, 22.5], [54.0, 26.0], [51.0, 27.5], [50.0, 30.0], [48.0, 30.0], [46.0, 30.0], [43.0, 31.0], [38.0, 30.0], [34.5, 31.0]]
        ]
    },
    {
        "id": "eurasian_steppes",
        "name": "The Eurasian Steppes",
        "nameFa": "استپ‌های اوراسیا",
        "coordinates": [
            [[41.5, 40.0], [38.0, 44.0], [35.0, 46.0], [40.0, 50.0], [50.0, 52.0], [65.0, 52.0], [80.0, 50.0], [80.0, 45.0], [75.0, 42.0], [69.0, 42.0], [62.0, 42.0], [62.0, 43.5], [58.0, 43.5], [58.0, 40.0], [53.0, 40.0], [49.5, 40.0], [48.5, 42.5], [43.5, 43.5], [41.5, 40.0]]
        ]
    },
    {
        "id": "ferghana",
        "name": "Ferghana Valley & Kangju",
        "nameFa": "دره فرغانه و کانگجو",
        "coordinates": [
            [[69.0, 42.0], [75.0, 42.0], [75.0, 39.0], [70.5, 39.0], [69.0, 42.0]]
        ]
    },
    {
        "id": "tarim",
        "name": "Tarim Basin (Xinjiang)",
        "nameFa": "حوضه تاریم (سین‌کیانگ)",
        "coordinates": [
            [[75.0, 42.0], [80.0, 45.0], [88.0, 42.0], [90.0, 39.0], [85.0, 36.0], [80.0, 36.0], [75.0, 36.0], [70.5, 36.0], [70.5, 39.0], [75.0, 39.0], [75.0, 42.0]]
        ]
    },
    {
        "id": "pamirs",
        "name": "Pamir Mountains",
        "nameFa": "کوه‌های پامیر",
        "coordinates": [
            [[67.0, 38.0], [70.5, 39.0], [70.5, 36.0], [68.5, 34.0], [67.0, 38.0]]
        ]
    },
    {
        "id": "hindu_kush",
        "name": "Hindu Kush Mountains",
        "nameFa": "کوه‌های هندوکش",
        "coordinates": [
            [[68.5, 34.0], [70.5, 36.0], [75.0, 36.0], [75.0, 34.0], [69.5, 32.0], [68.5, 34.0]]
        ]
    },
    {
        "id": "indus_valley",
        "name": "Indus Valley (Hind)",
        "nameFa": "دره سند (هند)",
        "coordinates": [
            [[67.0, 30.5], [69.5, 32.0], [75.0, 34.0], [76.0, 30.0], [74.0, 25.0], [70.0, 23.0], [68.0, 24.0], [67.0, 30.5]]
        ]
    }
]

features = []
for n in neighbours:
    features.append({
        "type": "Feature",
        "properties": {
            "id": n["id"],
            "name": n["name"],
            "nameFa": n["nameFa"]
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": n["coordinates"]
        }
    })

new_geojson = {
    "type": "FeatureCollection",
    "features": features
}

with open("src/data/neighbours.json", "w", encoding="utf-8") as f:
    json.dump(new_geojson, f, indent=4, ensure_ascii=False)

print("Neighbors generated successfully with realistic geography and Farsi titles")
