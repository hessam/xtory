import json

cities = json.load(open("verify_cities.json"))
city_pts = {c["name"]: [c["lng"], c["lat"]] for c in cities}

# Shared coordinate junctions designed to trace the actual mountains and rivers
# to ensure zero missing gaps between adjacent territories unless intended (like deserts)

J_Tigris_Gulf = [48.0, 30.0]

# Mesopotamia
# Tigris/Euphrates basin, Zagros foothills
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
    [47.0, 36.7],
    [50.0, 36.7],
    [51.8, 36.3],
    [52.5, 33.5],
    [52.5, 32.0],
    [50.5, 31.0],
    [49.5, 32.0],
    [48.5, 33.0],
    [47.5, 32.5],
    [46.0, 34.0]
]

fars = [
    [49.5, 32.0],
    [50.5, 31.0],
    [52.5, 32.0],
    [53.5, 31.0],
    [55.5, 29.5],
    [54.5, 27.0],
    [51.0, 27.5],
    [50.0, 30.0],
    [49.5, 32.0]
]

azerbaijan = [
    [44.0, 36.5],
    [44.0, 39.5],
    [48.5, 39.5],
    [49.0, 37.0],
    [47.0, 36.7],
    [46.0, 34.0],
    [44.0, 36.5]
]

caucasus = [
    [41.5, 40.0],
    [43.5, 43.5],
    [48.5, 42.5],
    [49.5, 40.0],
    [48.5, 39.5],
    [44.0, 39.5],
    [41.5, 40.0]
]

caspian_coast = [
    [49.0, 37.0],
    [49.0, 38.0],
    [54.8, 38.0],
    [54.8, 36.0],
    [51.8, 36.3],
    [50.0, 36.7],
    [49.0, 37.0]
]

khorasan = [
    [54.8, 36.0],
    [54.8, 38.0],
    [62.0, 39.5],
    [67.0, 38.0],
    [68.5, 34.0],
    [63.0, 33.5],
    [56.0, 33.0],
    [54.8, 36.0]
]

sistan = [
    [60.0, 29.5],
    [59.0, 32.5],
    [63.0, 33.5],
    [68.5, 34.0],
    [69.5, 32.0],
    [67.0, 30.5],
    [60.0, 29.5]
]

makran = [
    [56.5, 25.0],
    [56.5, 28.0],
    [60.0, 29.5],
    [67.0, 30.5],
    [68.0, 25.0],
    [56.5, 25.0]
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

for city in cities:
    pt = [city["lng"], city["lat"]]
    reg = city["region_id"]
    if reg not in region_coords:
        continue
    coords = region_coords[reg]
    min_lng = min(c[0] for c in coords)
    max_lng = max(c[0] for c in coords)
    min_lat = min(c[1] for c in coords)
    max_lat = max(c[1] for c in coords)
    
    if pt[0] < min_lng:
        for c in coords:
            if c[0] == min_lng: c[0] = pt[0] - 0.5
    if pt[0] > max_lng:
        for c in coords:
            if c[0] == max_lng: c[0] = pt[0] + 0.5
    if pt[1] < min_lat:
        for c in coords:
            if c[1] == min_lat: c[1] = pt[1] - 0.5
    if pt[1] > max_lat:
        for c in coords:
            if c[1] == max_lat: c[1] = pt[1] + 0.5


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
