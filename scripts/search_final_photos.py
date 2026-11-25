"""Search up to 50 distinct licensed-photo candidates per item; never overwrite live assets."""
import concurrent.futures, hashlib, html, io, json, re, time, urllib.parse, urllib.request, urllib.error, threading
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
ROOT=Path(__file__).resolve().parent.parent
PLAN=json.loads((ROOT/'scripts/final-photo-search.json').read_text())
OUT=Path('/tmp/final-photo-candidates');OUT.mkdir(exist_ok=True)
UA='PredictionsCatalog/1.2 (https://github.com/seemsfunny21/predictions; licensed image research)'
# Bound requests to public services. No API-key requirement or rate-limit bypass.
lock=threading.Lock()
last={}
def get(url):
    host=urllib.parse.urlsplit(url).hostname
    interval=12.5 if host=='api.openverse.org' else 0.35 if host=='commons.wikimedia.org' else 0.12
    with lock:
        now=time.monotonic()
        slot=max(now,last.get(host,0)+interval)
        last[host]=slot
    time.sleep(max(0,slot-now))
    req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'*/*'})
    with urllib.request.urlopen(req,timeout=15) as r:
        return r.read(18_000_001)
def api(url,params):return json.loads(get(url+'?'+urllib.parse.urlencode(params)))
def clean(s):return html.unescape(re.sub(r'<[^>]*>','',str(s or ''))).strip()
def wiki(query):
    params={'action':'query','format':'json','generator':'search','gsrnamespace':6,'gsrsearch':query+' filetype:bitmap','gsrlimit':50,'prop':'imageinfo','iiprop':'url|extmetadata|size','iiurlwidth':960}
    for page in range(2):
        data=api('https://commons.wikimedia.org/w/api.php',params)
        pages=data.get('query',{}).get('pages',{})
        for p in sorted(pages.values(),key=lambda p:p.get('index',999)):
            try:
                i=p['imageinfo'][0];m=i['extmetadata']
                def val(k):return clean(m.get(k,{}).get('value',''))
                license=val('LicenseShortName')
                if not re.fullmatch(r'CC\s*BY(?:-SA)? [1-4][.][05]|CC\s*0(?: 1[.]0)?|Public domain|FAL',license,re.I):continue
                if not val('Artist') or min(i['width'],i['height'])<480:continue
                yield {'title':p['title'],'source':i['descriptionurl'],'url':i.get('thumburl') or i['url'],'author':val('Artist'),'license':license,'licenseUrl':val('LicenseUrl'),'provider':'wikimedia','license_verified_at_source':True}
            except (KeyError,IndexError):continue
        if not data.get('continue'):break
        params.update(data['continue'])
def openverse(query):
    data=api('https://api.openverse.org/v1/images/',{'q':query,'license':'by,by-sa,cc0,pdm','page_size':50,'category':'photograph','mature':'false'})
    for p in data.get('results',[]):
        if not p.get('creator') or not p.get('foreign_landing_url') or not p.get('license_url'):continue
        if p.get('license') not in ('by','by-sa','cc0','pdm'):continue
        yield {'title':p.get('title',''),'source':p['foreign_landing_url'],'url':p.get('url'),'thumbnail':p.get('thumbnail'),'author':p['creator'],'license':p['license'],'licenseUrl':p['license_url'],'provider':'openverse:'+str(p.get('provider','')),'license_verified_at_source':False}
def normalize(s):return re.sub(r'[^a-z0-9]','',s.lower())
def canonical(s):return urllib.parse.unquote(s).split('#')[0].rstrip('/').replace(' ','_')
def find(pair):
    code,spec=pair;rows=[];errors=[];seen=set();hashes=set()
    target=min(50,int(spec.get('target',50)))
    for engine in (wiki,openverse):
        for query in spec['queries']:
            if len(rows)>=target:break
            try:
                found=list(engine(query))
                if spec['exact_model']:
                    model=normalize(spec['exact_model'])
                    found.sort(key=lambda x:model not in normalize(x['title']))
                for c in found:
                    if len(rows)>=target:break
                    if not c.get('url'):continue
                    source=canonical(c['source'])
                    if source==canonical(spec['previous']) or source in seen:continue
                    if re.search(r'\b(logo|diagram|drawing|icon|poster|advertisement|screenshot)\b',c['title'],re.I):continue
                    seen.add(source)
                    try:
                        raw=get(c['url'])
                        if len(raw)>18_000_000:continue
                        with Image.open(io.BytesIO(raw)) as im:
                            im=ImageOps.exif_transpose(im).convert('RGBA')
                            if min(im.size)<480:continue
                            im.thumbnail((480,480),Image.Resampling.LANCZOS)
                            canvas=Image.new('RGBA',(480,480));canvas.alpha_composite(im,((480-im.width)//2,(480-im.height)//2))
                            pixelhash=hashlib.sha256(canvas.tobytes()).hexdigest()
                            if pixelhash in hashes:continue
                            hashes.add(pixelhash)
                            path=OUT/f'{code}-{len(rows)+1}.webp';canvas.save(path,'WEBP',quality=88,method=4)
                        c.update(preview=path.name,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),query=query,index=len(rows)+1)
                        rows.append(c)
                    except Exception as e:errors.append(str(e))
            except urllib.error.HTTPError as e:
                errors.append(engine.__name__+': '+str(e))
                if e.code in (403,429):break
            except Exception as e:errors.append(engine.__name__+': '+str(e))
    result={'previous':spec['previous'],'exact_model':spec['exact_model'],'target':target,'count':len(rows),'candidates':rows,'errors':errors[-10:]}
    (OUT/f'{code}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    for offset in range(0,len(rows),25):
        batch=rows[offset:offset+25]
        sheet=Image.new('RGB',(1500,5*300+45),'#182334');draw=ImageDraw.Draw(sheet)
        draw.text((12,12),f'{code} | {offset+1}-{offset+len(batch)} of {len(rows)}',fill='white')
        for j,c in enumerate(batch):
            x=(j%5)*300;y=45+(j//5)*300
            with Image.open(OUT/c['preview']) as im:
                im=im.convert('RGBA');im.thumbnail((280,250));sheet.paste(im,(x+(300-im.width)//2,y+25),im.getchannel('A'))
            draw.text((x+8,y+4),f"{c['index']} | {c['provider'][:29]}",fill='white')
        sheet.save(OUT/f'{code}-sheet-{offset//25+1:02}.jpg',quality=90)
    print(code,len(rows),'/',target,flush=True)
    return code,result
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:results=dict(pool.map(find,PLAN.items()))
(OUT/'candidates.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print('Candidates:',sum(len(v['candidates']) for v in results.values()),'Target:',sum(v['target'] for v in results.values()))
