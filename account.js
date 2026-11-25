import {endpoint,apikey} from './config.js';

let session=JSON.parse(sessionStorage.getItem('fcg-session')||'null');
let refreshing;
export let isAdmin=false;
export let canWrite=false;
export const sectionLabels={roadmapa:'Roadmapa',meetingy:'Meetingy',dokumenty:'Dokumenty',web:'Web',strategie:'Značka a nabídka',some:'SoMe'};
export let allowedSections=[];
export async function refreshSections(){
  const response=await api('/rest/v1/rpc/fcg_my_sections',{method:'POST'});
  if(!response.ok)throw Error('Oprávnění k sekcím se nepodařilo načíst.');
  allowedSections=await response.json();
}
export const currentUserId=()=>session?.user?.id;
export const currentUserEmail=()=>session?.user?.email;

export async function loadAssignees(){
  const response=await api('/rest/v1/rpc/fcg_task_assignees',{method:'POST'});
  if(!response.ok)throw Error('Seznam uživatelů se nepodařilo načíst.');
  return response.json();
}
export async function loadSocialReviewers(){
  const response=await api('/rest/v1/rpc/fcg_social_reviewers',{method:'POST'});
  if(!response.ok)throw Error('Schvalovatele se nepodařilo načíst.');
  return (await response.json()).map(row=>row.user_id);
}
export async function loadAssigneeEmails(){
  const response=await api('/rest/v1/rpc/fcg_task_assignee_emails',{method:'POST'});
  if(!response.ok)throw Error('E-maily držitelů se nepodařilo načíst.');
  return response.json();
}
const roleLabels={admin:'Administrátor',editor:'Editor',reader:'Čtenář'};
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
  const res=await api('/rest/v1/rpc/fcg_can_read',{method:'POST'});
  if(!res.ok||!await res.json()) throw Error('Tento účet nemá přístup do týmu FCG.');
  const [admin,write]=await Promise.all([
    api('/rest/v1/rpc/fcg_is_admin',{method:'POST'}),
    api('/rest/v1/rpc/fcg_can_write',{method:'POST'})
  ]);
  if(!admin.ok||!write.ok)throw Error('Oprávnění se nepodařilo načíst.');
  isAdmin=await admin.json();
  canWrite=await write.json();
  await refreshSections();
}
function showPasswordReset(accessToken){
  document.querySelector('#sync').textContent='Obnova hesla';
  main.innerHTML='<form class="panel form-grid"><h2 class="wide">Nastavit nové heslo</h2><label class="field">Nové heslo<input type="password" name="password" required minlength="12" autocomplete="new-password"></label><div class="actions wide"><button type="submit" class="btn primary">Uložit nové heslo</button><a class="btn" href="./">Zpět k přihlášení</a></div><p class="wide" role="status" aria-live="polite"></p></form>';
  const form=main.querySelector('form');
  const button=form.querySelector('button');
  const status=form.querySelector('[role=status]');
  form.onsubmit=async event=>{
    event.preventDefault();
    button.disabled=true;
    try{
      const response=await fetch(endpoint+'/auth/v1/user',{
        method:'PUT',headers:{apikey,Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
        body:JSON.stringify({password:form.elements.password.value})
      });
      if(response.status===401||response.status===403)throw Error('Odkaz vypršel. Vyžádejte si nový odkaz k obnově.');
      if(!response.ok)throw Error('Heslo se nepodařilo uložit. Zvolte nové heslo o alespoň 12 znacích.');
      await auth('logout?scope=local',{},accessToken).catch(()=>{});
      form.reset();
      location.replace(location.pathname+'?heslo=ulozeno');
    }catch(error){
      status.textContent=error.message;
    }finally{
      button.disabled=false;
    }
  };
}
export async function start(){
  const fragment=new URLSearchParams(location.hash.slice(1));
  const recoveryToken=fragment.get('type')==='recovery'&&fragment.get('access_token');
  const recoveryError=fragment.has('error_code');
  if(recoveryToken||recoveryError||fragment.has('access_token')){
    history.replaceState(null,'',location.pathname+location.search);
  }
  if(recoveryToken){
    sessionStorage.removeItem('fcg-session');
    showPasswordReset(recoveryToken);
    return new Promise(()=>{});
  }
  let message=recoveryError?'Odkaz je neplatný nebo vypršel. Vyžádejte si nový odkaz.':
    new URLSearchParams(location.search).get('heslo')==='ulozeno'?'Heslo bylo změněno. Přihlaste se novým heslem.':'';
  if(message&&location.search)history.replaceState(null,'',location.pathname);
  if(session){
    try{await role();return;}catch(error){message=error.message;sessionStorage.removeItem('fcg-session');session=null;}
  }
  document.querySelector('#sync').textContent='Přihlášení';
  main.innerHTML='<div class="heading"><h1>FyzioGym Cooper</h1></div><form class="panel form-grid" id="login"><h2 class="wide">Přihlášení do hubu</h2><label class="field">E-mail<input required type="email" name="email" autocomplete="username"></label><label class="field">Heslo do hubu<input required type="password" name="password" autocomplete="current-password"></label><div class="actions wide"><button class="btn primary">Přihlásit</button><button type="button" class="btn" data-recover>Zapomenuté heslo</button></div><small class="wide">Přístup pro kolegy zakládá správce FCG.</small><p role="status" class="wide"></p></form>';
  const form=main.querySelector('form'),status=form.querySelector('[role=status]');
  status.textContent=message;
  const reset=form.querySelector('[data-recover]');
  reset.onclick=async()=>{
    const email=form.elements.email;
    if(!email.reportValidity())return;
    reset.disabled=true;
    try{
      const redirect=new URL('./',location.href).href;
      const response=await auth('recover?redirect_to='+encodeURIComponent(redirect),{email:email.value.trim()});
      if(response.status===429)throw Error('Odkaz nyní nelze odeslat kvůli limitu. Zkuste to později.');
      if(!response.ok)throw Error('Obnovu hesla se nepodařilo spustit. Zkuste to prosím později.');
      status.textContent='Pokud je pro tuto adresu obnova dostupná, přijde vám e-mail s odkazem.';
    }catch(error){
      status.textContent=error.message;
    }finally{
      reset.disabled=false;
    }
  };
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
const socialFormats={jpg:'image/jpeg',png:'image/png',webp:'image/webp',mp4:'video/mp4'};
export async function uploadSocialMedia(file){
  const head=new Uint8Array(await file.slice(0,12).arrayBuffer());
  const header=String.fromCharCode(...head);
  const extension=head[0]===255&&head[1]===216?'jpg':
    head[0]===137&&header.slice(1,4)==='PNG'?'png':
    header.startsWith('RIFF')&&header.endsWith('WEBP')?'webp':
    header.slice(4,8)==='ftyp'?'mp4':'';
  if(!extension)throw Error('Vyberte fotku JPG, PNG, WebP nebo video MP4.');
  if(file.size>20*1024*1024)throw Error('Soubor může mít nejvýše 20 MB. Větší soubor přidejte odkazem z Google Disku.');
  const key='social/'+crypto.randomUUID()+'.'+extension;
  const response=await api('/storage/v1/object/fcg-files/'+key,{method:'POST',
    headers:{'Content-Type':socialFormats[extension]},body:file});
  if(!response.ok)throw Error('Soubor „'+file.name+'“ se nepodařilo nahrát.');
  return {name:file.name,path:'/api/'+key};
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
  else if(key.startsWith('social/')){
    if(!Object.hasOwn(socialFormats,ext)||blob.type!==socialFormats[ext])throw Error('Nepodporovaný typ přílohy.');
  }
  else if(!['image/jpeg','image/png','image/gif','image/webp'].includes(blob.type))throw Error('Neplatný typ obrázku.');
  const url=URL.createObjectURL(blob);fileUrls.set(path,url);return url;
}
export function accountPanel(){
  if(!isAdmin)return '';
  return '<div class="heading"><div><h1>Nastavení</h1><p>Vaše role v HUBu: <strong>'+roleLabels.admin+'</strong></p></div></div>'+
    '<form class="form-grid panel account-name" data-display-name><label class="field">Zobrazované jméno v HUBu<input name="displayName" type="text" maxlength="60" required></label><button type="submit" class="btn">Uložit jméno</button><small class="wide" data-name-hint></small><p class="wide" role="status" data-name-status></p></form>'+
    '<form class="form-grid panel" data-password><label class="field">Nové heslo do hubu<input type="password" name="password" minlength="12" autocomplete="new-password" required></label><button class="btn">Změnit vlastní heslo</button></form>'+
    '<h2>Uživatelé hubu</h2><div class="table-wrap"><table class="table"><thead><tr><th scope="col">E-mail</th><th scope="col">Role v HUBu</th><th scope="col">Přihlašovací účet</th><th scope="col">Povolené sekce</th><th scope="col">Akce</th></tr></thead><tbody data-members></tbody></table></div>'+
    '<form class="form-grid panel" data-member aria-labelledby="create-member-title"><h3 class="wide" id="create-member-title">Nový přihlašovací účet</h3>'+
    '<label class="field">E-mail kolegy<input name="email" type="email" maxlength="254" required></label>'+
    '<div class="field"><label for="member-password">Počáteční heslo (alespoň 12 znaků)</label>'+
    '<div class="password-field"><input id="member-password" name="password" type="password" minlength="12" maxlength="256" autocomplete="new-password" required>'+
    '<button type="button" class="btn password-toggle" data-password-toggle aria-label="Zobrazit heslo" title="Zobrazit heslo" aria-controls="member-password">'+
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/><path class="password-slash" d="m4 4 16 16"/></svg></button></div></div>'+
    '<div class="actions wide"><button type="submit" class="btn primary">Založit účet v HUBu</button></div></form>'+
    '<p role="status" data-account-status></p>';
}
export async function bindAccount(){
  if(!isAdmin)return;
  const status=main.querySelector('[data-account-status]');
  const nameForm=main.querySelector('[data-display-name]');
  const nameField=nameForm.elements.displayName;
  const nameStatus=nameForm.querySelector('[data-name-status]');
  nameField.value=session.user?.user_metadata?.fcg_display_name||'';
  const hint=nameForm.querySelector('[data-name-hint]');
  const showNameHint=()=>{
    hint.textContent=session.user?.user_metadata?.fcg_display_name
      ?'Toto jméno se členům HUBu zobrazuje při výběru držitele úkolu.'
      :'V nabídce držitelů jste zatím vedeni jako Člen týmu · '+(currentUserId()||'').slice(0,8)+'.';
  };
  showNameHint();
  nameForm.onsubmit=async event=>{
    event.preventDefault();
    const name=nameField.value.trim();
    const button=nameForm.querySelector('button');
    if(!name||button.disabled)return;
    button.disabled=true;
    try{
      const r=await api('/auth/v1/user',{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({data:{fcg_display_name:name}})});
      if(!r.ok)throw Error();
      saveSession({...session,user:await r.json()});
      nameField.value=name;
      showNameHint();
      nameStatus.textContent='Jméno bylo uloženo.';
      document.dispatchEvent(new Event('fcg-members-changed'));
    }catch{nameStatus.textContent='Jméno se nepodařilo uložit.';}
    finally{button.disabled=false;}
  };
  main.querySelector('[data-password]').onsubmit=async e=>{
    e.preventDefault();const form=e.currentTarget;
    try{const r=await api('/auth/v1/user',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:form.password.value})});if(!r.ok)throw Error();form.reset();status.textContent='Heslo bylo změněno.';}catch{status.textContent='Změna hesla selhala.';}
  };
  const list=main.querySelector('[data-members]');
  const memberForm=main.querySelector('[data-member]');
  const email=memberForm.elements.email;
  const password=memberForm.elements.password;
  const toggle=memberForm.querySelector('[data-password-toggle]');
  const create=memberForm.querySelector('button[type=submit]');
  function showPassword(visible){
    password.type=visible?'text':'password';
    toggle.setAttribute('aria-label',visible?'Skrýt heslo':'Zobrazit heslo');
    toggle.title=visible?'Skrýt heslo':'Zobrazit heslo';
  }
  toggle.onclick=()=>showPassword(password.type==='password');
  function sectionPicker(cell,address,assigned){
    const group=document.createElement('fieldset');
    const legend=document.createElement('legend');legend.textContent='Přístup k sekcím';
    group.append(legend);
    const boxes=Object.entries(sectionLabels).map(([key,name])=>{
      const label=document.createElement('label');
      const check=document.createElement('input');
      check.type='checkbox';check.value=key;check.checked=assigned.includes(key);
      label.append(check,' '+name);group.append(label);
      return check;
    });
    const save=document.createElement('button');
    save.type='button';save.className='btn';save.textContent='Uložit sekce';save.disabled=true;
    const same=()=>boxes.every(check=>check.checked===assigned.includes(check.value));
    group.onchange=()=>{save.disabled=same();};
    save.onclick=async()=>{
      if(save.disabled)return;
      const next=boxes.filter(check=>check.checked).map(check=>check.value);
      save.disabled=group.disabled=true;
      try{
        const path='/rest/v1/fcg_members?email=eq.'+encodeURIComponent(address)+
          '&sections=eq.'+encodeURIComponent('{'+assigned.join(',')+'}');
        const response=await api(path,{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},
          body:JSON.stringify({sections:next})});
        if(!response.ok)throw Error('Sekce se nepodařilo uložit.');
        const [updated]=await response.json();
        if(!updated){
          await refresh();
          status.textContent='Oprávnění se mezitím změnila. Zkontrolujte aktuální nastavení sekcí.';
          return;
        }
        assigned=updated.sections;
        status.textContent='Sekce uloženy pro '+address+'.';
      }catch(error){status.textContent=error.message;}
      finally{group.disabled=false;save.disabled=same();}
    };
    cell.append(group,save);
  }
  async function refresh(){
    const [r,access]=await Promise.all([
      api('/rest/v1/rpc/fcg_list_members',{method:'POST'}),
      api('/rest/v1/fcg_members?select=email,sections')
    ]);
    if(!r.ok||!access.ok)throw Error('Seznam uživatelů se nepodařilo načíst.');
    const rows=await r.json();
    const byEmail=new Map((await access.json()).map(row=>[row.email,row.sections]));
    list.replaceChildren();
    for(const row of rows){
      const tr=list.insertRow();
      const own=row.email===session.user?.email?.toLowerCase();
      tr.insertCell().textContent=row.email+(own?' (vy)':'');
      const roleCell=tr.insertCell();
      roleCell.textContent=roleLabels[row.role];
      tr.insertCell().textContent=row.has_account?'Založený':'Chybí účet';
      const accessCell=tr.insertCell();
      accessCell.className='section-access';
      if(row.role==='admin')accessCell.textContent='Všechny sekce';
      else if(byEmail.has(row.email))sectionPicker(accessCell,row.email,byEmail.get(row.email));
      const actions=tr.insertCell();
      if(own){actions.textContent='Vlastní účet';continue;}
      const field=document.createElement('label');field.className='field';
      field.textContent='Nová role';
      const select=document.createElement('select');
      select.setAttribute('aria-label','Nová role pro '+row.email);
      for(const [value,label] of Object.entries(roleLabels)){
        const option=new Option(label,value,value===row.role,value===row.role);
        option.disabled=value==='admin'&&!row.has_account;
        select.append(option);
      }
      field.append(select);
      const save=document.createElement('button');
      save.className='btn';save.textContent='Uložit roli';save.disabled=true;
      const remove=document.createElement('button');
      remove.className='btn';remove.textContent='Odebrat přístup';
      const buttons=document.createElement('div');
      buttons.className='actions';buttons.append(save);
      if(row.role!=='admin')buttons.append(remove);
      if(!row.has_account){
        const activate=document.createElement('button');
        activate.type='button';
        activate.className='btn';
        activate.textContent='Založit účet';
        activate.setAttribute('aria-label','Založit účet pro '+row.email);
        activate.onclick=()=>{
          if(create.disabled)return;
          if(email.value.trim().toLowerCase()!==row.email){
            password.value='';
            showPassword(false);
          }
          email.value=row.email;
          password.focus();
        };
        buttons.prepend(activate);
      }
      actions.append(buttons);
      roleCell.append(field);
      select.onchange=()=>{save.disabled=select.value===row.role;};
      save.onclick=async()=>{
        if(select.value==='admin'&&!confirm('Přidělit roli administrátora účtu '+row.email+'?'))return;
        select.disabled=save.disabled=remove.disabled=true;
        try{
          const response=await api('/rest/v1/rpc/fcg_set_member_role',{
            method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({target_email:row.email,new_role:select.value,expected_role:row.role})
          });
          if(response.status===409){
            await refresh();
            status.textContent='Údaje o účtu se změnily. Zkontrolujte aktuální roli a zkuste to znovu.';
            return;
          }
          if(!response.ok)throw Error('Roli se nepodařilo změnit.');
          await refresh();
          status.textContent='Role uložena pro '+row.email+'.';
        }catch(error){status.textContent=error.message;}
        finally{select.disabled=remove.disabled=false;save.disabled=select.value===row.role;}
      };
      remove.onclick=async()=>{
        if(!confirm('Odebrat přístup pro '+row.email+'?'))return;
        select.disabled=save.disabled=remove.disabled=true;
        try{
          const response=await api('/rest/v1/fcg_members?email=eq.'+encodeURIComponent(row.email),{method:'DELETE'});
          if(!response.ok)throw Error('Přístup se nepodařilo odebrat.');
          await refresh();
          status.textContent='Přístup odebrán pro '+row.email+'.';
        }catch(error){status.textContent=error.message;}
        finally{select.disabled=remove.disabled=false;save.disabled=select.value===row.role;}
      };
    }
    return rows;
  }
  memberForm.onsubmit=async e=>{
    e.preventDefault();
    if(create.disabled||!memberForm.reportValidity())return;
    const address=email.value.trim().toLowerCase();
    create.disabled=email.readOnly=password.readOnly=true;
    status.textContent='Zakládám přihlašovací účet…';
    try{
      const r=await api('/functions/v1/fcg-member',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:address,password:password.value})
      });
      if(!r.ok){
        const result=await r.json().catch(()=>null);
        throw Error(result?.error||'Účet se nepodařilo založit.');
      }
      memberForm.reset();
      showPassword(false);
      const users=await refresh().catch(()=>null);
      status.textContent=users?.some(user=>user.email===address&&user.has_account)
        ?'Přihlašovací účet pro '+address+' je připravený. Počáteční heslo k novému účtu předejte soukromě.'
        :'Požadavek byl uložen. Stav účtu ověřte po obnovení seznamu uživatelů.';
    }catch(err){status.textContent=err.message;}
    finally{create.disabled=email.readOnly=password.readOnly=false;}
  };
  try{await refresh();}catch{status.textContent='Seznam uživatelů se nepodařilo načíst.';}
}
