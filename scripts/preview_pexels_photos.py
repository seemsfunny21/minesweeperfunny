"""Build a preview artifact; never overwrite published images."""
import concurrent.futures, io, json, re, urllib.request, urllib.parse
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
ROOT=Path(__file__).resolve().parent.parent
PLAN=json.loads((ROOT/'scripts/pexels-photo-plan.json').read_text())
OUT=Path('/tmp/pexels-previews');OUT.mkdir(exist_ok=True)
def get(url):
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; PredictionsCatalog/1.0)'})
    with urllib.request.urlopen(req,timeout=20) as r:
        return r.read(20_000_001)
def process(pair):
    code,spec=pair; rows=[]
    for index,page in enumerate(spec['source_pages'],1):
        try:
            match=re.fullmatch(r'https://www[.]pexels[.]com/photo/[a-z0-9-]+-([0-9]+)/',page)
            if not match:raise ValueError('unexpected source')
            pid=match.group(1)
            url=f'https://images.pexels.com/photos/{pid}/pexels-photo-{pid}.jpeg?auto=compress&cs=tinysrgb&w=960'
            raw=get(url)
            if len(raw)>20_000_000:raise ValueError('too large')
            with Image.open(io.BytesIO(raw)) as img:
                img=ImageOps.exif_transpose(img).convert('RGBA')
                if min(img.size)<300:raise ValueError('low resolution')
                img.thumbnail((480,480),Image.Resampling.LANCZOS)
                canvas=Image.new('RGBA',(480,480))
                canvas.alpha_composite(img,((480-img.width)//2,(480-img.height)//2))
                name=f'{code}-{index}.webp';canvas.save(OUT/name,'WEBP',quality=88,method=4)
            rows.append({'index':index,'source':page,'download':url,'preview':name,'license':'Pexels License','licenseUrl':'https://www.pexels.com/license/','status':'preview_ready','visual_review':'pending'})
        except Exception as e:rows.append({'index':index,'source':page,'status':'failed','error':str(e)})
    return code,rows
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=dict(pool.map(process,PLAN.items()))
(OUT/'candidates.json').write_text(json.dumps(results,indent=2))
items=list(results.items())
for offset in range(0,len(items),6):
    sheet=Image.new('RGB',(1050,6*190),'#182334');draw=ImageDraw.Draw(sheet)
    for row,(code,rows) in enumerate(items[offset:offset+6]):
        y=row*190;draw.text((8,y+7),code,fill='white')
        for candidate in rows:
            i=candidate['index']-1;x=i*350;draw.text((x+10,y+23),str(i+1)+' '+candidate['status'],fill='white')
            if candidate['status']=='preview_ready':
                with Image.open(OUT/candidate['preview']) as im:
                    im.thumbnail((320,145));sheet.paste(im,(x+(350-im.width)//2,y+40),im)
    sheet.save(OUT/f'sheet-{offset//6+1:02}.jpg',quality=92)
print('Preview images:',sum(c['status']=='preview_ready' for rows in results.values() for c in rows))
