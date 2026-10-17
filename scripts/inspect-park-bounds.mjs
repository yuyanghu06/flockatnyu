import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'meshoptimizer';
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
for(const name of ['park-grass','washington-square-fountain','courant-garden','washington-square-trees']){const b=fs.readFileSync(`yuyang-site-3d-assets/models/environment/${name}.glb`);const {scene}=await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');console.log(name,new THREE.Box3().setFromObject(scene));}
