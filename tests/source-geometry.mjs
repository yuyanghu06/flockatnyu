import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder': MeshoptDecoder});
const metadata = JSON.parse(fs.readFileSync('assets/campus-assets/data/extracted-buildings.json','utf8')).buildings['nyu-john-a-paulson-center'];
function inPolygon(x,z,polygon) {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const [ax,az]=polygon[i], [bx,bz]=polygon[j];
    if((az>z)!==(bz>z) && x<(bx-ax)*(z-az)/(bz-az)+ax) inside=!inside;
  }
  return inside;
}
const doc=await io.read('assets/yuyang-site-3d-assets/models/buildings/city-tiles/'+metadata.replaces.tile);
const result={tile:metadata.replaces.tile,totalTriangles:0,centroidsInside:0,insideHeightRange:[Infinity,-Infinity]};
const triangles=[];
for(const node of doc.getRoot().listNodes()) {
  if(!node.getMesh()) continue;
  const m=node.getWorldMatrix();
  for(const primitive of node.getMesh().listPrimitives()) {
    const pos=primitive.getAttribute('POSITION'),idx=primitive.getIndices();
    const count=idx?.getCount()??pos.getCount();
    for(let i=0;i<count;i+=3) {
      const vertices=[];
      for(let k=0;k<3;k++) {
        const p=pos.getElement(idx?idx.getScalar(i+k):i+k,[]);
        vertices.push([m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]]);
      }
      result.totalTriangles++;
      triangles.push(vertices);
      const x=vertices.reduce((n,p)=>n+p[0],0)/3,z=vertices.reduce((n,p)=>n+p[2],0)/3;
      if(inPolygon(x,z,metadata.replaces.footprint)) {
        result.centroidsInside++;
        for(const p of vertices) {result.insideHeightRange[0]=Math.min(result.insideHeightRange[0],p[1]);result.insideHeightRange[1]=Math.max(result.insideHeightRange[1],p[1]);}
      }
    }
  }
}
// Independently identify connected shells by shared world-space coordinates,
// without importing the application's polygon-removal implementation.
const parents=triangles.map((_,i)=>i),vertexOwners=new Map();
function root(i){while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;}
triangles.forEach((triangle,i)=>triangle.forEach(point=>{
  const key=point.map(x=>x.toFixed(4)).join(',');
  if(vertexOwners.has(key))parents[root(i)]=root(vertexOwners.get(key));else vertexOwners.set(key,i);
}));
const components=new Map();
triangles.forEach((triangle,i)=>{const id=root(i);if(!components.has(id))components.set(id,[]);components.get(id).push(triangle);});
result.componentsTouchingColes=[];
for(const component of components.values()){
  const hits=component.filter(triangle=>inPolygon(triangle.reduce((n,p)=>n+p[0],0)/3,triangle.reduce((n,p)=>n+p[2],0)/3,metadata.replaces.footprint)).length;
  if(!hits)continue;
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  component.flat().forEach(p=>p.forEach((v,k)=>{bounds.min[k]=Math.min(bounds.min[k],v);bounds.max[k]=Math.max(bounds.max[k],v);}));
  result.componentsTouchingColes.push({triangles:component.length,strictCentroidHits:hits,bounds});
}
result.connectedComponents=components.size;
const out=process.env.MAP_EVIDENCE??'evidence/m3-campus-details';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(`${out}/source-tile-check.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
