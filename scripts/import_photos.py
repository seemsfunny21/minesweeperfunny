import base64,html,io,json,re,time,urllib.parse,urllib.request
from pathlib import Path
from PIL import Image, ImageOps
CANDIDATES = {
  "vehicle_citycar": [
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
    "CASIO F-91W.JPG",
    "Casio F-91W.jpg",
    "Casio F-91W watch (2023) (front view - full length).jpg",
    "Casio F-91W-5142.jpg"
  ],
  "art_watch": [
    "Rolex Submariner.JPG"
  ],
  "amenity_console": [
    "PlayStation 5 and DualSense.jpg",
    "PlayStation 5.jpg"
  ],
  "gift_men_console": [
    "PlayStation 5 and DualSense.jpg",
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
  ]
}
ROOT = Path(__file__).resolve().parent.parent
UA = "PredictionsCatalog/1.0 (Wikimedia Commons attribution; https://github.com/seemsfunny21/predictions)"
def get(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":UA}),timeout=30) as r:
                return r.read(25000001)
        except Exception:
            if attempt == 2: raise
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
    if not (re.fullmatch(r"CC BY(?:-SA)? [234]\\.\\d(?: [A-Za-z]+)?",license) or license in ("CC0","CC0 1.0","Public domain")): raise ValueError("unapproved license "+license)
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
path=ROOT/"photo-catalog.js"
old={}
if path.exists():
    old=json.loads(path.read_text().removeprefix("const PRODUCT_PHOTOS=").strip().removesuffix(";"))
photos={}; cache={}
for code,names in CANDIDATES.items():
    if code in old:
        print("KEEP",code,flush=True)
        continue
    for name in names:
        try:
            if name not in cache:
                cache[name]=read_photo(name)
                time.sleep(1)
            photos[code]=cache[name]; print("OK",code,name,flush=True)
            break
        except Exception as e: print("SKIP",code,name,str(e),flush=True)
old.update(photos)
path.write_text("const PRODUCT_PHOTOS="+json.dumps(old,ensure_ascii=False,separators=(",",":"))+";\n",encoding="utf-8")
print("Imported",len(photos),"catalog entries; total",len(old),flush=True)
