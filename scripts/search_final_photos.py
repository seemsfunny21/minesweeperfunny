"""Search additional sources for pending catalog items; never publish unreviewed assets."""
import concurrent.futures, hashlib, html, io, json, re, time, urllib.parse, urllib.request
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
ROOT=Path(__file__).resolve().parent.parent
PLAN=json.loads((ROOT/'scripts/final-photo-search.json').read_text())
OUT=Path('/tmp/final-photo-candidates');OUT.mkdir(exist_ok=True)
UA='PredictionsCatalog/1.1 (https://github.com/seemsfunny21/predictions; licensed image research)'
def get(url):
    req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'*/*'})
    with urllib.request.urlopen(req,timeout=12) as r:
        return r.read(18_000_001)
def api(url,params):return json.loads(get(url+'?'+urllib.parse.urlencode(params)))
def clean(s):return html.unescape(re.sub(r'<[^>]*>','',str(s or ''))).strip()
def wiki(query):
    pages=api('https://commons.wikimedia.org/w/api.php',{'action':'query','format':'json','generator':'search','gsrnamespace':6,'gsrsearch':query+' filetype:bitmap','gsrlimit':20,'prop':'imageinfo','iiprop':'url|extmetadata|size','iiurlwidth':960}).get('query',{}).get('pages',{})
    for p in sorted(pages.values(),key=lambda p:p.get('index',999)):
        try:
            i=p['imageinfo'][0];m=i['extmetadata']
            def val(k):return clean(m.get(k,{}).get('value',''))
            license=val('LicenseShortName')
            if not re.fullmatch(r'CC\s*BY(?:-SA)? [1-4][.][05]|CC\s*0(?: 1[.]0)?|Public domain|FAL',license,re.I):continue
            if not val('Artist') or min(i['width'],i['height'])<480:continue
            yield {'title':p['title'],'source':i['descriptionurl'],'url':i.get('thumburl') or i['url'],'author':val('Artist'),'license':license,'licenseUrl':val('LicenseUrl'),'provider':'wikimedia','license_verified_at_source':True}
        except (KeyError,IndexError):continue
def openverse(query):
    data=api('https://api.openverse.org/v1/images/',{'q':query,'license':'by,by-sa,cc0,pdm','page_size':20,'category':'photograph','mature':'false'})
    for p in data.get('results',[]):
        if not p.get('creator') or not p.get('foreign_landing_url') or not p.get('license_url'):continue
        if p.get('license') not in ('by','by-sa','cc0','pdm'):continue
        # Openverse is a discovery index; license must be confirmed on original page before import.
        yield {'title':p.get('title',''),'source':p['foreign_landing_url'],'url':p.get('thumbnail') or p['url'],'original_url':p['url'],'author':p['creator'],'license':p['license'],'licenseUrl':p['license_url'],'provider':'openverse:'+str(p.get('provider','')),'license_verified_at_source':False}
def normalize(s):return re.sub(r'[^a-z0-9]','',s.lower())
def find(pair):
    code,spec=pair;rows=[];errors=[];seen=set()
    for engine in (wiki,openverse):
        count=0
        for query in spec['queries']:
            try:
                found=list(engine(query))
                if spec['exact_model']:
                    target=normalize(spec['exact_model'])
                    found.sort(key=lambda x:target not in normalize(x['title']))
                for c in found:
                    if c['source']==spec['previous'] or c['source'] in seen:continue
                    if re.search(r'\b(logo|diagram|drawing|icon|poster|advertisement|screenshot)\b',c['title'],re.I):continue
                    seen.add(c['source'])
                    try:
                        raw=get(c['url'])
                        if len(raw)>18_000_000:continue
                        with Image.open(io.BytesIO(raw)) as im:
                            im=ImageOps.exif_transpose(im).convert('RGBA')
                            if min(im.size)<320:continue
                            im.thumbnail((480,480),Image.Resampling.LANCZOS)
                            canvas=Image.new('RGBA',(480,480));canvas.alpha_composite(im,((480-im.width)//2,(480-im.height)//2))
                            path=OUT/f'{code}-{len(rows)+1}.webp';canvas.save(path,'WEBP',quality=88,method=4)
                        c.update(preview=path.name,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),query=query,index=len(rows)+1)
                        rows.append(c);count+=1
                        if count>=3:break
                    except Exception as e:errors.append(str(e))
                if count>=3:break
            except Exception as e:errors.append(engine.__name__+': '+str(e))
    print(code,len(rows),flush=True)
    return code,{'previous':spec['previous'],'exact_model':spec['exact_model'],'candidates':rows,'errors':errors[-6:]}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=dict(pool.map(find,PLAN.items()))
(OUT/'candidates.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
items=list(results.items())
for offset in range(0,len(items),4):
    sheet=Image.new('RGB',(1200,4*350),'#182334');draw=ImageDraw.Draw(sheet)
    for row,(code,v) in enumerate(items[offset:offset+4]):
        y=row*350;draw.text((8,y+8),code,fill='white')
        for j,c in enumerate(v['candidates']):
            x=(j%3)*400; yy=y+24+(j//3)*158
            with Image.open(OUT/c['preview']) as im:
                im=im.convert('RGBA');im.thumbnail((360,132));sheet.paste(im,(x+(400-im.width)//2,yy+20),im.getchannel('A'))
            draw.text((x+8,yy),str(c['index'])+' '+c['provider'][:30],fill='white')
    sheet.save(OUT/f'sheet-{offset//4+1:02}.jpg',quality=90)
print('Candidates:',sum(len(v['candidates']) for v in results.values()))
