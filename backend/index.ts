import {createClient} from 'npm:@supabase/supabase-js@2.90.1';
const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const allowed='https://mathigaleto.github.io';
const cors={'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
const fail=(message:string,status=400)=>{throw Object.assign(Error(message),{status})};
const email=(name:string)=>name+'@cuentas.tablero.invalid';
const valid=(u:any)=>u&&typeof u.username==='string'&&/^[a-z0-9._-]{3,60}$/.test(u.username)&&typeof u.password==='string'&&u.password.length>=10&&u.password.length<=200;
async function create(u:any,admin=false){
 if(!valid(u))fail('Usuario o contraseña inválidos (mínimo 10 caracteres)');
 const {data,error}=await supabase.auth.admin.createUser({email:email(u.username),password:u.password,email_confirm:true,user_metadata:{name:u.username}});
 if(error||!data.user)fail('No se pudo crear: el usuario puede existir o los datos no son válidos');
 const {error:memberError}=await supabase.from('tablero_members').insert({id:data.user.id,username:u.username,name:u.username,admin});
 if(memberError){await supabase.auth.admin.deleteUser(data.user.id);fail('No se pudo guardar la cuenta')}
 return data.user.id;
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return reply({error:'Método no permitido'},405);
 const origin=req.headers.get('origin');if(origin&&origin!==allowed)return reply({error:'Origen no permitido'},403);
 try{
 const text=await req.text();if(text.length>1500000)fail('Contenido demasiado grande',413);let b;try{b=JSON.parse(text)}catch{fail('JSON inválido')}
 const bearer=req.headers.get('Authorization')?.replace(/^Bearer /i,'');if(!bearer)fail('Iniciá sesión',401);
 const {data:identity,error:authError}=await supabase.auth.getUser(bearer);if(authError||!identity.user)fail('Sesión inválida',401);
 const {data:me,error:memberError}=await supabase.from('tablero_members').select('*').eq('id',identity.user.id).single();if(memberError||!me?.active)fail('Cuenta sin acceso al tablero',403);
 me.name=me.username;
 if(b.action==='me')return reply(me);
 if(b.action==='read'){const {data,error}=await supabase.from('tablero_state').select('revision,data').eq('id',1).single();if(error)fail('No se pudo cargar el tablero',500);return reply(data)}
 if(b.action==='write'){
  const d=b.data;if(!d||!Array.isArray(d.tasks)||!Array.isArray(d.people)||!Array.isArray(d.companies)||!Number.isInteger(b.revision))fail('Datos inválidos');
  if(d.tasks.length>10000||d.people.length>10000||d.companies.length>1000)fail('Demasiados registros');
  const ids=new Set();for(const t of d.tasks){if(!t||!['string','number'].includes(typeof t.id)||ids.has(String(t.id))||typeof t.company!=='string'||t.company.length>200||typeof t.description!=='string'||t.description.length>10000||!['Sin tarea','Asignado','Completado'].includes(t.status))fail('Actividad inválida');ids.add(String(t.id));if(t.url&&(typeof t.url!=='string'||!/^https?:\/\//i.test(t.url)))fail('El enlace de actividad debe comenzar por http:// o https://');for(const f of ['owner','service'])if(t[f]!==undefined&&(typeof t[f]!=='string'||t[f].length>200))fail('Persona inválida');if(t.comments!==undefined&&(!Array.isArray(t.comments)||t.comments.length>1000||t.comments.some((c:any)=>!c||typeof c.text!=='string'||c.text.length>3000||typeof c.author!=='string'||typeof c.timestamp!=='string')))fail('Comentario inválido')}
  if(d.companies.some((c:any)=>typeof c!=='string'||c.length>200)||d.people.some((p:any)=>!p||typeof p.name!=='string'||p.name.length>200||!Array.isArray(p.roles)||p.roles.some((r:any)=>!['owner','service'].includes(r))))fail('Directorio inválido');
  const {data:previous,error:readError}=await supabase.from('tablero_state').select('data,revision').eq('id',1).single();if(readError)fail('No se pudo cargar',500);if(previous.revision!==b.revision)fail('Otra persona guardó cambios. Descargá lo pendiente y recargá antes de continuar.',409);
  const oldTasks=new Map(previous.data.tasks.map((t:any)=>[String(t.id),t]));
  for(const t of d.tasks){const old:any=oldTasks.get(String(t.id));const oldComments=old?.comments||[];if(t.comments){if(oldComments.some((c:any,i:number)=>c.text!==t.comments[i]?.text))fail('Los comentarios guardados no se pueden modificar');t.comments=t.comments.map((c:any,i:number)=>i<oldComments.length?oldComments[i]:{...c,author:me.name,timestamp:new Date().toISOString()})}}
  const changes=[];for(const t of d.tasks){const old:any=oldTasks.get(String(t.id));if(!old)changes.push('Agregó actividad: '+t.description);else if(JSON.stringify(old)!==JSON.stringify(t))changes.push('Editó o comentó actividad: '+t.description);oldTasks.delete(String(t.id))}for(const old of oldTasks.values() as any)changes.push('Eliminó actividad: '+old.description);if(JSON.stringify(previous.data.people)!==JSON.stringify(d.people))changes.push('Actualizó personas');if(JSON.stringify(previous.data.companies)!==JSON.stringify(d.companies))changes.push('Actualizó empresas');
  const history=[...(previous.data.auditHistory||[])];if(changes.length)history.push({user:me.name,timestamp:new Date().toISOString(),changes});
  const payload={tasks:d.tasks,people:d.people,companies:d.companies,auditHistory:history.slice(-15)};
  const {data:revision,error}=await supabase.rpc('tablero_save',{expected:b.revision,payload,actor_id:me.id});if(error)fail(error.message.includes('revision_conflict')?'Otra persona guardó cambios. Descargá lo pendiente y recargá.':'No se pudieron guardar los cambios',error.message.includes('revision_conflict')?409:500);return reply({revision});
 }
 if(!me.admin)fail('Solo administradores',403);
 if(b.action==='users'){const {data,error}=await supabase.from('tablero_members').select('*').order('username');if(error)fail('No se pudieron cargar las cuentas',500);return reply(data)}
 if(b.action==='create-users'){
  if(!Array.isArray(b.users)||!b.users.length||b.users.length>50||!b.users.every(valid))fail('Revisá el formato. Máximo 50 usuarios y contraseñas de 10 caracteres como mínimo');
  const results=[];for(const u of b.users){try{await create(u);results.push({username:u.username,ok:true})}catch(e){results.push({username:u.username,ok:false,error:e.message})}}return reply({results});
 }
 if(b.action==='update-user'){
  if(b.id===me.id)fail('Usá Mi cuenta para cambiar tu contraseña');const {data:target}=await supabase.from('tablero_members').select('id').eq('id',b.id).single();if(!target)fail('Cuenta inexistente',404);
  if(b.password!==undefined){if(typeof b.password!=='string'||b.password.length<10||b.password.length>200)fail('Contraseña inválida');const {error}=await supabase.auth.admin.updateUserById(b.id,{password:b.password});if(error)fail('No se pudo actualizar la contraseña',500)}
  else if(typeof b.active==='boolean'){const {error}=await supabase.from('tablero_members').update({active:b.active}).eq('id',b.id);if(error)fail('No se pudo actualizar la cuenta',500)}else fail('Operación inválida');return reply({ok:true});
 }
 fail('Operación no encontrada',404);
 }catch(e){return reply({error:e.status?e.message:'No se pudo completar la operación'},e.status||500)}
});

