import json, hashlib
from pathlib import Path
from PIL import Image, ImageChops, ImageStat, ImageDraw

root=Path(__file__).parent
detail=json.loads((root/'native-speed-results.json').read_text())['checks'][0]['detail']
paths=sorted(root.glob('loop-*.png'),key=lambda p:float(p.stem[5:]))
assert len(paths)==5
frames=[Image.open(p).convert('RGB') for p in paths]
def delta(a,b):
    d=ImageChops.difference(a,b)
    return {'maximum':max(e[1] for e in d.getextrema()),'mean':sum(ImageStat.Stat(d).mean)/3}
def mask(image):
    r,g,b=image.split()
    return ImageChops.darker(ImageChops.darker(r,g),b).point(lambda x:255 if x<250 else 0)
endpoint=delta(frames[0],frames[-1]);assert endpoint['maximum']==0,endpoint
mid=[delta(frames[0],f) for f in frames[1:4]]
assert all(d['mean']>1 for d in mid),mid
masks=[mask(f) for f in frames]
ious=[ImageChops.multiply(masks[0],m).histogram()[255]/ImageChops.lighter(masks[0],m).histogram()[255] for m in masks[1:]]
assert min(ious)>.998,ious
prior=root.parent/'m41-loader-contours'
samephase=[delta(f,Image.open(prior/f'loop-{t}.png').convert('RGB')) for f,t in zip(frames,[0,800,1600,2400,3200])]
assert all(d['maximum']<=1 for d in samephase),samephase
before=json.loads((root/'pre-revision-hashes.json').read_text())
after={p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in before}
assert before==after
report={'actualPeriodMs':detail['duration'],'speedRatioVs3200ms':3200/detail['duration'],'timesMs':detail['times'],'endpoint':endpoint,'midframes':mid,'silhouetteIoUs':ious,'normalizedPhaseDeltasVsPriorContour':samephase,'unchangedStaticAndStartupSha256':after}
(root/'rendered-speed-results.json').write_text(json.dumps(report,indent=2)+'\n')
sheet=Image.new('RGB',(1200,268),'white');draw=ImageDraw.Draw(sheet)
for i,(image,t) in enumerate(zip(frames,detail['times'])):
    sheet.paste(image.resize((240,240),Image.Resampling.LANCZOS),(i*240,0));draw.text((i*240+12,246),f'{t/1000:.3f}s',fill=(60,60,60))
sheet.save(root/'loop-contact-sheet.png')
print(json.dumps(report,indent=2))
