import hashlib, json
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parent.parent
prefix='const PRODUCT_PHOTOS='
catalog=root/'photo-catalog.js'
report_path=root/'photo-import-report.json'
quality_path=root/'photo-quality-review.json'
audit_path=root/'photo-visual-audit.json'
photos=json.loads(catalog.read_text().strip()[len(prefix):-1])
report=json.loads(report_path.read_text())
quality=json.loads(quality_path.read_text())
audit=json.loads(audit_path.read_text())
plan=json.loads((root/'scripts/pexels-approved.json').read_text())
previews=Path('/tmp/approved-pexels')
pending=[]
# Verify all candidates before replacing any existing file.
for code,p in plan.items():
    if photos[code]['source']==p['source']:continue
    assert photos[code]['source']==p['previous'],f'Source changed: {code}'
    assert photos[code]['src']=='./'+p['path']
    data=(previews/p['preview']).read_bytes()
    assert hashlib.sha256(data).hexdigest()==p['sha256'],f'Unexpected preview bytes: {code}'
    with Image.open(previews/p['preview']) as im:
        assert im.format=='WEBP' and im.size==(480,480)
        im.verify()
    pending.append((code,p,data))
for code,p,data in pending:
    (root/p['path']).write_bytes(data)
    meta={k:p[k] for k in ('source','author','license','licenseUrl','representative')}
    meta['modified']='Resized and converted to WebP; centered on 480×480 canvas for use in the game interface'
    photos[code]={'src':'./'+p['path'],**meta}
    report[code]={'status':'saved','source':p['source'],'license':p['license'],'representative':True,'path':p['path']}
    quality[code]={'status':'replaced','previous':p['previous'],'source':p['source'],'visual_review':'approved_candidate_contact_sheet','sha256':p['sha256']}
    audit['entries'][code].update({'candidate_review':'selected','candidate_artifact':15060515371,'current_source':p['source'],'publication':'verified_local_bytes','final_visual_review':'pending_published_catalog_review'})
catalog.write_text(prefix+json.dumps(photos,ensure_ascii=False,separators=(',',':'))+';\n')
for path,value in [(report_path,report),(quality_path,quality),(audit_path,audit)]:path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
print('Verified and imported',len(pending),'reviewed Pexels application assets')
