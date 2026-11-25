"""Import explicitly selected replacement photographs; retain old images on failure.
Selection is based on source descriptions; visual review remains pending."""
import io, json, re, time, html, urllib.request, urllib.parse
from pathlib import Path
from PIL import Image, ImageOps
ROOT=Path(__file__).resolve().parent.parent
CAT=ROOT/"photo-catalog.js"
REPORT=ROOT/"photo-import-report.json"
PREFIX="const PRODUCT_PHOTOS="
photos=json.loads(CAT.read_text().strip()[len(PREFIX):-1])
report=json.loads(REPORT.read_text())
choices=json.loads((ROOT/"scripts/photo-replacements.json").read_text())
def clean(s): return html.unescape(re.sub(r"<[^>]*>","",s)).strip()
def request(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"PredictionsCatalog/1.0 (https://github.com/seemsfunny21/predictions; catalog attribution)"}),timeout=20) as res:
                return res.read(25_000_001)
        except Exception:
            if attempt==2: raise
            time.sleep(2**attempt)
def download(file):
    query=urllib.parse.urlencode({"action":"query","format":"json","titles":"File:"+file,"prop":"imageinfo","iiprop":"url|extmetadata","iiurlwidth":960,"redirects":"1"})
    page=next(iter(json.loads(request("https://commons.wikimedia.org/w/api.php?"+query))["query"]["pages"].values()))
    info=page["imageinfo"][0]
    md=info["extmetadata"]
    def val(key): return clean(md.get(key,{}).get("value",""))
    license=val("LicenseShortName")
    if not re.fullmatch(r"CC (?:BY(?:-SA)? [1-4]\\.[05]|0(?: 1\\.0)?)|Public domain",license,re.I):
        raise ValueError("Unapproved license: "+license)
    author=val("Artist")
    if not author: raise ValueError("Missing author")
    data=request(info.get("thumburl") or info["url"])
    if len(data)>25_000_000: raise ValueError("Image too large")
    with Image.open(io.BytesIO(data)) as src:
        if min(src.size)<300: raise ValueError("Image too small")
        src=ImageOps.exif_transpose(src).convert("RGBA")
        src.thumbnail((480,480),Image.Resampling.LANCZOS)
        out=Image.new("RGBA",(480,480),(0,0,0,0))
        out.alpha_composite(src,((480-src.width)//2,(480-src.height)//2))
        buf=io.BytesIO()
        out.save(buf,format="WEBP",quality=88,method=6)
    data=buf.getvalue()
    with Image.open(io.BytesIO(data)) as im:
        assert im.format=="WEBP" and im.size==(480,480)
        im.verify()
    return data,{"author":author,"license":license,"licenseUrl":val("LicenseUrl"),"source":info["descriptionurl"],"representative":True,"modified":"Resized and converted to WebP; centered on 480×480 canvas"}
missing={"bike_carbon":"images/bicycles/bike_carbon.webp","gift_coffee":"images/gifts/general/gift_coffee.webp","gift_women_jewel":"images/gifts/women/gift_women_jewel.webp","gift_women_spa":"images/gifts/women/gift_women_spa.webp"}
audit={}
for code,item in choices.items():
    old=photos.get(code,{})
    if old.get("source")!=item["previous"]:
        print("SKIP already changed",code)
        continue
    try:
        path=old["src"][2:] if old else missing[code]
        data,meta=download(item["file"])
        dst=ROOT/path
        dst.parent.mkdir(parents=True,exist_ok=True)
        dst.write_bytes(data)
        photos[code]={"src":"./"+path,**meta}
        report[code]={"status":"saved","source":meta["source"],"license":meta["license"],"representative":True,"path":path}
        audit[code]={"status":"replaced","previous":item["previous"],"source":meta["source"],"visual_review":"pending"}
        print("REPLACED",code,flush=True)
    except Exception as exc:
        audit[code]={"status":"failed","candidate":item["file"],"reason":str(exc),"visual_review":"pending"}
        print("FAILED",code,str(exc),flush=True)
CAT.write_text(PREFIX+json.dumps(photos,ensure_ascii=False,separators=(",",":"))+";\n")
REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
path=ROOT/"photo-quality-review.json"
prior=json.loads(path.read_text()) if path.exists() else {}
prior.update(audit)
path.write_text(json.dumps(prior,ensure_ascii=False,indent=2)+"\n")
