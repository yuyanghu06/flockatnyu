"""Fetch an offline OSM campus snapshot; run from any directory with Python 3."""
import argparse
import collections
import datetime
import json
import math
from pathlib import Path
import urllib.parse
import urllib.request
import concurrent.futures

ROOT = Path(__file__).resolve().parents[1]
EXTENT = dict(minX=-960, maxX=960, minZ=-960, maxZ=1152)
LAT, LON = 40.73082, -73.99733
SX, SZ = 111320 * math.cos(math.radians(LAT)), 111320
ENDPOINT = 'https://overpass.private.coffee/api/interpreter'


def project(node):
    return [round((node['lon']-LON)*SX, 4), round((LAT-node['lat'])*SZ, 4)]


def inside(point, ring):
    x, z = point
    hit = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > z) != (b[1] > z) and x < (b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]:
            hit = not hit
    return hit


def stitch(parts):
    pending = [list(p) for p in parts if len(p) > 1]
    rings, unresolved = [], []
    while pending:
        chain = pending.pop(0)
        while chain[0] != chain[-1]:
            for i, p in enumerate(pending):
                if chain[-1] == p[0]: chain += p[1:]
                elif chain[-1] == p[-1]: chain += p[-2::-1]
                elif chain[0] == p[-1]: chain = p[:-1]+chain
                elif chain[0] == p[0]: chain = p[:0:-1]+chain
                else: continue
                pending.pop(i)
                break
            else: break
        (rings if chain[0] == chain[-1] else unresolved).append(chain)
    return rings, unresolved


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--reuse', action='store_true', help='Rebuild from the saved raw response without network')
    args = parser.parse_args()
    # Margin selects crossing features; complete ways/relations remain unclipped for renderer clipping.
    padding = 100
    bbox = [LAT-(EXTENT['maxZ']+padding)/SZ, LON+(EXTENT['minX']-padding)/SX,
            LAT-(EXTENT['minZ']-padding)/SZ, LON+(EXTENT['maxX']+padding)/SX]
    bounds = ','.join(f'{v:.9f}' for v in bbox)
    filters = ['["leisure"~"^(park|garden|playground|pitch|recreation_ground|common|nature_reserve)$"]',
               '["landuse"~"^(grass|recreation_ground|village_green|forest|meadow|flowerbed)$"]',
               '["natural"~"^(wood|grassland|scrub|water|wetland)$"]', '["landcover"="grass"]']
    query = '[out:json][timeout:180];(way["highway"]('+bounds+');'+''.join('nwr'+f+'('+bounds+');' for f in filters)+');out body;>;out skel qt;'
    evidence = ROOT/'evidence/m6-streets-parks'
    evidence.mkdir(parents=True, exist_ok=True)
    raw_path = evidence/'reference-overpass.json'
    if args.reuse:
        raw = json.loads(raw_path.read_text(encoding='utf-8'))
    else:
        request = urllib.request.Request(ENDPOINT, data=urllib.parse.urlencode({'data':query}).encode(), headers={'User-Agent':'NYU campus map offline snapshot'})
        try:
            with urllib.request.urlopen(request, timeout=200) as response: raw = json.load(response)
        except Exception as error:
            print('Overpass unavailable; using tiled official OSM map API:', error)
            def fetch(url):
                with urllib.request.urlopen(url, timeout=90) as response: return json.load(response)
            s,w,n,e = bbox
            urls = ['https://www.openstreetmap.org/api/0.6/map.json?bbox='+','.join(str(v) for v in (w+(e-w)*x/4,s+(n-s)*y/4,w+(e-w)*(x+1)/4,s+(n-s)*(y+1)/4)) for x in range(4) for y in range(4)]
            combined = {}
            with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
                for index,result in enumerate(pool.map(fetch, urls)):
                    print('OSM map tile',index+1,'/16')
                    for item in result['elements']: combined[(item['type'],item['id'])]=item
            def selected(tags):
                return 'highway' in tags or tags.get('leisure') in ('park','garden','playground','pitch','recreation_ground','common','nature_reserve') or tags.get('landuse') in ('grass','recreation_ground','village_green','forest','meadow','flowerbed') or tags.get('natural') in ('wood','grassland','scrub','water','wetland') or tags.get('landcover')=='grass'
            relations = [item for (typ,id),item in combined.items() if typ=='relation' and selected(item.get('tags',{}))]
            for rel in relations:
                result=fetch(f"https://www.openstreetmap.org/api/0.6/relation/{rel['id']}/full.json")
                for item in result['elements']: combined[(item['type'],item['id'])]=item
            wanted_ways={id for (typ,id),item in combined.items() if typ=='way' and selected(item.get('tags',{}))}
            wanted_ways.update(m['ref'] for r in relations for m in r['members'] if m['type']=='way')
            wanted_nodes={node for id in wanted_ways for node in combined[('way',id)]['nodes']}
            kept=[item for (typ,id),item in combined.items() if (typ=='node' and id in wanted_nodes) or (typ=='way' and id in wanted_ways) or (typ=='relation' and item in relations)]
            # Public contributor names/account IDs are irrelevant to geometry; retain object versions/timestamps.
            for item in kept:
                item.pop('user',None);item.pop('uid',None)
            urls += [f"https://www.openstreetmap.org/api/0.6/relation/{r['id']}/full.json" for r in relations]
            raw=dict(version=0.6,generator='Official OSM map API tiled fallback',sourceUrls=urls,osm3s={'timestamp_osm_base':None},elements=kept)
        if raw.get('remark'): raise RuntimeError(raw['remark'])
        raw['fetchedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
        raw_path.write_text(json.dumps(raw, separators=(',', ':')), encoding='utf-8')
    elements = {}
    for element in raw['elements']:
        key = (element['type'], element['id'])
        if key not in elements or 'tags' in element: elements[key] = element
    nodes = {id:e for (typ,id),e in elements.items() if typ == 'node'}
    ways = {id:e for (typ,id),e in elements.items() if typ == 'way'}
    points = lambda ids: [project(nodes[id]) for id in ids]
    roads, parks, failures, represented = [], [], [], set()
    for (typ,id),e in elements.items():
        if typ != 'relation' or not e.get('tags'): continue
        members = [m for m in e.get('members',[]) if m['type']=='way']
        outer, failed_o = stitch([ways[m['ref']]['nodes'] for m in members if m.get('role','') in ('','outer') and m['ref'] in ways])
        inner, failed_i = stitch([ways[m['ref']]['nodes'] for m in members if m.get('role') == 'inner' and m['ref'] in ways])
        failures.extend([{'relation':id,'unclosedNodeIds':r} for r in failed_o+failed_i])
        for index, ring in enumerate(outer):
            outline = points(ring)
            holes = [h for h in inner if inside(points(h)[0], outline)]
            ids = [ring]+holes
            parks.append(dict(id=f'relation/{id}:{index}',osmId=id,osmType='relation',tags=e['tags'],rings=[points(r) for r in ids],ringNodeIds=ids))
        represented.update(m['ref'] for m in members if m.get('role','') in ('','outer') and outer)
    for id, e in ways.items():
        tags, ids = e.get('tags',{}), e['nodes']
        if 'highway' in tags:
            roads.append(dict(id=f'way/{id}',osmId=id,osmType='way',tags=tags,nodeIds=ids,points=points(ids)))
        green = tags.get('leisure') in ('park','garden','playground','pitch','recreation_ground','common','nature_reserve') or tags.get('landuse') in ('grass','recreation_ground','village_green','forest','meadow','flowerbed') or tags.get('natural') in ('wood','grassland','scrub','water','wetland') or tags.get('landcover')=='grass'
        if green and id not in represented and len(ids)>3 and ids[0]==ids[-1]:
            parks.append(dict(id=f'way/{id}',osmId=id,osmType='way',tags=tags,rings=[points(ids)],ringNodeIds=[ids]))
    def intersects(p):
        return p and min(v[0] for v in p)<=EXTENT['maxX'] and max(v[0] for v in p)>=EXTENT['minX'] and min(v[1] for v in p)<=EXTENT['maxZ'] and max(v[1] for v in p)>=EXTENT['minZ']
    roads=[r for r in roads if intersects(r['points'])]
    parks=[p for p in parks if intersects(p['rings'][0])]
    used = set(n for r in roads for n in r['nodeIds']) | set(n for p in parks for ring in p['ringNodeIds'] for n in ring)
    runtime = json.loads((ROOT/'assets/yuyang-site-3d-assets/data/building-runtime.json').read_text())
    buildings = [{'sourceIndex':i,'points':p} for i,p in enumerate(runtime['footprints']) if p and min(v[0] for v in p)<EXTENT['maxX'] and max(v[0] for v in p)>EXTENT['minX'] and min(v[1] for v in p)<EXTENT['maxZ'] and max(v[1] for v in p)>EXTENT['minZ']]
    output = dict(version=1,metadata=dict(source='OpenStreetMap contributors',license='ODbL 1.0',attributionUrl='https://www.openstreetmap.org/copyright',endpoint=raw.get('sourceUrls',[ENDPOINT])[0],sourceUrls=raw.get('sourceUrls',[ENDPOINT]),osmTimestamp=raw.get('osm3s',{}).get('timestamp_osm_base'),fetchedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),extent=EXTENT,queryBbox=bbox,query=query,projection=dict(kind='local equirectangular',originLatitude=LAT,originLongitude=LON,metersPerDegreeLatitude=SZ,metersPerDegreeLongitude=SX,x='east',z='south',calibration='OSM arch way 248166269 matches all four exported corners within 0.0005 m'),buildingSource='assets/yuyang-site-3d-assets/data/building-runtime.json footprints; sourceIndex retained',unresolvedRings=failures),nodes={str(id):dict(lon=nodes[id]['lon'],lat=nodes[id]['lat'],point=project(nodes[id]),tags=nodes[id].get('tags',{})) for id in sorted(used)},roads=sorted(roads,key=lambda r:r['osmId']),parks=sorted(parks,key=lambda p:p['id']),buildings=buildings)
    output['metadata']['counts'] = dict(roads=len(roads),surfaces=len(parks),nodes=len(used),buildings=len(buildings),holes=sum(len(p['rings'])-1 for p in parks),unresolvedRings=len(failures),highways=dict(collections.Counter(r['tags']['highway'] for r in roads)))
    output['metadata']['fetchedAt']=raw.get('fetchedAt',datetime.datetime.fromtimestamp(raw_path.stat().st_mtime,datetime.timezone.utc).isoformat())
    target=ROOT/'assets/campus-assets/data/streets-parks.json'
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(output,separators=(',',':')),encoding='utf-8')
    print(json.dumps(output['metadata']['counts'],indent=2));print(target, target.stat().st_size)


if __name__ == '__main__': main()
