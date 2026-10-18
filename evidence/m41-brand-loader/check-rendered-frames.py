"""Verify actual Chrome PNG frames; never changes the runtime SVG or assets."""
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageStat, ImageDraw

root = Path(__file__).parent
frames = [Image.open(root / f'loop-{t}.png').convert('RGB') for t in [0,1600,3200,4800,6400]]
def delta(a,b):
    image = ImageChops.difference(a,b)
    return {'maxChannelDelta': max(v[1] for v in image.getextrema()), 'meanChannelDelta': sum(ImageStat.Stat(image).mean)/3}
def mask(image):
    r,g,b = image.split()
    return ImageChops.darker(ImageChops.darker(r,g),b).point(lambda x:255 if x<250 else 0)
def occupied(image):
    return image.histogram()[255]
masks = [mask(f) for f in frames]
endpoint = delta(frames[0],frames[-1])
assert endpoint['maxChannelDelta'] <= 1, endpoint
ious=[]
for m in masks[1:]:
    intersection = occupied(ImageChops.multiply(masks[0],m))
    union = occupied(ImageChops.lighter(masks[0],m))
    ious.append(intersection/union)
assert min(ious)>.998, ious
midframes = [delta(frames[0],f) for f in frames[1:4]]
assert all(d['meanChannelDelta']>1 for d in midframes),midframes
assert all(f.getpixel((0,0))==(255,255,255) and f.getpixel((639,639))==(255,255,255) for f in frames)
reduced={}
for kind in ['direct','image']:
    reduced[kind]=delta(Image.open(root/f'reduced-{kind}-0.png').convert('RGB'),Image.open(root/f'reduced-{kind}-1.png').convert('RGB'))
    assert reduced[kind]['maxChannelDelta']==0,reduced[kind]
report={'endpoint0vs6400':endpoint,'silhouetteIoUsVsStart':ious,'midframesVsStart':midframes,'reducedMotion':reduced,'backdropCorners':'exact white for every loop frame','limitations':['Antialiased silhouette threshold permits subpixel color differences at its edge.','Quarter-cycle PNGs plus endpoint validate observed continuity; native SVG is the exact full runtime animation.']}
(root/'rendered-frame-results.json').write_text(json.dumps(report,indent=2)+'\n')
sheet=Image.new('RGB',(1200,268),'white');draw=ImageDraw.Draw(sheet)
for i,(frame,time) in enumerate(zip(frames,[0,1600,3200,4800,6400])):
    sheet.paste(frame.resize((240,240),Image.Resampling.LANCZOS),(i*240,0));draw.text((i*240+12,246),f'{time/1000:g}s',fill=(60,60,60))
sheet.save(root/'loop-contact-sheet.png')
print(json.dumps(report,indent=2))
