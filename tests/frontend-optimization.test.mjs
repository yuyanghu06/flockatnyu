import test from 'node:test';
import assert from 'node:assert/strict';
import {createAssistant} from '../src/assistant.js';
// Deliberately inert DOM/RAF: terminal paths must work even while no paint occurs.
class Node {
 constructor(tag){Object.assign(this,{tagName:tag,children:[],listeners:{},attributes:{},hidden:false,disabled:false,value:'',textContent:'',className:'',style:{},open:false,renders:0});}
 append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 get isConnected(){return this.tagName==='body'||Boolean(this.parent?.isConnected);}
 get classList(){return {add:(...values)=>{this.className=[...new Set([...this.className.split(/\s+/),...values])].join(' ').trim();},remove:(...values)=>{this.className=this.className.split(/\s+/).filter(v=>!values.includes(v)).join(' ');},contains:value=>this.className.split(/\s+/).includes(value)};}
 set innerHTML(value){this.html=value;this.renders++;}get innerHTML(){return this.html;}
 setAttribute(key,value){this.attributes[key]=value;}getAttribute(key){return this.attributes[key];}
 addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}removeEventListener(name,fn){this.listeners[name]=(this.listeners[name]??[]).filter(v=>v!==fn);}
 async emit(name,properties={}){const event={preventDefault(){},stopPropagation(){},...properties};for(const fn of this.listeners[name]??[])await fn(event);}
 showModal(){this.open=true;}close(){this.open=false;}focus(){document.activeElement=this;}
 getBoundingClientRect(){return {left:0,top:0,width:500,height:300,right:500,bottom:300};}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(v=>v!==this);}
 get firstElementChild(){return this.children[0];}
}
const all=node=>[node,...node.children.flatMap(all)],tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(mode){
 const names=['document','fetch','matchMedia','requestAnimationFrame','cancelAnimationFrame'],saved=Object.fromEntries(names.map(n=>[n,globalThis[n]]));
 const doc=new Node('document');doc.body=new Node('body');doc.createElement=tag=>new Node(tag);globalThis.document=doc;globalThis.matchMedia=()=>({matches:true});
 let seq=0,stream;const frames=new Map();globalThis.requestAnimationFrame=fn=>{frames.set(++seq,fn);return seq;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 globalThis.fetch=async(url,options)=>{if(url==='/api/status')return Response.json({chat:{configured:true},access:{allowed:true}});return new Response(new ReadableStream({start(c){stream=c;const enqueue=e=>c.enqueue(new TextEncoder().encode(JSON.stringify(e)+'\n'));enqueue({type:'meta',sources:[{title:'Synthetic source',url:'https://example.invalid/source'}]});enqueue({type:'tool',id:'tool-1',name:'read_discord_summary',status:'running'});for(let i=0;i<500;i++)enqueue({type:'delta',text:'abcdefghijklmnopqrstuvwx'});if(mode==='done'){enqueue({type:'tool',id:'tool-1',name:'read_discord_summary',status:'completed'});enqueue({type:'done'});c.close();}if(mode==='error'){enqueue({type:'error',message:'Fixture failure'});c.close();}options.signal.addEventListener('abort',()=>c.error(new DOMException('Stopped','AbortError')),{once:true});}}),{headers:{'content-type':'application/x-ndjson'}});};
 const ui=createAssistant();await doc.emit('campus-enter');await tick();ui.open();const find=predicate=>all(doc.body).find(predicate),input=find(n=>n.tagName==='textarea'),form=find(n=>n.className==='assistant-form');input.value='Synthetic burst';const pending=form.emit('submit');await tick();
 return {ui,pending,frames,find,stream,restore(){ui.dispose();for(const name of names)if(saved[name]===undefined)delete globalThis[name];else globalThis[name]=saved[name];}};
}
for(const mode of ['done','error','stop'])test('500 delta burst preserves every character with blocked RAF: '+mode,async()=>{
 const f=await setup(mode);try{if(mode==='stop')await f.find(n=>n.attributes['aria-label']==='Stop generating').emit('click');await f.pending;const content=f.find(n=>n.className.split(/\s+/).includes('assistant-markdown'));assert.equal(content.innerHTML.replace(/<[^>]*>/g,'').trimEnd(),'abcdefghijklmnopqrstuvwx'.repeat(500));assert(content.renders<=2,`Unbatched renders: ${content.renders}`);assert.equal(f.find(n=>n.className==='assistant-tool-state').textContent,{done:'Done',error:'Failed',stop:'Stopped'}[mode]);assert.equal(f.find(n=>n.tagName==='a'),undefined,'uncited retrieval metadata must not create footer links, including terminal/error/stop flushes');const before=content.innerHTML;for(const fn of [...f.frames.values()])fn(0);assert.equal(content.innerHTML,before);assert.equal(f.find(n=>n.className==='assistant-announcement').textContent,{done:'Reply complete.',error:'The reply could not finish.',stop:'Reply stopped.'}[mode]);}finally{f.restore();}
});
test('disposal before RAF cancels buffered render and queued callbacks cannot revive UI',async()=>{const f=await setup('pending');try{const callbacks=[...f.frames.values()],content=f.find(n=>n.className.split(/\s+/).includes('assistant-markdown'));f.ui.dispose();await f.pending;const before=content.renders;for(const fn of callbacks)fn(0);assert.equal(content.renders,before);assert.equal(document.body.children.length,0);}finally{f.restore();}});
