# Incremental authenticated state response

Edge version 22. Insert helper before Deno.serve, replace reply(await state(a)) with reply(await compactState(a,b.state_known)). Old clients omit state_known and receive normal full responses. No user data or credentials are stored in this file.

```ts
function stateParts(out:any){
 const parts:any=Object.create(null);
 function person(p:any){if(!p||typeof p!=="object")return p;const {avatar,...rest}=p;if(p.id&&typeof avatar==="string"&&avatar)parts["avatar:"+p.id]=avatar;return rest;}
 for(const [key,value] of Object.entries(out)){
  if(value===undefined)continue;
  if(key==="player")parts["root:"+key]=person(value);
  else if((key==="players"||key==="accounts")&&Array.isArray(value))parts["root:"+key]=value.map(person);
  else if(["game","bank","departure","shop","casino"].includes(key)&&value&&typeof value==="object"&&!Array.isArray(value)){
   parts["fields:"+key]=Object.keys(value);
   for(const [sub,v] of Object.entries(value))if(v!==undefined)parts[key+":"+sub]=v;
  }else parts["root:"+key]=value;
 }
 return parts;
}
async function compactState(a:any,known:any){
 const out=await state(a);
 if(known===undefined)return out;
 if(!known||typeof known!=="object"||Array.isArray(known)||Object.keys(known).length>1200)known={};
 const parts=stateParts(out),hashes:any=Object.create(null),changed:any=Object.create(null);
 for(const [key,value] of Object.entries(parts)){
  const digest=await sha(JSON.stringify(value));hashes[key]=digest;
  if(!Object.prototype.hasOwnProperty.call(known,key)||known[key]!==digest)changed[key]=value;
 }
 return {state_delta:1,hashes,changed};
}
```
