import re

artifacts_map = {
    "art_chogha_zanbil": "[32.0083, 48.5200]",
    "art_behistun_relief": "[34.3853, 47.4363]",
    "art_tomb_cyrus": "[30.2036, 53.1788]",
    "art_pasargadae": "[30.2036, 53.1788]",
    "art_cyrus_cylinder": "[32.5363, 44.4208]",
    "art_persepolis": "[29.9360, 52.8906]",
    "art_taq_kasra": "[33.0936, 44.5794]",
    "art_shahnameh_baysunghur": "[34.3419, 62.2031]",
    "art_naqsh_e_jahan": "[32.6577, 51.6776]"
}

events_map = {
    "ev_susa_foundation": "[32.1892, 48.2415]",
    "ev_moses_exodus": "[29.5000, 33.5000]",
    "ev_red_sea_parting": "[28.5000, 33.0000]",
    "ev_zarathushtra_rise": "[36.7584, 66.8988]",
    "ev_median_foundation": "[34.7992, 48.5146]",
    "ev_nineveh_fall": "[36.3592, 43.1533]",
    "ev_achaemenid_foundation": "[30.2036, 53.1788]",
    "ev_conquest_lydia": "[38.4883, 28.0403]",
    "ev_conquest_babylon": "[32.5363, 44.4208]",
    "ev_behistun": "[34.3853, 47.4363]",
    "ev_marathon": "[38.1500, 23.9500]",
    "ev_gaugamela": "[36.1911, 44.0091]",
    "ev_carrhae": "[36.8667, 39.0333]",
    "ev_birth_jesus": "[31.7047, 35.2037]",
    "ev_biblical_magi": "[35.0210, 50.3564]",
    "ev_crucifixion": "[31.7683, 35.2137]",
    "ev_edessa": "[37.1670, 38.7939]",
    "ev_qadisiyyah": "[31.8617, 44.4363]",
    "ev_nahavand": "[34.1852, 48.3756]",
    "ev_manzikert": "[39.1417, 42.5401]",
    "ev_mongol_invasion": "[42.3217, 59.1554]",
    "ev_baghdad_fall": "[33.3152, 44.3661]",
    "ev_chaldiran": "[39.0645, 44.4172]",
    "ev_karnal": "[29.6857, 76.9905]",
    "ev_constitutional_revolution": "[35.6892, 51.3890]",
    "ev_islamic_revolution": "[35.6892, 51.3890]"
}

def fix_file(filename, replacement_map):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    for obj_id, new_coords in replacement_map.items():
        # Match the block for the specific event/artifact ID
        # Finding the object by searching for id: '...' and then replacing its coordinates line
        pattern = re.compile(rf"(id:\s*['\"]{obj_id}['\"].*?coordinates:\s*)\[[0-9.,\s]+\]", re.DOTALL)
        content = pattern.sub(rf"\1{new_coords}", content)
        
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)

fix_file("src/data/artifacts.ts", artifacts_map)
fix_file("src/data/historicalEvents.ts", events_map)
print("done")
