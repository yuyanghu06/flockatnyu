import json, struct, hashlib
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageStat

root=Path(__file__).parent
data=Path('assets/branding/favicon.ico').read_bytes()
reserved,kind,count=struct.unpack_from('<HHH',data)
assert (reserved,kind,count)==(0,1,3)
entries=[]
for i in range(count):
    w,h,colors,zero,planes,bits,size,offset=struct.unpack_from('<BBBBHHII',data,6+i*16)
    w,h=w or 256,h or 256
    assert offset+size<=len(data)
    entries.append({'width':w,'height':h,'bits':bits,'size':size,'offset':offset})
assert sorted((e['width'],e['height']) for e in entries)==[(16,16),(32,32),(48,48)]
ico=Image.open('assets/branding/favicon.ico')
assert ico.ico.sizes()=={(16,16),(32,32),(48,48)}
details=[]
for size in [16,32,48]:
    image=ico.ico.getimage((size,size)).convert('RGB');image.save(root/f'icon-{size}.png')
    ink={(x,y) for y in range(size) for x in range(size) if min(image.getpixel((x,y)))<245}
    strong={(x,y) for x,y in ink if min(image.getpixel((x,y)))<220}
    assert all(0<x<size-1 and 0<y<size-1 for x,y in strong),'Solid logo stroke touches crop edge'
    white={(x,y) for y in range(size) for x in range(size)}-ink
    counters=[]
    while white:
        seed=white.pop();component={seed};todo=[seed]
        while todo:
            x,y=todo.pop()
            for p in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
                if p in white:white.remove(p);component.add(p);todo.append(p)
        if not any(x in [0,size-1] or y in [0,size-1] for x,y in component):counters.append(len(component))
    assert counters and max(counters)>=2,'Inner counter is lost at small size'
    details.append({'size':size,'inkBounds':[min(x for x,y in ink),min(y for x,y in ink),max(x for x,y in ink),max(y for x,y in ink)],'enclosedCounterAreas':counters})
def diff(a,b):
    d=ImageChops.difference(Image.open(root/a).convert('RGB'),Image.open(root/b).convert('RGB'))
    return {'maxChannelDelta':max(e[1] for e in d.getextrema()),'meanChannelDelta':sum(ImageStat.Stat(d).mean)/3}
still=diff('favicon-0.png','favicon-500.png');phase=diff('favicon-0.png','loader-phase-zero-cropped.png')
assert still['maxChannelDelta']==0
assert phase['maxChannelDelta']<=1
baseline=json.loads((root/'pre-favicon-hashes.json').read_text());current={f:hashlib.sha256(Path(f).read_bytes()).hexdigest() for f in baseline};assert current==baseline
report={'icoBytes':len(data),'headerEntries':entries,'decodedSmallIcons':details,'static500ms':still,'actualPhaseZero':phase,'unchangedLoaderAndStaticSha256':current}
(root/'pixel-icon-results.json').write_text(json.dumps(report,indent=2)+'\n')
sheet=Image.new('RGB',(600,300),'white');draw=ImageDraw.Draw(sheet)
for i,size in enumerate([16,32,48]):
    image=ico.ico.getimage((size,size)).convert('RGB')
    sheet.paste(image.resize((160,160),Image.Resampling.NEAREST),(i*200+20,20))
    sheet.paste(image,(i*200+20,220));draw.text((i*200+20,195),f'{size}px (pixels enlarged above)',fill=(40,40,40))
sheet.save(root/'small-icon-contact.png')
print(json.dumps(report,indent=2))
