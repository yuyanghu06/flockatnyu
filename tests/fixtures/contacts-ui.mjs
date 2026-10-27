import {createApp} from '../../server/runtime/app.js';
import {readConfig} from '../../server/shared/config.js';
import {createSiteAuth,readSiteAuthConfig} from '../../server/auth/site-auth.js';
import {contactStorage,contactRow,contactIds} from './contacts-store.mjs';

export {contactRow,contactIds};
export function contactsHttpFixture({rows,production=true,readUnavailable=false,writeFailure,conflict=false,auth,discordFailure=false}={}){
 const f=contactStorage({rows,readUnavailable,writeFailure,conflict}),mode={},audit=[];
 const store={...f.store};
 for(const name of ['search','read','create','update','delete'])store[name]=async args=>{
  if(mode[name]==='throw')throw Error('PRIVATE synthetic backend details must stay private');
  if(mode[name]==='unknown-after'){await f.store[name](args);return {status:'unavailable',reason:'write_outcome_unknown'};}
  if(mode[name])return {status:mode[name]};
  return f.store[name](args);
 };
 const config=readConfig({NODE_ENV:production?'production':'development',DISCORD_GUILD_ID:'123'}),origin=production?'https://contacts.example.test':'http://127.0.0.1';
 const siteAuth=createSiteAuth({config:readSiteAuthConfig({PUBLIC_ORIGIN:'https://contacts.example.test',SITE_ACCESS_PASSWORD:'synthetic-contacts-password',SITE_SESSION_SECRET:'synthetic-contacts-secret-with-over-32-characters',SITE_DISCORD_ENABLED:'true'}),apiConfig:config});
 const cookie=siteAuth.issue('synthetic-contacts-password').split(';')[0];
 let discordCalls=0;
 const discordStore=discordFailure?{configured:true,getPolicy:async()=>{discordCalls++;throw Error('Synthetic Discord outage');},listSyncChannels:async()=>{discordCalls++;throw Error('Synthetic Discord outage');}}:undefined;
 const app=createApp({config,contactsStore:store,...(production?{auth:auth??siteAuth.auth}:auth?{auth}:{}),...(discordStore?{discordStore}:{}),provider:{},audit:{recordEvent:async entry=>audit.push(entry)}});
 const request=(path='/api/contacts',{method='GET',body,headers={},session=true,env}={})=>app.fetch(new Request(origin+path,{method,headers:{...(session?{cookie}:{}),...(method==='GET'?{}:{origin,'content-type':'application/json'}),...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})}),env);
 return {app,f,store,mode,config,origin,siteAuth,cookie,request,audit,get discordCalls(){return discordCalls;}};
}

export function contactsBrowserRows(){
 return [contactRow(contactIds.rae,{legacy:{preserve:'exact original value'},notes:'Prefers email. <img src=x onerror="window.contactsInjected=true">'}),
  ...Array.from({length:13},(_,i)=>contactRow(`42000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,{
   first_name:['Morgan','Casey','Jordan','Avery','Taylor','Sam','Alex','Jamie','Cameron','Drew','Blair','Robin','Quinn'][i],
   last_name:'Example',email:`member${i+1}@example.com`,workplace:i%2?'Example Studio':'Demo Labs',notes:`Synthetic member ${i+1}; available for project introductions.`
  }))];
}
