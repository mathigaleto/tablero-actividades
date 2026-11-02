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

const CONFIG={url:'https://hpggyvhsqqzuxexnmqql.supabase.co',key:'sb_publishable_zfPEmnzdIZaSg1vfI87SLg_Rn5H8FEw'};
const $=s=>document.querySelector(s);
let session;try{session=JSON.parse(sessionStorage.getItem('tablero-session'))}catch{}
let refreshFlight;
async function fetchWithTimeout(url,options={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{return await fetch(url,{...options,cache:'no-store',signal:controller.signal})}catch(e){throw Error(e.name==='AbortError'?'El servidor tardó demasiado en responder.':'No hay conexión con el servidor.')}finally{clearTimeout(timer)}}

async function authCall(path,data){const r=await fetchWithTimeout(CONFIG.url+'/auth/v1/'+path,{method:'POST',headers:{apikey:CONFIG.key,'Content-Type':'application/json'},body:JSON.stringify(data)});const b=await r.json();if(!r.ok)throw Error(b.msg||b.error_description||b.message||'No se pudo iniciar sesión');return b}
function storeSession(s){session=s;s.expires_at=Date.now()+s.expires_in*1000;sessionStorage.setItem('tablero-session',JSON.stringify(s))}
async function token(force=false){if(!session)throw Error('Iniciá sesión');if(force||!session.expires_at||session.expires_at<Date.now()+90000){refreshFlight??=authCall('token?grant_type=refresh_token',{refresh_token:session.refresh_token}).then(storeSession).finally(()=>refreshFlight=null);await refreshFlight}return session.access_token}
async function api(action,data={}){const send=async access=>fetchWithTimeout(CONFIG.url+'/functions/v1/tablero-api',{method:'POST',headers:{apikey:CONFIG.key,Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify({action,...data})});const access=await token();let r=await send(access);if(r.status===401&&session){const renewed=session.access_token!==access?session.access_token:await token(true);r=await send(renewed)}const b=await r.json();if(!r.ok)throw Object.assign(Error(b.error||'No se pudo completar la operación'),{status:r.status});return b}
// Refresh in the background without navigating away from a form on connection errors.
const renewSession=()=>{if(session)token().catch(()=>{})};
setInterval(renewSession,60000);window.addEventListener('focus',renewSession);window.addEventListener('online',renewSession);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)renewSession()});
async function logout(){try{await fetchWithTimeout(CONFIG.url+'/auth/v1/logout',{method:'POST',headers:{apikey:CONFIG.key,Authorization:'Bearer '+await token()}})}catch{}sessionStorage.removeItem('tablero-session');location.href='./'}
window.tablero={api,logout};
window.boardReady=(async()=>{
 if(!document.body.dataset.board)return;
 const {clone,merge,content}=TableroSync;
 const bar=document.createElement('div');bar.id='sync-toolbar';bar.style='display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 24px;background:#eaf3ef;color:#263e53;font:14px "Segoe UI",system-ui,sans-serif';
 const status=document.createElement('span');status.id='server-status';status.setAttribute('role','status');status.textContent='Cargando actividades…';
 const actions=document.createElement('div');bar.append(status,actions);document.body.prepend(bar);
 let me,displayed,latest,pending=null,queue=null,busy=false,blocked=false,reading=null,disposed=false;
 const editing=()=>!!document.querySelector('.task-dialog[open],#people-dialog[open],#companies-dialog[open],#identity-dialog[open]');
 const timestamp=()=>new Intl.DateTimeFormat('es-PY',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date());
 function setStatus(text,error=false){status.textContent=text;bar.style.background=error?'#fff0df':'#eaf3ef'}
 function apply(next){
  latest=next;pending=next;
  if(busy||queue||blocked||editing()){pending=next;return false}
  const state={...(window.openai?.widgetState?.privateContent||{}),...clone(next.data),currentUser:me.name};
  if(window.tablero.applyBoard)window.tablero.applyBoard(state);
  else window.dispatchEvent(new CustomEvent('openai:set_globals',{detail:{globals:{widgetState:{privateContent:state}}}}));
  window.openai.widgetState={privateContent:state};displayed=clone(next.data);pending=null;
  return true;
 }
 function lock(message){
  blocked=true;setStatus(message+' · Para recargar, usá el botón del navegador.',true);
  const download=document.createElement('button');download.type='button';download.textContent='Descargar cambios pendientes';download.onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(window.openai.widgetState.privateContent,null,2)],{type:'application/json'}));a.download='actividades-pendientes.json';a.click();URL.revokeObjectURL(a.href)};actions.prepend(download);
  // A failed save must not dismiss a different activity already being edited.
  const active=document.querySelector('dialog[open]');if(active){let note=active.querySelector('.save-warning');if(!note){note=document.createElement('p');note.className='save-warning';note.setAttribute('role','alert');(active.querySelector('.modal-foot')||active).prepend(note)}note.textContent='El guardado anterior requiere atención. Podés conservar lo que estás escribiendo; no se cerrará este formulario.'}
 }
 async function poll(manual=false){
  if(disposed||busy||queue||blocked||!me)return;
  if(reading)return reading;
  reading=(async()=>{
   try{
    const next=await api('read');if(disposed||busy||queue||blocked)return;
    if(!latest||next.revision>latest.revision){
     if(apply(next))setStatus('Actualizado a las '+timestamp()+' · '+me.name);
     else setStatus('Hay cambios de otras personas. Se mostrarán al cerrar el formulario.');
    }else if(pending&&!editing()){
     if(apply(pending))setStatus('Actualizado a las '+timestamp()+' · '+me.name);
    }else if(!pending)setStatus((manual?'Ya tenés los últimos cambios':'Sincronizado')+' · '+timestamp()+' · '+me.name);
   }catch(e){setStatus('No se pudo actualizar. '+e.message+' · Volveremos a intentarlo.',true)}
  })().finally(()=>reading=null);
  return reading;
 }
 async function save(){
  if(busy||blocked||!queue)return;busy=true;
  const draft=queue;queue=null;setStatus('Guardando cambios…');
  try{
   let result,remote,payload;
   for(let attempt=0;attempt<3;attempt++){
    remote=await api('read');payload=merge(draft.base,draft.data,remote.data);
    try{result=await api('write',{revision:remote.revision,data:payload});break}catch(e){if(e.status!==409||attempt===2)throw e}
   }
   latest={revision:result.revision,data:payload};
   // Read canonical comments and audit entries assigned by the server.
   try{const canonical=await api('read');if(canonical.revision>=latest.revision)latest=canonical}catch{}
   pending=latest;setStatus('Guardado en servidor · '+timestamp()+' · '+me.name);
  }catch(e){queue=draft;lock(e.message)}finally{
   busy=false;
   if(queue&&!blocked)save();else if(pending&&!blocked&&!editing()){
    try{apply(pending)}catch(e){lock('Los datos se guardaron, pero no se pudieron mostrar: '+e.message)}
   }
  }
 }
 try{
  const initial=await Promise.all([api('me'),api('read')]);me=initial[0];latest=initial[1];displayed=clone(latest.data);window.tablero.me=me;
  window.openai={widgetState:{privateContent:{...clone(displayed),currentUser:me.name}},async setWidgetState(value){
   const p=value.privateContent;this.widgetState=value;
   const data=clone({tasks:p.tasks,people:p.people,companies:p.companies,auditHistory:p.auditHistory});
   if(content(data)!==content(displayed)){queue={data,base:clone(displayed)};save()}
  }};
  setStatus('Conectado · '+me.name+' · Actualización automática cada 5 segundos');
  const afterClose=()=>{if(busy||queue||blocked||editing())return;if(pending){try{if(apply(pending))setStatus('Actualizado a las '+timestamp()+' · '+me.name)}catch(e){setStatus('No se pudieron mostrar los cambios: '+e.message,true)}}else poll()};
  document.addEventListener('close',afterClose,true);
  window.addEventListener('focus',()=>poll());window.addEventListener('online',()=>poll());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll()});
  let timer=setInterval(()=>{if(!document.hidden)poll()},5000);
  window.addEventListener('pagehide',()=>{disposed=true;clearInterval(timer)});
  window.addEventListener('pageshow',e=>{if(e.persisted){disposed=false;timer=setInterval(()=>{if(!document.hidden)poll()},5000);poll()}});
  const markDraft=e=>{const dialog=e.target.closest?.('dialog[open]');if(dialog)dialog.dataset.unsaved='true'};
  document.addEventListener('input',markDraft);document.addEventListener('change',markDraft);
  document.addEventListener('reset',e=>{const dialog=e.target.closest?.('dialog');if(dialog)delete dialog.dataset.unsaved},true);
  document.addEventListener('close',e=>{if(e.target.matches?.('dialog')){delete e.target.dataset.unsaved;e.target.querySelector('.save-warning')?.remove()}},true);
  window.addEventListener('beforeunload',e=>{if(busy||queue||document.querySelector('dialog[open][data-unsaved="true"]')){e.preventDefault();e.returnValue='Hay cambios sin guardar'}});
 }catch(e){
  if(e.status===401||e.status===403||!session){sessionStorage.removeItem('tablero-session');location.replace('./?sesion=1')}
  else{setStatus('No se pudieron cargar las actividades. '+e.message+' · Reintentá con el botón de recarga del navegador.',true)}
  throw e;
 }
})();

document.addEventListener('DOMContentLoaded',()=>{
 $('#login-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.target,b=$('#message');f.querySelector('button').disabled=true;b.textContent='Ingresando…';try{storeSession(await authCall('token?grant_type=password',{email:f.username.value.trim().toLowerCase()+'@cuentas.tablero.invalid',password:f.password.value}));await api('me');location.href='tablero.html?v=20261102-working1'}catch{b.textContent='No se pudo ingresar. Revisá el usuario y la contraseña.'}finally{f.querySelector('button').disabled=false}});
 $('#logout')?.addEventListener('click',logout);
 $('#password-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.target;try{if(f.password.value.length<10)throw Error('La contraseña debe tener al menos 10 caracteres.');await authCall('token?grant_type=password',{email:session.user.email,password:f.current.value});const r=await fetchWithTimeout(CONFIG.url+'/auth/v1/user',{method:'PUT',headers:{apikey:CONFIG.key,Authorization:'Bearer '+await token(),'Content-Type':'application/json'},body:JSON.stringify({password:f.password.value})});if(!r.ok)throw Error('No se pudo cambiar la contraseña');$('#message').textContent='Contraseña actualizada.';f.reset()}catch(e){$('#message').textContent=e.message}});
});
