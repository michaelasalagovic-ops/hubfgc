import {endpoint,apikey} from './config.js';

let session=JSON.parse(sessionStorage.getItem('fcg-session')||'null');
let refreshing;
export let isAdmin=false;
const fileUrls=new Map();
const main=document.querySelector('#main');

async function auth(path,body,token){
  return fetch(endpoint+'/auth/v1/'+path,{
    method:'POST',headers:{apikey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
    body:JSON.stringify(body)
  });
}
function saveSession(next){
  session=next;
  sessionStorage.setItem('fcg-session',JSON.stringify(next));
}
async function token(){
  if(!session) throw Error('Přihlaste se.');
  if(session.expires_at*1000>Date.now()+60000)return session.access_token;
  if(!refreshing) refreshing=(async()=>{
    const response=await auth('token?grant_type=refresh_token',{refresh_token:session.refresh_token});
    if(!response.ok){
      if(response.status===400||response.status===401){sessionStorage.removeItem('fcg-session');location.reload();}
      throw Error('Přihlášení se nepodařilo obnovit.');
    }
    saveSession(await response.json());return session.access_token;
  })().finally(()=>{refreshing=null;});
  return refreshing;
}
export async function api(path,options={}){
  return fetch(endpoint+path,{...options,headers:{apikey,Authorization:'Bearer '+await token(),...options.headers}});
}
async function role(){
  const res=await api('/rest/v1/rpc/fcg_can_write',{method:'POST'});
  if(!res.ok||!await res.json()) throw Error('Tento účet nemá přístup do týmu FCG.');
  const admin=await api('/rest/v1/rpc/fcg_is_admin',{method:'POST'});
  if(!admin.ok)throw Error('Oprávnění se nepodařilo načíst.');
  isAdmin=await admin.json();
}
export async function start(){
  let message='';
  if(session){
    try{await role();return;}catch(error){message=error.message;sessionStorage.removeItem('fcg-session');session=null;}
  }
  document.querySelector('#sync').textContent='Přihlášení';
  main.innerHTML='<div class="heading"><h1>FyzioGym Cooper</h1></div><form class="panel form-grid" id="login"><h2 class="wide">Přihlášení do hubu</h2><label class="field">E-mail<input required type="email" name="email" autocomplete="username"></label><label class="field">Heslo do hubu<input required type="password" name="password" autocomplete="current-password"></label><div class="actions wide"><button class="btn primary">Přihlásit</button></div><small class="wide">Přístup pro kolegy zakládá správce FCG.</small><p role="status" class="wide"></p></form>';
  const form=main.querySelector('form'),status=form.querySelector('[role=status]');
  status.textContent=message;
  await new Promise(resolve=>form.onsubmit=async event=>{
    event.preventDefault();form.querySelector('button').disabled=true;
    try{
      const res=await auth('token?grant_type=password',{email:form.email.value.trim(),password:form.password.value});
      if(!res.ok)throw Error('Přihlášení se nezdařilo. Zkontrolujte e-mail a heslo do hubu.');
      saveSession(await res.json());await role();form.reset();resolve();
    }catch(e){status.textContent=e.message;}finally{form.querySelector('button').disabled=false;}
  });
}
export async function signOut(){
  try{await auth('logout?scope=local',{},await token());}finally{sessionStorage.removeItem('fcg-session');location.reload();}
}
export async function loadRecords(){
  const records=[];
  for(let offset=0;;offset+=500){
    const r=await api('/rest/v1/fcg_records?select=id,version,deleted,record&order=id&limit=500&offset='+offset);
    if(!r.ok)throw Error('Načtení dat selhalo.');
    const page=await r.json();records.push(...page);
    if(page.length<500)return records;
  }
}
export async function saveRecord(id,version,record,deleted,exists){
  const edit=exists;
  const path='/rest/v1/fcg_records'+(edit?'?id=eq.'+encodeURIComponent(id)+'&version=eq.'+version:'');
  const result=await api(path,{method:edit?'PATCH':'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({id,version:version+1,record,deleted})});
  if(!result.ok)return result;
  const rows=await result.json();
  return rows.length?Response.json({version:rows[0].version}):new Response(null,{status:409});
}
export async function upload(file,folder){
  const ext=file.name.split('.').pop().toLowerCase();
  const image=folder==='images';
  const sizes=image?10:20;
  if(file.size>sizes*1024*1024)throw Error('Soubor je příliš velký.');
  const head=new Uint8Array(await file.slice(0,12).arrayBuffer());
  const ascii=String.fromCharCode(...head);
  const ok=image?({'image/png':head[0]===137&&ascii.slice(1,4)==='PNG','image/jpeg':head[0]===255&&head[1]===216,'image/gif':ascii.startsWith('GIF8'),'image/webp':ascii.startsWith('RIFF')&&ascii.endsWith('WEBP')}[file.type]):
    (ext==='pdf'?ascii.startsWith('%PDF-'):['pptx','docx','xlsx'].includes(ext)&&ascii.startsWith('PK'));
  if(!ok)throw Error('Nepodporovaný formát souboru.');
  const key=folder+'/'+crypto.randomUUID()+(image?'':'.'+ext);
  const r=await api('/storage/v1/object/fcg-files/'+key,{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});
  if(!r.ok)throw Error('Soubor se nepodařilo uložit.');
  return '/api/'+key;
}
export async function fileUrl(path){
  if(fileUrls.has(path))return fileUrls.get(path);
  const key=path.replace(/^\/api\//,'');
  let blob;
  if(/^documents\/(brand-book\.(docx|pdf)|strategie\.docx|linkedin-manual\.docx|manual-loga\.pdf)$/.test(key)){
    const r=await api('/rest/v1/fcg_original_files?name=eq.'+key.split('/')[1]+'&select=mime,bytes');
    if(!r.ok)throw Error('Soubor nelze otevřít.');
    const [f]=await r.json();if(!f)throw Error('Soubor nenalezen.');
    blob=new Blob([Uint8Array.from(atob(f.bytes),c=>c.charCodeAt(0))],{type:f.mime});
  }else{
    const r=await api('/storage/v1/object/authenticated/fcg-files/'+key);
    if(!r.ok)throw Error('Soubor nelze otevřít.');blob=await r.blob();
  }
  const ext=key.split('.').pop();
  const formats={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
  if(key.startsWith('documents/'))blob=blob.slice(0,blob.size,formats[ext]||'application/octet-stream');
  else if(!['image/jpeg','image/png','image/gif','image/webp'].includes(blob.type))throw Error('Neplatný typ obrázku.');
  const url=URL.createObjectURL(blob);fileUrls.set(path,url);return url;
}
export function accountPanel(){
  return '<h1>Správa účtu</h1><form class="form-grid panel" data-password><label class="field">Nové heslo do hubu<input type="password" name="password" minlength="12" autocomplete="new-password" required></label><button class="btn">Změnit vlastní heslo</button></form>'+
    (isAdmin?'<h2>Uživatelé hubu</h2><ul data-members></ul><form class="form-grid panel" data-member><label class="field">E-mail kolegy<input name="email" required type="email"></label><label class="field">Počáteční heslo pro nový účet<input name="password" type="password" minlength="12" autocomplete="new-password"></label><button class="btn primary">Povolit zápis</button></form>':'')+
    '<p role="status" data-account-status></p><button class="btn" data-signout>Odhlásit se</button>';
}
export async function bindAccount(){
  const status=main.querySelector('[data-account-status]');
  main.querySelector('[data-signout]').onclick=signOut;
  main.querySelector('[data-password]').onsubmit=async e=>{
    e.preventDefault();const form=e.currentTarget;
    try{const r=await api('/auth/v1/user',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:form.password.value})});if(!r.ok)throw Error();form.reset();status.textContent='Heslo bylo změněno.';}catch{status.textContent='Změna hesla selhala.';}
  };
  if(!isAdmin)return;
  const list=main.querySelector('[data-members]');
  async function refresh(){
    const r=await api('/rest/v1/fcg_members?select=email&order=email');if(!r.ok)throw Error();
    const rows=await r.json();list.replaceChildren();
    for(const row of rows){
      const li=document.createElement('li');li.textContent=row.email+' ';
      const remove=document.createElement('button');remove.className='btn';remove.textContent='Odebrat přístup';
      remove.onclick=async()=>{if(!confirm('Odebrat přístup pro '+row.email+'?'))return;const response=await api('/rest/v1/fcg_members?email=eq.'+encodeURIComponent(row.email),{method:'DELETE'});if(response.ok)await refresh();else status.textContent='Změna se nepodařila.';};
      li.append(remove);list.append(li);
    }
  }
  main.querySelector('[data-member]').onsubmit=async e=>{
    e.preventDefault();const form=e.currentTarget,button=form.querySelector('button');button.disabled=true;
    try{
      const r=await api('/functions/v1/fcg-member',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:form.email.value.trim(),password:form.password.value})});
      if(!r.ok)throw Error((await r.json()).error||'Změna se nepodařila.');
      form.reset();await refresh();status.textContent='Přístup uložen. U nového účtu předejte kolegovi počáteční heslo soukromě.';
    }catch(err){status.textContent=err.message;}finally{button.disabled=false;}
  };
  try{await refresh();}catch{status.textContent='Seznam uživatelů se nepodařilo načíst.';}
}
