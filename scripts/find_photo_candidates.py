"""Find licensed candidates. Do not publish unreviewed pictures."""
import concurrent.futures, io, json, re, time, html, urllib.request, urllib.parse
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
ROOT=Path(__file__).resolve().parent.parent
SPEC=json.loads((ROOT/'scripts/photo-search-plan.json').read_text())
OUT=Path('/tmp/photo-candidates');OUT.mkdir(exist_ok=True)
def get(url):
    for i in range(2):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'PredictionsCatalog/1.0 (https://github.com/seemsfunny21/predictions; photo research)'}),timeout=15) as r:
                return r.read(18_000_001)
        except Exception:
            if i: raise
            time.sleep(2)
def clean(s):return html.unescape(re.sub(r'<[^>]*>','',s)).strip()
def find(query):
    params={'action':'query','format':'json','generator':'search','gsrnamespace':6,'gsrsearch':query+' filetype:bitmap','gsrlimit':12,'prop':'imageinfo','iiprop':'url|extmetadata|size','iiurlwidth':640}
    pages=json.loads(get('https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(params))).get('query',{}).get('pages',{})
    return sorted(pages.values(),key=lambda p:p.get('index',999))
def candidates(pair):
    code, spec=pair
    results=[];seen=set();errors=[]
    for query in spec['queries']:
        try: pages=find(query)
        except Exception as e:errors.append(str(e));continue
        for p in pages:
            try:
                i=p['imageinfo'][0];md=i['extmetadata']
                def val(k):return clean(md.get(k,{}).get('value',''))
                license=val('LicenseShortName');author=val('Artist')
                if not re.fullmatch(r'CC\s*BY(?:-SA)? [1-4][.][05]|CC\s*0(?: 1[.]0)?|Public domain|FAL',license,re.I) or not author:continue
                title=p['title'].removeprefix('File:')
                if title in seen or i['descriptionurl']==spec['previous'] or min(i['width'],i['height'])<480:continue
                if re.search(r'\b(logo|diagram|screenshot|drawing|icon|poster|advertisement|collage)\b',title,re.I):continue
                seen.add(title)
                data=get(i.get('thumburl') or i['url'])
                with Image.open(io.BytesIO(data)) as im:
                    im=ImageOps.exif_transpose(im).convert('RGBA');im.thumbnail((480,480))
                    canvas=Image.new('RGBA',(480,480));canvas.alpha_composite(im,((480-im.width)//2,(480-im.height)//2))
                    n=len(results)+1;name=f'{code}-{n}.webp';canvas.save(OUT/name,'WEBP',quality=88,method=4)
                results.append({'file':title,'source':i['descriptionurl'],'license':license,'author':author,'preview':name,'query':query})
                if len(results)>=3:break
            except Exception as e:errors.append(str(e))
        if len(results)>=3:break
    print(code,len(results),flush=True)
    return code,{'previous':spec['previous'],'candidates':results,'errors':errors[-3:]}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: results=dict(pool.map(candidates,SPEC.items()))
(OUT/'candidates.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
items=list(results.items())
for offset in range(0,len(items),8):
    sheet=Image.new('RGB',(900,8*170),'#182334');draw=ImageDraw.Draw(sheet)
    for row,(code,v) in enumerate(items[offset:offset+8]):
        y=row*170;draw.text((8,y+8),code,fill='white')
        for n,c in enumerate(v['candidates']):
            with Image.open(OUT/c['preview']) as im:
                im=im.convert('RGBA');im.thumbnail((260,135));x=8+n*300;sheet.paste(im,(x+(280-im.width)//2,y+25),im)
            draw.text((x,y+8),str(n+1),fill='white')
    sheet.save(OUT/f'sheet-{offset//8+1:02}.jpg',quality=90)
print('Candidate count:',sum(len(v['candidates']) for v in results.values()))
