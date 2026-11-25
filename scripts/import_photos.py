import base64,html,io,json,re,time,urllib.parse,urllib.request
from pathlib import Path
from PIL import Image, ImageOps
CANDIDATES = {
  "vehicle_citycar": "Toyota Yaris Hybrid (XP210) 1X7A0178.jpg",
  "car_sedan": "Toyota Corolla (E210) sedan IMG 4190.jpg",
  "vehicle_suv": "BMW X3(1).jpg",
  "car_cabrio": "Mazda MX-5 (ND) 1X7A7471.jpg",
  "vehicle_sport": "Porsche 911 992.jpg",
  "car_super": "Lamborghini Huracán LP610-4.jpg",
  "vehicle_scooter": "2019 Honda PCX 125.jpg",
  "motor_adventure": "Honda Africa Twin 2025.jpg",
  "motor_super": "BMW S 1000 RR, right view.jpg",
  "watch_casual": "Casio F-91W-5142.jpg",
  "art_watch": "Rolex Submariner.JPG",
  "amenity_console": "PlayStation 5.jpg",
  "gift_men_console": "PlayStation 5.jpg",
  "phone_basic": "Samsung Galaxy A16 5G (1).jpg",
  "gift_general_phone": "Samsung Galaxy A16 5G (1).jpg",
  "phone_ultra": "IPhone 16 Pro Max (54252176424).jpg",
  "art_camera": "Canon EOS R50, Vorderansicht 30.12.2025.jpg",
  "gift_general_camera": "Canon EOS R50, Vorderansicht 30.12.2025.jpg",
  "art_guitar": "Yamaha F310.jpg"
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
    query=urllib.parse.urlencode({"action":"query","titles":"File:"+name,"prop":"imageinfo","iiprop":"url|extmetadata","iiurlwidth":"500","format":"json","formatversion":"2"})
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
    if val("Restrictions"): raise ValueError("additional restrictions: "+val("Restrictions"))
    url=info.get("thumburl") or info["url"]
    if urllib.parse.urlparse(url).hostname not in ("upload.wikimedia.org","thumb.wikimedia.org"): raise ValueError("unexpected host")
    raw=get(url)
    if len(raw)>25000000: raise ValueError("too large")
    with Image.open(io.BytesIO(raw)) as im:
        im=ImageOps.exif_transpose(im).convert("RGB")
        im.thumbnail((480,360),Image.Resampling.LANCZOS)
        out=io.BytesIO(); im.save(out,format="WEBP",quality=78,method=6)
    return {"src":"data:image/webp;base64,"+base64.b64encode(out.getvalue()).decode(),"author":credit or "Wikimedia Commons","license":license,"licenseUrl":license_url,"source":info["descriptionurl"],"modified":"Resized and converted to WebP"}
photos={}; cache={}
for code,name in CANDIDATES.items():
    try:
        if name not in cache:
            cache[name]=read_photo(name)
            time.sleep(1)
        photos[code]=cache[name]; print("OK",code,flush=True)
    except Exception as e: print("SKIP",code,str(e),flush=True)
if not photos: raise SystemExit("No photos imported; existing bundle unchanged.")
path=ROOT/"photo-catalog.js"
old={}
if path.exists():
    try: old=json.loads(path.read_text().removeprefix("const PRODUCT_PHOTOS=").strip().removesuffix(";"))
    except Exception: pass
old.update(photos)
path.write_text("const PRODUCT_PHOTOS="+json.dumps(old,ensure_ascii=False,separators=(",",":"))+";\n",encoding="utf-8")
print("Imported",len(photos),"catalog entries; total",len(old),flush=True)
