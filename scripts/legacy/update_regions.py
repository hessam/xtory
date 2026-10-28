import json

cities = json.load(open("verify_cities.json"))

# Shared coordinate junctions designed to perfectly snap regions together
J_Tigris_Gulf = [48.0, 30.0]
J_Khorasan_Jibal_Caspian = [54.8, 36.0]
J_Jibal_Fars_West = [50.5, 31.0]
J_Makran_Sistan_East = [67.0, 30.5]

# The Central Desert Meeting Point
J_Center = [56.0, 32.5] 

J_Khor_Sis = [60.0, 33.0]
J_Fars_Makran_Sis = [60.0, 29.5]
J_Fars_Makran_West = [56.5, 28.0]
J_Jibal_Khorasan = [54.0, 34.0]
J_Jibal_Fars_Kavir = [53.5, 32.5]

# NEW SHARED NORTHERN BORDERS for Jibal/Media alignment
J_Azerbaijan_Jibal_North = [47.0, 36.7]
J_Az_Jib_Casp = [49.0, 37.0]
J_Az_Cau_Casp = [48.5, 39.5]
J_Cau_Casp_North = [49.5, 40.0]
J_Jibal_Caspian_NorthWest = [50.0, 36.7]
J_Jibal_Caspian_NorthEast = [51.8, 36.3]
J_Caspian_Khorasan_North = [54.8, 38.0]
J_Fars_Makran_Gulf = [54.0, 26.0]
J_Makran_Oman = [58.5, 22.5]

mesopotamia = [
    [41.5, 34.0],
    [41.5, 36.5],
    [44.0, 36.5],
    [46.0, 34.0],
    [47.5, 32.5], 
    J_Tigris_Gulf, 
    [46.0, 30.0],
    [43.0, 31.0],
    [41.5, 34.0]
]

khuzestan = [
    [47.5, 32.5],
    [48.5, 33.0], 
    [49.5, 32.0],
    [50.0, 30.0],
    J_Tigris_Gulf,
    [47.5, 32.5]
]

jibal = [
    [46.0, 34.0],
    J_Azerbaijan_Jibal_North,
    J_Az_Jib_Casp,
    J_Jibal_Caspian_NorthWest,
    J_Jibal_Caspian_NorthEast,
    J_Khorasan_Jibal_Caspian,
    J_Jibal_Khorasan,
    J_Center,
    J_Jibal_Fars_Kavir,
    J_Jibal_Fars_West,
    [49.5, 32.0],
    [48.5, 33.0],
    [47.5, 32.5],
    [46.0, 34.0]
]

fars = [
    J_Jibal_Fars_West,
    J_Jibal_Fars_Kavir,
    J_Center,
    J_Fars_Makran_Sis,
    J_Fars_Makran_West,
    J_Fars_Makran_Gulf,
    [51.0, 27.5],
    [50.0, 30.0],
    [49.5, 32.0],
    J_Jibal_Fars_West
]

azerbaijan = [
    [44.0, 36.5],
    [44.0, 39.5],
    J_Az_Cau_Casp,
    J_Az_Jib_Casp,
    J_Azerbaijan_Jibal_North,
    [46.0, 34.0],
    [44.0, 36.5]
]

caucasus = [
    [41.5, 40.0],
    [43.5, 43.5],
    [48.5, 42.5],
    J_Cau_Casp_North,
    J_Az_Cau_Casp,
    [44.0, 39.5],
    [41.5, 40.0]
]

caspian_coast = [
    J_Az_Jib_Casp,
    J_Az_Cau_Casp,
    J_Cau_Casp_North,
    [53.0, 40.0],
    J_Caspian_Khorasan_North,
    J_Khorasan_Jibal_Caspian,
    J_Jibal_Caspian_NorthEast,
    J_Jibal_Caspian_NorthWest,
    J_Az_Jib_Casp
]

khorasan = [
    J_Khorasan_Jibal_Caspian,
    J_Caspian_Khorasan_North,
    [62.0, 39.5],
    [67.0, 38.0],
    [68.5, 34.0],
    [63.0, 33.5],
    J_Khor_Sis,
    J_Center,
    J_Jibal_Khorasan,
    J_Khorasan_Jibal_Caspian
]

sistan = [
    J_Fars_Makran_Sis,
    J_Center,
    J_Khor_Sis,
    [63.0, 33.5],
    [68.5, 34.0],
    [69.5, 32.0],
    J_Makran_Sistan_East,
    J_Fars_Makran_Sis
]

makran = [
    J_Fars_Makran_Gulf,
    J_Fars_Makran_West,
    J_Fars_Makran_Sis,
    J_Makran_Sistan_East,
    [68.0, 24.0],
    J_Makran_Oman,
    J_Fars_Makran_Gulf
]

transoxiana = [
    [62.0, 39.5],
    [62.0, 42.0],
    [69.0, 42.0],
    [70.5, 39.0],
    [67.0, 38.0],
    [62.0, 39.5]
]

chorasmia = [
    [58.0, 40.0],
    [58.0, 43.5],
    [62.0, 43.5],
    [62.0, 39.5],
    [58.0, 40.0]
]

region_coords = {
    "fars": fars,
    "jibal": jibal,
    "khuzestan": khuzestan,
    "mesopotamia": mesopotamia,
    "azerbaijan": azerbaijan,
    "caucasus": caucasus,
    "caspian_coast": caspian_coast,
    "khorasan": khorasan,
    "sistan": sistan,
    "makran": makran,
    "transoxiana": transoxiana,
    "chorasmia": chorasmia
}

# No auto-expansion; junctions are manually defined to snap perfectly.

features = []
old_regions = json.load(open("src/data/regions.json"))

for reg_id, coords in region_coords.items():
    if coords[0] != coords[-1]:
        coords.append(coords[0])
    
    zone = "unknown"
    for feat in old_regions["features"]:
        if "id" in feat.get("properties", {}) and feat["properties"]["id"] == reg_id:
            zone = feat["properties"].get("zone", "unknown")
            break

    feature = {
        "type": "Feature",
        "properties": {
            "id": reg_id,
            "zone": zone
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [coords]
        }
    }
    features.append(feature)

for feat in old_regions["features"]:
    props = feat.get("properties", {})
    if props.get("id") not in region_coords:
        features.append(feat)

new_geojson = {
    "type": "FeatureCollection",
    "features": features
}

with open("src/data/regions.json", "w") as f:
    json.dump(new_geojson, f, indent=4)

print("success")
