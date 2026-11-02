(function(global){
 const clone=value=>JSON.parse(JSON.stringify(value));
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const commentKey=c=>JSON.stringify([c.author,c.text]);
 const conflict=label=>{throw Error('Dos personas modificaron '+label+'. Descargá tu copia pendiente antes de recargar.')};
 function comments(base=[],local=[],remote=[],label){
  const keys=list=>list.map(commentKey);
  if(equal(keys(local),keys(base)))return clone(remote);
  if(equal(keys(remote),keys(base)))return clone(local);
  if(base.some((c,i)=>commentKey(c)!==commentKey(local[i]||{})||commentKey(c)!==commentKey(remote[i]||{})))return conflict(label);
  const result=clone(remote),available=new Map();
  for(const c of remote.slice(base.length)){const k=commentKey(c);available.set(k,(available.get(k)||0)+1)}
  for(const c of local.slice(base.length)){const k=commentKey(c),n=available.get(k)||0;if(n)available.set(k,n-1);else result.push(clone(c))}
  return result;
 }
 function record(base,local,remote,label){
  if(equal(local,base))return clone(remote);
  if(equal(remote,base)||equal(local,remote))return clone(local);
  const result={};
  for(const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
   if(key==='comments'){result[key]=comments(base[key],local[key],remote[key],label);continue}
   const b=base[key],l=local[key],r=remote[key];let value;
   if(equal(l,b))value=r;else if(equal(r,b)||equal(l,r))value=l;else return conflict(label+' ('+key+')');
   if(value!==undefined)result[key]=clone(value);
  }
  return result;
 }
 function records(base,local,remote,key,label){
  const bm=new Map(base.map(x=>[String(x[key]),x])),lm=new Map(local.map(x=>[String(x[key]),x])),rm=new Map(remote.map(x=>[String(x[key]),x]));
  const result=[];
  for(const id of new Set([...rm.keys(),...lm.keys()])){
   const b=bm.get(id),l=lm.get(id),r=rm.get(id);
   if(!b){if(l&&r&&!equal(l,r))return conflict(label);result.push(clone(l||r));continue}
   if(!l&&!r)continue;
   if(!l){if(!equal(r,b))return conflict(label);continue}
   if(!r){if(!equal(l,b))return conflict(label);continue}
   result.push(record(b,l,r,label));
  }
  return result;
 }
 function merge(base,local,remote){
  const companies=new Set(remote.companies);
  for(const name of base.companies)if(!local.companies.includes(name))companies.delete(name);
  for(const name of local.companies)if(!base.companies.includes(name))companies.add(name);
  return {tasks:records(base.tasks,local.tasks,remote.tasks,'id','la misma actividad'),people:records(base.people,local.people,remote.people,'name','la misma persona'),companies:[...companies],auditHistory:remote.auditHistory||[]};
 }
 const content=data=>JSON.stringify({tasks:data.tasks,people:data.people,companies:data.companies});
 global.TableroSync={clone,merge,content};
})(globalThis);
