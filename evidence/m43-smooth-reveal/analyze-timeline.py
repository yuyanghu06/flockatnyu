import json, sys, bisect
from pathlib import Path
from PIL import Image, ImageChops, ImageStat, ImageFilter, ImageDraw

root=Path(sys.argv[1]);data=json.loads((root/'reveal-browser-results.json').read_text());trace=data['trace']
states=trace['states'];ready=next(s['wall'] for s in states if s.get('phase')=='logo-exit');back=next(s['wall'] for s in states if s.get('phase')=='backdrop-exit');entered=next(s['wall'] for s in states if s.get('app')=='entered')
frames=[dict(f,capture=f['metadata'].get('timestamp',f['wall']/1000)*1000) for f in data['frames']]
samples=trace['samples'];times=[s['wall'] for s in samples]
def pose(t):
    i=max(0,min(len(samples)-2,bisect.bisect_right(times,t)-1));a,b=samples[i:i+2];f=max(0,min(1,(t-a['wall'])/(b['wall']-a['wall'])))
    return {'box':{k:a['box'][k]+(b['box'][k]-a['box'][k])*f for k in a['box']},'opacity':a['logoOpacity']+(b['logoOpacity']-a['logoOpacity'])*f,'scale':a['scale']+(b['scale']-a['scale'])*f}
def normalized(frame):
    image=Image.open(root/frame['filename']).convert('RGB');s=pose(frame['capture']);b=s['box'];sx=image.width/data['viewport']['width'];sy=image.height/data['viewport']['height'];x,y,w,h=[b[k]*factor for k,factor in [('x',sx),('y',sy),('width',sx),('height',sy)]]
    bounds=[round(x),round(y),round(x+w),round(y+h)];patch=Image.new('RGB',(max(1,bounds[2]-bounds[0]),max(1,bounds[3]-bounds[1])),'white');clipped=[max(0,bounds[0]),max(0,bounds[1]),min(image.width,bounds[2]),min(image.height,bounds[3])];patch.paste(image.crop(clipped),(clipped[0]-bounds[0],clipped[1]-bounds[1]));patch=patch.resize((160,160),Image.Resampling.BILINEAR)
    alpha=max(.01,s['opacity']);patch=patch.point(lambda p:max(0,min(255,round(255-(255-p)/alpha))))
    return patch,s
maskImage=Image.open(Path(__file__).parent.parent/'m41-loader-contours/motion-240/00.png').convert('RGB').resize((160,160));r,g,b=maskImage.split();mask=ImageChops.darker(ImageChops.darker(r,g),b).point(lambda x:255 if x<220 else 0).filter(ImageFilter.MinFilter(5))
targets=[(-450,'before ready -450ms'),(-80,'before ready -80ms'),(100,'logo +100ms'),(300,'logo +300ms'),(500,'logo +500ms'),(800,'logo +800ms')];selected=[];sheet=Image.new('RGB',(960,190),'white');draw=ImageDraw.Draw(sheet)
for i,(offset,label) in enumerate(targets):
    frame=min(frames,key=lambda f:abs(f['capture']-(ready+offset)));patch,s=normalized(frame);patch.save(root/f'normalized-{i}.png');sheet.paste(patch,(i*160,0));draw.text((i*160+4,165),label,fill=(35,35,35));selected.append({'filename':frame['filename'],'captureRelativeReadyMs':frame['capture']-ready,'scale':s['scale'],'opacity':s['opacity']})
sheet.save(root/'normalized-motion-contact.png')
def difference(i,j):
    a=Image.open(root/f'normalized-{i}.png').convert('RGB');b=Image.open(root/f'normalized-{j}.png').convert('RGB');return sum(ImageStat.Stat(ImageChops.difference(a,b),mask=mask).mean)/3
vf=trace['presented'];vgaps=[{'milliseconds':b['wall']-a['wall'],'fromMediaTime':a['mediaTime'],'toMediaTime':b['mediaTime'],'presentedFrameAdvance':b['presentedFrames']-a['presentedFrames'],'relativeReadyStartMs':a['wall']-ready} for a,b in zip(vf,vf[1:])];sgaps=[{'milliseconds':b['capture']-a['capture'],'from':a['filename'],'to':b['filename'],'relativeReadyStartMs':a['capture']-ready} for a,b in zip(frames,frames[1:])]
result={'phasesMs':{'logo':back-ready,'white':entered-back},'largestVideoCallbackGaps':sorted(vgaps,key=lambda x:x['milliseconds'],reverse=True)[:5],'largestCompositorCaptureGaps':sorted(sgaps,key=lambda x:x['milliseconds'],reverse=True)[:5],'longtasks':trace['longtasks'],'sampledPixels':selected,'beforeReadyCompensatedColorDifference':difference(0,1),'earlyToMidZoomCompensatedColorDifference':difference(2,3),'midZoomCompensatedColorDifference':difference(3,4),'limitations':['Logo crops compensate scale and opacity; JPEG and interpolation introduce noise, especially near invisibility.','Screencast frames and main-thread callbacks are measured separately; neither is a physical-device FPS benchmark.']}
(root/'timeline-analysis.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='longtasks'},indent=2))
