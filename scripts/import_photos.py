"""Move the existing catalog to local WebP files without downloading again.
Run from repository root. Re-runnable; optional four local WebP files in images/.
"""
import base64, io, json, re
from pathlib import Path
from PIL import Image, ImageOps

ROOT=Path(__file__).resolve().parent.parent
CAT=ROOT/"photo-catalog.js"
REPORT=ROOT/"photo-import-report.json"
PREFIX="const PRODUCT_PHOTOS="
raw=CAT.read_text(encoding="utf-8").strip()
assert raw.startswith(PREFIX) and raw.endswith(";"), "Invalid catalog"
photos=json.loads(raw[len(PREFIX):-1])
report=json.loads(REPORT.read_text(encoding="utf-8"))
missing_codes={"bike_carbon","gift_women_jewel","gift_women_spa","gift_coffee"}
expected=set(photos)|set(report)|missing_codes
assert len(expected)==142, f"Expected 142 catalog items; got {len(expected)}"

def category(code):
    special={"vehicle_citycar":"cars","vehicle_suv":"cars","vehicle_sport":"cars",
      "vehicle_motorbike":"motorcycles","vehicle_scooter":"motorcycles",
      "vehicle_bike":"bicycles","vehicle_roadbike":"bicycles","art_watch":"watches",
      "amenity_console":"technology","amenity_cinema":"technology","home_island":"luxury",
      "vehicle_boat":"luxury","vehicle_yacht":"luxury","vehicle_jet":"luxury"}
    if code in special:return special[code]
    if code.startswith("gift_"):
        return "gifts/"+(code.split("_")[1] if code.split("_")[1] in ("men","women","general") else "general")
    return {"home":"houses","car":"cars","motor":"motorcycles","pet":"pets","phone":"phones",
       "watch":"watches","bike":"bicycles","tech":"technology","travel":"travel",
       "amenity":"amenities","luxury":"luxury","art":"art"}[code.split("_")[0]]

def relative(code):
    assert re.fullmatch(r"[a-z0-9_]+",code)
    return "images/"+category(code)+"/"+code+".webp"

def normalize(data):
    with Image.open(io.BytesIO(data)) as src:
        src=ImageOps.exif_transpose(src).convert("RGBA")
        src.thumbnail((480,480),Image.Resampling.LANCZOS)
        canvas=Image.new("RGBA",(480,480),(0,0,0,0))
        canvas.alpha_composite(src,((480-src.width)//2,(480-src.height)//2))
        out=io.BytesIO()
        canvas.save(out,format="WEBP",quality=86,method=6)
        return out.getvalue()

old_bytes=len(raw.encode())
for code,p in photos.items():
    dst=ROOT/relative(code)
    source=p["src"]
    if source.startswith("data:image/webp;base64,"):
        data=base64.b64decode(source.split(",",1)[1],validate=True)
        dst.parent.mkdir(parents=True,exist_ok=True)
        dst.write_bytes(normalize(data))
    elif source== "./"+relative(code):
        assert dst.is_file(), f"Missing {dst}"
    else:
        raise ValueError("Unexpected image source "+code)
    p["src"]="./"+relative(code)
    p["modified"]="Resized and converted to WebP; centered on 480×480 canvas"
    report[code]={"status":"saved","source":p["source"],"license":p["license"],"representative":p.get("representative",False),"path":relative(code)}

for code in sorted(missing_codes-set(photos)):
    dst=ROOT/relative(code)
    if not dst.is_file():continue
    dst.write_bytes(normalize(dst.read_bytes()))
    p={"src":"./"+relative(code),"author":"OpenAI — AI-generated image"+(" based on a user-supplied photograph" if code=="bike_carbon" else ""),
       "license":"AI-generated image for this game","licenseUrl":"","source":"https://github.com/seemsfunny21/predictions/blob/main/"+relative(code),
       "representative":True,"modified":"Resized and converted to WebP"}
    photos[code]=p
    report[code]={"status":"saved","source":p["source"],"license":p["license"],"representative":True,"path":relative(code)}

assert len(photos)>=138
assert set(photos)<=expected
for code,p in photos.items():
    assert p["src"]=="./"+relative(code) and p["author"] and p["license"] and p["source"]
    with Image.open(ROOT/relative(code)) as im:
        assert im.format=="WEBP" and im.size==(480,480),code
        im.verify()
assert len({p["src"] for p in photos.values()})==len(photos)
new=PREFIX+json.dumps(photos,ensure_ascii=False,separators=(",",":"))+";\n"
assert "data:image/" not in new
CAT.write_text(new,encoding="utf-8")
REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(f"Verified {len(photos)}/142 files, catalog {old_bytes} -> {len(new.encode())} bytes")
print("Missing:",sorted(expected-set(photos)))
