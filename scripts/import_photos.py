import base64,html,io,json,re,time,unicodedata,urllib.parse,urllib.request
from pathlib import Path
from PIL import Image, ImageOps
CANDIDATES = {
  "vehicle_citycar": [
    "Toyota Yaris Hybrid (XP210) 1X7A0366.jpg",
    "Toyota Yaris Hybrid (XP210) 1X7A0354.jpg",
    "Toyota Yaris XP210.jpg",
    "Toyota Yaris Hybrid (XP210) 1X7A0178.jpg"
  ],
  "car_sedan": [
    "Toyota Corolla (E210) sedan IMG 4190.jpg"
  ],
  "vehicle_suv": [
    "BMW X3(1).jpg"
  ],
  "car_cabrio": [
    "Mazda MX-5 (ND) 1X7A7471.jpg"
  ],
  "vehicle_sport": [
    "Porsche 911 992.jpg"
  ],
  "car_super": [
    "Lamborghini Huracán LP610-4.jpg"
  ],
  "vehicle_scooter": [
    "2021 Honda PCX 125.jpg",
    "2014 Honda PCX125.jpg",
    "2019 Honda PCX 125.jpg"
  ],
  "motor_adventure": [
    "Honda Africa Twin 2025.jpg"
  ],
  "motor_super": [
    "BMW S 1000 RR, right view.jpg"
  ],
  "watch_casual": [
    "Casio F-91W.jpg",
    "A design classic - the Casio F-91W watch.jpg",
    "Casio F-91W watch.jpg",
    "CASIO F-91W.JPG",
    "Casio F-91W watch (2023) (front view - full length).jpg",
    "Casio F-91W-5142.jpg"
  ],
  "art_watch": [
    "Rolex Submariner.JPG"
  ],
  "amenity_console": [
    "PlayStation 5 and DualSense.jpg",
    "Playstation 5 base edition with controller (original).jpg",
    "PlayStation 5.jpg"
  ],
  "gift_men_console": [
    "PlayStation 5 and DualSense.jpg",
    "Playstation 5 base edition with controller (original).jpg",
    "PlayStation 5.jpg"
  ],
  "phone_basic": [
    "Galaxy A16 front.jpg",
    "Samsung Galaxy A16 5G 2025 (cropped).jpg",
    "Samsung Galaxy A16 5G (1).jpg"
  ],
  "gift_general_phone": [
    "Galaxy A16 front.jpg",
    "Samsung Galaxy A16 5G 2025 (cropped).jpg",
    "Samsung Galaxy A16 5G (1).jpg"
  ],
  "phone_ultra": [
    "IPhone 16 Pro Max (54252176424).jpg"
  ],
  "art_camera": [
    "Canon EOS R50, Vorderansicht 30.12.2025.jpg"
  ],
  "gift_general_camera": [
    "Canon EOS R50, Vorderansicht 30.12.2025.jpg"
  ],
  "art_guitar": [
    "Yamaha F310.jpg"
  ],
  "motor_moped": [
    "Honda Super Cub C125 (2BJ-JA48) front.jpg",
    "2026 Honda C125 ABS.jpg"
  ],
  "vehicle_motorbike": [
    "Honda CB500 Hornet 2026.jpg",
    "2023 Honda CB500 Hornet.jpg"
  ],
  "motor_sport": [
    "Yamaha YZF-R7 (55048319395).jpg"
  ],
  "phone_mid": [
    "Redmi Note 14 - 2024-09-27 01.jpg",
    "Redmi Note 14 - 2024-09-27 02.jpg"
  ],
  "phone_advanced": [
    "Samsung Galaxy A56 5G 2025 (2).jpg",
    "Samsung Galaxy A56 5G 2025.jpg"
  ],
  "watch_smart": [
    "Garmin Venu 3 (a).JPG",
    "Garmin Venu 3 (b).JPG"
  ],
  "watch_premium": [
    "Tissot PRX 35mm.jpg",
    "Tissot PRX.jpg"
  ],
  "watch_luxury": [
    "Omega Seamaster Co-Axial.jpg",
    "Omega Seamaster Diving watch.jpg"
  ],
  "pet_fish": [
    "Exotic goldfish diversity.jpg",
    "Goldfish 3.jpg",
    "Goldfish aquarium.jpg",
    "Goldfish in Fish Tank.jpg"
  ],
  "pet_rabbit": [
    "Pet rabbit at home.jpg",
    "Rabbit pet.jpg"
  ],
  "pet_cat": [
    "Domestic cat.jpg"
  ],
  "pet_dog": [
    "Golden Retriever Dog.jpg"
  ],
  "pet_parrot": [
    "African grey parrot.jpg",
    "African-Grey-Parrot.jpg"
  ],
  "travel_islands": [
    "Santorini Oia Skyline.jpg",
    "Santorini Oia View.jpg",
    "View of Oia, Santorini.jpg",
    "Oia.Santorini.jpg"
  ],
  "travel_paris": [
    "Eiffel Tower seen from the Palais de Chaillot.jpg",
    "View of the Eiffel Tower in Paris, France.jpg"
  ],
  "travel_maldives": [
    "Aerial shot of a small island on a coral reef in the Maldives.jpg",
    "Ariel View of Amilla Fushi Island Maldives.jpg"
  ],
  "phone_fold": [
    "Samsung Galaxy Z Fold6.png"
  ],
  "phone_flagship": [
    "IPhone 16 (54251926561).jpg",
    "Back of iPhone 16 Blue model.jpg"
  ],
  "art_piano": [
    "Yamaha U1.jpg"
  ],
  "gift_general_game": [
    "Monopoly board game.jpg",
    "Monopoly-board.jpg"
  ]
}
SEARCH_TARGETS = {
  "vehicle_bike": "Ideal Cityrun",
  "bike_mountain": "Cube Aim",
  "bike_gravel": "Cube Nuroad",
  "vehicle_roadbike": "Cube Attain",
  "bike_carbon": "Cube Agree C62",
  "bike_pro": "Specialized Tarmac SL8",
  "watch_sport": "Casio GA2100",
  "tech_tablet": "Samsung Galaxy Tab A9",
  "gift_general_tablet": "Samsung Galaxy Tab A9",
  "tech_laptop": "Lenovo IdeaPad",
  "gift_men_laptop": "Lenovo IdeaPad",
  "tech_gaming": "ASUS ROG gaming PC",
  "tech_premium": "Alienware gaming setup",
  "amenity_cinema": "Sony home cinema",
  "amenity_bbq": "Weber Spirit grill",
  "gift_men_grill": "Weber grill",
  "amenity_pool": "Intex pool",
  "amenity_spa": "Bestway Lay Z Spa",
  "luxury_jetski": "Sea Doo Spark",
  "vehicle_boat": "Olympic 490 boat",
  "luxury_sail": "Beneteau Oceanis",
  "vehicle_yacht": "Azimut yacht",
  "vehicle_jet": "Cessna Citation",
  "pet_horse": "domestic horse",
  "travel_rome": "Colosseum Rome",
  "travel_newyork": "New York skyline",
  "home_studio": "studio apartment interior",
  "home_apartment": "apartment interior",
  "home_house": "detached house",
  "home_maisonette": "maisonette",
  "home_villa": "luxury villa",
  "home_mansion": "mansion",
  "home_island": "private island",
  "amenity_garden": "garden Gardena",
  "amenity_gym": "Technogym gym",
  "amenity_sports": "private sports center",
  "art_painting": "oil painting",
  "art_sculpture": "marble sculpture",
  "art_collection": "art collection gallery",
  "gift_men_watch": "Casio G Shock",
  "gift_men_glasses": "Ray Ban Aviator",
  "gift_men_headphones": "JBL Tune headphones",
  "gift_men_ball": "Adidas football",
  "gift_men_football": "Nike football",
  "gift_men_bike": "Ideal bicycle",
  "gift_men_guitar": "Yamaha guitar",
  "gift_men_wallet": "Tommy Hilfiger wallet",
  "gift_men_shoes": "Geox shoes",
  "gift_men_backpack": "Eastpak backpack",
  "gift_men_toolkit": "Bosch tools",
  "gift_men_gaming": "Xbox controller",
  "gift_men_sneakers": "Nike Air Max",
  "gift_women_bag": "Guess handbag",
  "gift_women_perfume": "Chanel Coco Mademoiselle",
  "gift_women_ring": "Pandora ring",
  "gift_women_jewel": "Swarovski jewelry",
  "gift_women_bracelet": "Pandora bracelet",
  "gift_women_cosmetics": "Korres cosmetics",
  "gift_women_earrings": "Swarovski earrings",
  "gift_women_necklace": "Pandora necklace",
  "gift_women_makeup": "Maybelline makeup",
  "gift_women_sunglasses": "Ray Ban sunglasses",
  "gift_women_watch": "Michael Kors watch",
  "gift_women_luxurybag": "Michael Kors handbag",
  "gift_general_coffee": "Loumidis coffee",
  "gift_general_tea": "Lipton tea",
  "gift_general_puzzle": "Ravensburger puzzle",
  "gift_general_donut": "doughnut",
  "gift_general_plane": "passenger airplane",
  "gift_general_music": "music gift",
  "gift_general_icecream": "Kri Kri ice cream",
  "gift_general_pizza": "Pizza Fan",
  "gift_general_chocolate": "Lacta Greece chocolate",
  "travel_world": "world globe map",
  "gift_men_car": "BMW model car miniature",
  "gift_men_motorbike": "Yamaha model motorcycle miniature",
  "gift_men_tie": "necktie",
  "gift_men_suit": "men suit",
  "gift_women_rose": "red rose flower",
  "gift_women_bouquet": "flower bouquet",
  "gift_women_teddy": "teddy bear toy",
  "gift_women_dress": "evening dress",
  "gift_women_scarf": "silk scarf",
  "gift_women_spa": "spa massage stones",
  "gift_women_orchid": "orchid flower",
  "gift_flower": "flower bouquet",
  "gift_general_cake": "birthday cake",
  "gift_general_book": "book gift",
  "gift_general_ticket": "cinema ticket",
  "gift_general_trip": "travel suitcase",
  "gift_general_plant": "potted plant",
  "gift_general_heart": "heart shaped gift",
  "gift_general_balloon": "party balloons",
  "gift_general_star": "gold star ornament",
  "gift_general_box": "gift box ribbon",
  "gift_general_crown": "royal crown",
  "gift_general_meal": "Greek meal",
  "gift_general_movie": "movie film reel",
  "gift_general_flowers": "flower bouquet",
  "gift_general_holiday": "beach holiday",
  "gift_general_celebration": "party decoration",
  "gift_general_diamond": "cut diamond",
  "vehicle_citycar": "Toyota Yaris",
  "car_sedan": "Toyota Corolla sedan",
  "vehicle_suv": "BMW X3",
  "car_cabrio": "Mazda MX5",
  "vehicle_sport": "Porsche 911",
  "car_super": "Lamborghini Huracan",
  "vehicle_scooter": "Honda PCX 125",
  "motor_adventure": "Honda Africa Twin",
  "motor_super": "BMW S1000RR",
  "watch_casual": "Casio F91W",
  "art_watch": "Rolex Submariner",
  "amenity_console": "PlayStation 5",
  "gift_men_console": "PlayStation 5",
  "phone_basic": "Samsung Galaxy A16",
  "gift_general_phone": "Samsung Galaxy A16",
  "phone_ultra": "iPhone 16 Pro Max",
  "art_camera": "Canon EOS R50",
  "gift_general_camera": "Canon EOS R50",
  "art_guitar": "Yamaha F310",
  "motor_moped": "Honda Super Cub",
  "vehicle_motorbike": "Honda CB500 Hornet",
  "motor_sport": "Yamaha R7",
  "phone_mid": "Redmi Note 14",
  "phone_advanced": "Samsung Galaxy A56",
  "watch_smart": "Garmin Venu 3",
  "watch_premium": "Tissot PRX",
  "watch_luxury": "Omega Seamaster",
  "pet_fish": "goldfish aquarium",
  "pet_rabbit": "domestic rabbit",
  "pet_cat": "domestic cat",
  "pet_dog": "domestic dog",
  "pet_parrot": "African grey parrot",
  "travel_islands": "Santorini Oia",
  "travel_paris": "Eiffel Tower Paris",
  "travel_maldives": "Maldives island",
  "phone_fold": "Samsung Galaxy Z Fold6",
  "phone_flagship": "iPhone 16",
  "art_piano": "Yamaha U1",
  "gift_general_game": "Monopoly board"
}
ROOT = Path(__file__).resolve().parent.parent
UA = "PredictionsCatalog/1.0 (Wikimedia Commons attribution; https://github.com/seemsfunny21/predictions)"
def get(url):
    for attempt in range(2):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":UA}),timeout=15) as r:
                return r.read(25000001)
        except Exception:
            if attempt == 1: raise
            time.sleep(3*(attempt+1))
def clean(s):
    return " ".join(html.unescape(re.sub(r"<[^>]+>"," ",s)).split())
def read_photo(name):

    query=urllib.parse.urlencode({"action":"query","titles":"File:"+name,"prop":"imageinfo","iiprop":"url|extmetadata","iiurlwidth":"480","format":"json","formatversion":"2"})
    page=json.loads(get("https://commons.wikimedia.org/w/api.php?"+query))["query"]["pages"][0]
    info=page["imageinfo"][0]; meta=info["extmetadata"]
    val=lambda key: clean(meta.get(key,{}).get("value",""))
    license=val("LicenseShortName")
    license_url=val("LicenseUrl")
    if not (re.fullmatch(r"CC BY(?:-SA)? [234]\.\d(?: [A-Za-z]+)?",license) or license in ("CC0","CC0 1.0","Public domain")): raise ValueError("unapproved license "+license)
    if license.startswith("CC BY") and not license_url.startswith("https://creativecommons.org/licenses/"): 
        if license_url.startswith("http://creativecommons.org/licenses/"): license_url="https://"+license_url[7:]
        else: raise ValueError("invalid license URL")
    author=val("Artist")
    credit=val("Attribution") or author
    if not credit and license.startswith("CC BY"): raise ValueError("missing author")
    restrictions=val("Restrictions")
    if restrictions and restrictions.lower() not in ("trademarked","trademark","none"): raise ValueError("additional restrictions: "+restrictions)
    url=info.get("thumburl") or info["url"]
    if urllib.parse.urlparse(url).hostname not in ("upload.wikimedia.org","thumb.wikimedia.org"): raise ValueError("unexpected host")
    try: raw=get(url)
    except Exception:
        original=info["url"]
        if urllib.parse.urlparse(original).hostname!="upload.wikimedia.org": raise
        raw=get(original)
    if len(raw)>25000000: raise ValueError("too large")
    with Image.open(io.BytesIO(raw)) as im:
        im=ImageOps.exif_transpose(im).convert("RGB")
        im.thumbnail((480,360),Image.Resampling.LANCZOS)
        out=io.BytesIO(); im.save(out,format="WEBP",quality=78,method=6)
    return {"src":"data:image/webp;base64,"+base64.b64encode(out.getvalue()).decode(),"author":credit or "Wikimedia Commons","license":license,"licenseUrl":license_url,"source":info["descriptionurl"],"modified":"Resized and converted to WebP"}
def normalized(s):
    return re.sub(r"[^a-z0-9]","",unicodedata.normalize("NFKD",s).lower())
def discover(terms):
    # Require every model/subject token in the actual filename, not just search relevance.
    query=urllib.parse.urlencode({"action":"query","list":"search","srnamespace":6,"srlimit":25,"srsearch":terms+" filetype:bitmap","format":"json","formatversion":"2"})
    data=json.loads(get("https://commons.wikimedia.org/w/api.php?"+query))
    required=normalized(terms)
    tokens=[normalized(t) for t in terms.split() if normalized(t)]
    found=[]
    for hit in data.get("query",{}).get("search",[]):
        title=hit["title"].removeprefix("File:")
        if (required in normalized(title) or all(t in normalized(title) for t in tokens)) and re.search(r"\.(jpe?g|png|webp)$",title,re.I):
            found.append(title)
    return found[:4]
path=ROOT/"photo-catalog.js"
old={}
if path.exists():
    old=json.loads(path.read_text().removeprefix("const PRODUCT_PHOTOS=").strip().removesuffix(";"))
photos={}; cache={}
def save():
    tmp=path.with_suffix('.tmp')
    tmp.write_text('const PRODUCT_PHOTOS='+json.dumps({**old,**photos},ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
    tmp.replace(path)
for code in dict.fromkeys(['vehicle_citycar','watch_casual','amenity_console','gift_men_console',*CANDIDATES,*SEARCH_TARGETS]):
    names=list(CANDIDATES.get(code,[]))
    if code in old:
        print("KEEP",code,flush=True)
        continue
    if code in SEARCH_TARGETS:
        try: names=list(dict.fromkeys(discover(SEARCH_TARGETS[code])+names))
        except Exception as e: print("SEARCH SKIP",code,str(e),flush=True)
    for name in names:
        try:
            if name not in cache:
                cache[name]=read_photo(name)
                time.sleep(1)
            photos[code]=cache[name]; save(); print("OK",code,name,flush=True)
            break
        except Exception as e: print("SKIP",code,name,str(e),flush=True)
old.update(photos)
path.write_text("const PRODUCT_PHOTOS="+json.dumps(old,ensure_ascii=False,separators=(",",":"))+";\n",encoding="utf-8")
print("Imported",len(photos),"catalog entries; total",len(old),flush=True)
