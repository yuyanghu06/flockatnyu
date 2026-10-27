import {readFile} from 'node:fs/promises';

// Vite accepts bare JSON imports; Node needs the data inlined for these tests.
// Resolve JavaScript imports against the real config file before using a data URL.
const url=new URL('../../src/map/data/config.js',import.meta.url);
let source=await readFile(url,'utf8');
const jsonImports=[...source.matchAll(/import (\w+) from '([^']+\.json)';/g)];
for(const [statement,name,path] of jsonImports) {
  const data=await readFile(new URL(path,url),'utf8');
  source=source.replace(statement,`const ${name}=${data};`);
}
source=source.replace(/(from\s*['"])(\.\.?\/[^'"]+)(['"])/g,
  (_,prefix,path,suffix)=>prefix+new URL(path,url).href+suffix);
export const mapConfig=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
