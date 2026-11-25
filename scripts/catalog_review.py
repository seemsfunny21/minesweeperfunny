import json
from pathlib import Path
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parent.parent
report=json.loads((root/'photo-import-report.json').read_text())
photos=json.loads((root/'photo-catalog.js').read_text().strip()[len('const PRODUCT_PHOTOS='):-1])
assert len(photos)==142 and set(photos)==set(report)
output=Path('/tmp/catalog-review');output.mkdir(exist_ok=True)
items=sorted(photos.items())
for offset in range(0,len(items),24):
    sheet=Image.new('RGB',(1000,960),'#172334');draw=ImageDraw.Draw(sheet)
    for n,(code,p) in enumerate(items[offset:offset+24]):
        assert report[code]['status']=='saved' and p['src']=='./'+report[code]['path']
        with Image.open(root/report[code]['path']) as im:
            assert im.format=='WEBP' and im.size==(480,480)
            im=im.convert('RGBA');im.thumbnail((150,125))
            x=(n%6)*166;y=(n//6)*240
            sheet.paste(im,(x+(166-im.width)//2,y+12),im)
        for k in range(0,len(code),22):draw.text((x+4,y+150+k//22*15),code[k:k+22],fill='white')
    sheet.save(output/f'review-{offset//24+1:02}.jpg',quality=90)
print('142 local WebP files verified; visual review not yet performed')
