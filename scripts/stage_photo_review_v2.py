"""Stage licensed candidates for human/model visual review. Never changes the live catalog."""
import io,json,re,time,html,urllib.request,urllib.parse,hashlib,concurrent.futures
from pathlib import Path
from PIL import Image,ImageOps
ROOT=Path(__file__).resolve().parent.parent
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
    if not re.fullmatch(r"CC\s*BY(?:-SA)? [1-4][.][05]|CC\s*0(?: 1[.]0)?|Public domain|FAL",license,re.I):
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

plan=json.loads((ROOT/'scripts/photo-review-v2.json').read_text())
out=ROOT/'review-candidates'
out.mkdir(exist_ok=True)
def candidate(task):
    code,n,file=task
    try:
        data,meta=download(file)
        name=f'{code}-{n}.webp'
        (out/name).write_bytes(data)
        return code,{'file':name,'requested_file':file,'sha256':hashlib.sha256(data).hexdigest(),**meta}
    except Exception as e:
        return code,{'requested_file':file,'error':str(e)}
tasks=[(code,i,file) for code,files in plan.items() for i,file in enumerate(files)]
results={code:[] for code in plan}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    for code,result in pool.map(candidate,tasks):
        results[code].append(result)
        print(code,result.get('file',result.get('error')),flush=True)
(out/'manifest.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
print(sum('file' in r for rows in results.values() for r in rows),'licensed candidates saved')
