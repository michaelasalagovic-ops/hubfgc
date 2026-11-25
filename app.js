import {start,signOut,isAdmin,canWrite,allowedSections,refreshSections,currentUserId,currentUserEmail,loadAssignees,loadAssigneeEmails,loadSocialReviewers,loadRecords,saveRecord,upload,uploadSocialMedia,fileUrl,accountPanel,bindAccount} from './account.js?v=hub-11';
import {needs,topics} from './data.js';

const sections = {
  prace:['✓','Moje práce','Úkoly, termíny a schválení, která čekají na vás.'],
  ucet:['⚙','Nastavení',''],
  'bez-pristupu':['','Pracovní prostor',''],
  roadmapa:['▦','Roadmapa','Úkoly napříč projektem, jejich vlastníci a termíny.'],
  dokumenty:['▤','Dokumenty','Manuály a pracovní podklady FyzioGym Cooper.'],
  meetingy:['▣','Meetingy','Zápisy ze schůzek a navazující úkoly.'],
  some:['◎','SoMe','Plán příspěvků a podklady pro sociální sítě.'],
  strategie:['◇','Značka a nabídka','Pracovní podklady pro brand book, služby a rozvoj péče.'],
  prehled:['⌂','Přehled','Přestavba webu na jednom místě'],
  stranky:['▤','Stránky','Obsahové zadání a stav jednotlivých stránek.'],
  sitemap:['⑂','Sitemap a URL','Hierarchie budoucího webu a mapa změn adres.'],
  obsah:['◈','Obsahové sekce','Videa, anglické lekce a odborná spolupráce.'],
  lokalni:['⌖','Lokální SEO','Pracoviště, jejich informace a dohledatelnost ve vyhledávání.'],
  mereni:['▥','Měření','Pracovní kontrola GTM, GA4 a GSC na fyziogym.cz.'],
  podklady:['◷','Chybějící podklady','Položky, které je potřeba doplnit nebo potvrdit.'],
  plan:['✓','Plán kroků','Úkoly pro migraci, obsah, lokální SEO a měření.']
};
const statuses=['Návrh','Rozpracováno','Čeká na podklady','K revizi','Připraveno','Publikováno','Hotovo'];
const priorities=['Vysoká','Střední','Nízká'];
const types=['Rozcestník','Potřeba','Služba','Obsah','Video','Praktické informace','Lokální SEO'];
const categories=['Migrace','Obsah','Lokální SEO','Měření','AEO / GEO'];
const projectAreas=['Projekt','Značka','Nabídka','Provoz'];
const webViews=['prehled','stranky','sitemap','obsah','lokalni','mereni','podklady','plan'];
const socialChannels={instagram:'Instagram',linkedin:'LinkedIn',podklady:'Podklady'};
const socialFormats={
  instagram:{feed:'Feed',carousel:'Carousel',stories:'Stories',reel:'Reel'},
  linkedin:{text:'Text',photo:'Fotka',video:'Video',document:'Dokument / carousel'}
};
const socialPostChannels=Object.keys(socialFormats).map(value=>({value,label:socialChannels[value]}));
const calendarFormats=Object.entries({...socialFormats.instagram,...socialFormats.linkedin}).map(([value,label])=>({value,label}));
let socialChannel='kalendar', calendarMonth='', calendarChannel='', calendarFormat='';
const socialHref=channel=>'#some/'+channel;
const canOpen=id=>{
  if(id==='prace')return allowedSections.length>0;
  if(id==='ucet')return isAdmin;
  if(id==='bez-pristupu')return !isAdmin&&allowedSections.length===0;
  return allowedSections.includes(webViews.includes(id)?'web':id);
};
const firstView=()=>['prace','ucet','bez-pristupu'].find(canOpen);
const taskSection=(category,meetingId,socialId)=>socialId?'some':meetingId?'meetingy':categories.includes(category)?'web':'roadmapa';
function recordSection(record){
  if(record.kind==='task')return taskSection(record.category,record.meetingId,record.socialId);
  return {meeting:'meetingy',document:'dokumenty',note:'strategie',social:'some'}[record.kind]||'web';
}
const records=new Map();
const versions=new Map();
const documentRoots=[
  {id:'folder-web',title:'WEB',folderId:''},
  {id:'folder-brand',title:'BRAND',folderId:''}
];
const brandDocuments=new Set(['doc-brand-book','doc-linkedin-manual','doc-manual-loga','doc-strategie']);
const filters={q:'',type:'',service:'',audience:'',status:'',priority:''};
let view='prehled', mapMode='tree', folderView='', ready=false, loading=true, toastTimer;
const documentViewKey='fcg-document-view';
let documentView='tiles';
try{if(localStorage.getItem(documentViewKey)==='details')documentView='details';}catch{}
const main=document.querySelector('#main');
const dialog=document.querySelector('#editor');
const settingsLink=document.querySelector('#settings-link');
const signOutButton=document.querySelector('#sign-out');
const heroArt=document.querySelector('#hero-art').content.firstElementChild.cloneNode(true);
const bell=document.querySelector('#notification-button');
const notifications=document.querySelector('#notifications');
let members=[],membersReady=false,motionStarted=false;
let assigneeEmails=new Map();
let socialReviewers=[];
const esc=(value='')=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uniq=list=>[...new Set(list.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'cs'));
const isDone=r=>['Publikováno','Hotovo'].includes(r.status);
const listed=()=>[...records.values()].filter(r=>!['task','note','meeting','document','social'].includes(r.kind));
const planned=()=>[...records.values()].filter(r=>r.kind==='task'&&recordSection(r)==='web');
const sortByPriority=(a,b)=>priorities.indexOf(a.priority)-priorities.indexOf(b.priority)||(a.date||'9999').localeCompare(b.date||'9999');
const dateText=value=>value?new Intl.DateTimeFormat('cs-CZ',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z')):'';
const badge=(value,kind='')=>'<span class="badge '+kind+'">'+esc(value)+'</span>';
const statusBadge=r=>badge(r.status,isDone(r)?'done':r.status==='Čeká na podklady'?'wait':r.status==='Návrh'?'':'progress');
const priorityBadge=r=>badge(r.priority,r.priority==='Vysoká'?'high':'');
const action=(label,data,style='')=>{
  if(!canWrite&&/^data-(new|meeting-task)=/.test(data))return '';
  return '<button type="button" class="btn '+style+'" '+data+'>'+esc(label)+'</button>';
};
const editAttr=id=>'data-edit="'+esc(id)+'"';
const goAttr=id=>'data-go="'+esc(id)+'"';
const pageInfo=r=>'<button type="button" class="item-title" '+editAttr(r.id)+'>'+esc(r.title)+'</button><span class="url">'+esc(r.url||'URL k doplnění')+'</span>';
const noResults=message=>'<div class="panel empty">'+esc(message)+'</div>';
const tasksPending=()=>planned().filter(r=>!isDone(r)).sort(sortByPriority);

function gaps(r){
  const list=[];
  if(r.open) list.push('Otevřené informace');
  for(const [key,label] of Object.entries({owner:'Vlastník',date:'Termín',verified:'Ověřené informace',faq:'FAQ'})){
    if(!r[key]) list.push(label);
  }
  if(!r.oldUrl&&r.redirect==='Zjistit v inventuře') list.push('Inventura URL');
  if(r.url&&listed().some(other=>other.id!==r.id&&other.url===r.url)) list.push('Duplicitní cílová URL');
  if(r.oldUrl&&listed().some(other=>other.id!==r.id&&other.oldUrl===r.oldUrl)) list.push('Sdílená stávající URL');
  return list;
}
const missing=()=>listed().filter(r=>gaps(r).length).sort(sortByPriority);

function options(values,current,placeholder){
  return (placeholder===null?'':'<option value="">'+esc(placeholder)+'</option>')+values.map(value=>{
    const v=typeof value==='string'?value:value.value;
    const label=typeof value==='string'?value:value.label;
    return '<option value="'+esc(v)+'"'+((Array.isArray(current)?current.includes(v):current===v)?' selected':'')+'>'+esc(label)+'</option>';
  }).join('');
}
function heading(title,description,actions=''){
  return '<div class="heading"><div><h1>'+esc(title)+'</h1><p>'+esc(description)+'</p></div><div class="actions">'+actions+'</div></div>';
}
function rowsTable(list){
  if(!list.length) return noResults('Filtrům neodpovídá žádná stránka.');
  return '<div class="table-wrap"><table class="table"><thead><tr><th>Stránka / cílová URL</th><th>Typ</th><th>Služba</th><th>Stav</th><th>Priorita</th><th>Vlastník / termín</th></tr></thead><tbody>'+list.map(r=>'<tr><td>'+pageInfo(r)+'</td><td>'+esc(r.type)+'</td><td>'+esc(r.service)+'</td><td>'+statusBadge(r)+'</td><td>'+priorityBadge(r)+'</td><td>'+esc(r.owner||'—')+'<span class="url">'+dateText(r.date)+'</span></td></tr>').join('')+'</tbody></table></div>';
}
function card(r,body,extra=''){
  return '<article class="card"><div class="badges">'+statusBadge(r)+priorityBadge(r)+'</div><h3>'+esc(r.title)+'</h3>'+body+extra+'<div class="actions">'+action('Otevřít kartu',editAttr(r.id))+'</div></article>';
}
function cardGroup(list,formatter){
  return list.length?'<div class="cards">'+list.map(formatter).join('')+'</div>':noResults('V této sekci zatím nejsou žádné položky.');
}
function overview(){
  const stat=(number,label,target)=>'<button class="stat" '+goAttr(target)+'><b>'+number+'</b><span>'+label+'</span></button>';
  const row=(r,detail)=>'<button class="list-row" '+editAttr(r.id)+'><span><strong>'+esc(r.title)+'</strong><small>'+esc(detail)+'</small></span><span aria-hidden="true">→</span></button>';
  return heading('Obsahový a SEO hub',sections.prehled[2],action('+ Přidat stránku','data-new="page"','primary'))+
    '<section class="hero"><h2>Čtyři vstupní potřeby klientů</h2><div class="need-grid">'+needs.map((need,i)=>'<button class="need" '+editAttr(['pain','return','start','sport'][i])+'>'+esc(need)+'<span aria-hidden="true">↗</span></button>').join('')+'</div></section>'+
    '<section class="stats">'+stat(listed().length,'Stránek v sitemapě','stranky')+stat(listed().filter(isDone).length,'Publikováno / hotovo','stranky')+stat(missing().length,'Stránek k doplnění','podklady')+stat(tasksPending().length,'Otevřených úkolů','plan')+'</section>'+
    '<div class="overview"><section class="panel"><h2>Co ověřit jako první</h2>'+(['assessment','pricing','prague','acute'].map(id=>records.get(id)).filter(r=>r?.open).map(r=>row(r,r.open)).join('')||'<p class="fine">V hlavních kartách zbývají jen další podklady podle přehledu.</p>')+action('Všechny chybějící podklady →',goAttr('podklady'),'link')+'</section>'+
    '<section class="panel"><h2>Nejbližší kroky</h2>'+(tasksPending().slice(0,4).map(r=>row(r,[r.category,r.owner,dateText(r.date)].filter(Boolean).join(' · '))).join('')||'<p class="fine">Všechny úkoly jsou hotové.</p>')+action('Otevřít plán kroků →',goAttr('plan'),'link')+'</section></div>';
}
function filterRows(){
  const q=filters.q.trim().toLocaleLowerCase('cs');
  return listed().filter(r=>Object.keys(filters).every(key=>key==='q'||!filters[key]||r[key]===filters[key]))
    .filter(r=>!q||[r.title,r.url,r.oldUrl,r.topics,r.need,r.message].some(value=>String(value??'').toLocaleLowerCase('cs').includes(q)));
}
function pageList(){
  const configs=[['type',types,'Typ stránky'],['service',uniq(listed().map(r=>r.service)),'Služba'],['audience',uniq(listed().map(r=>r.audience)),'Cílová skupina'],['status',statuses,'Stav'],['priority',priorities,'Priorita']];
  return heading('Stránky',sections.stranky[2],action('+ Přidat stránku','data-new="page"','primary'))+
    '<section class="filters"><div class="filter-grid"><input type="search" aria-label="Hledat v kartách stránek" placeholder="Hledat název, URL nebo téma…" data-filter="q" value="'+esc(filters.q)+'">'+configs.map(([key,values,label])=>'<select data-filter="'+key+'" aria-label="'+label+'">'+options(values,filters[key],label)+'</select>').join('')+'</div><div class="filter-meta"><span id="result-count"></span>'+action('Zrušit filtry','data-clear','link')+'</div></section><div id="results"></div>';
}
function fillResults(){
  const filtered=filterRows();
  document.querySelector('#result-count').textContent=filtered.length+' / '+listed().length+' stránek';
  document.querySelector('#results').innerHTML=rowsTable(filtered);
}
function sitemap(){
  const pages=listed();
  const switches=action('Strom stránek','data-map="tree" aria-pressed="'+(mapMode==='tree')+'"',mapMode==='tree'?'primary':'')+
    action('Mapování URL','data-map="urls" aria-pressed="'+(mapMode==='urls')+'"',mapMode==='urls'?'primary':'');
  const seen=new Set();
  function renderNode(r,depth){
    if(seen.has(r.id)) return '';
    seen.add(r.id);
    return '<div class="tree-row" style="--depth:'+Math.min(depth,8)+'"><div>'+pageInfo(r)+'</div>'+statusBadge(r)+'</div>'+
      pages.filter(child=>child.parent===r.id).map(child=>renderNode(child,depth+1)).join('');
  }
  const tree=pages.filter(r=>!r.parent||!records.has(r.parent)).map(r=>renderNode(r,0)).join('')+
    pages.filter(r=>!seen.has(r.id)).map(r=>renderNode(r,0)).join('');
  const table='<div class="table-wrap mapping"><table class="table"><thead><tr><th>Stránka</th><th>Stávající URL</th><th>Cílová URL</th><th>Migrační akce</th></tr></thead><tbody>'+
    pages.map(r=>'<tr><td><button class="item-title" '+editAttr(r.id)+'>'+esc(r.title)+'</button></td><td>'+esc(r.oldUrl||'—')+'</td><td>'+esc(r.url||'—')+'</td><td>'+esc(r.redirect||'—')+'</td></tr>').join('')+'</tbody></table></div>';
  return heading('Sitemap a URL',sections.sitemap[2],action('+ Přidat stránku','data-new="page"','primary'))+
    '<div class="actions" style="margin-bottom:12px">'+switches+'</div>'+
    (mapMode==='tree'?'<div class="panel tree">'+(tree||'Žádné stránky v sitemapě.')+'</div>':table);
}
function projectSections(){
  const pageCard=r=>card(r,'<p>'+esc(r.message)+'</p><span class="url">'+esc(r.url)+'</span>');
  const group=(title,list)=>'<h2 class="group-title">'+title+'</h2>'+cardGroup(list,pageCard);
  if(view==='lokalni') return heading('Lokální SEO',sections.lokalni[2],action('+ Přidat pracoviště','data-new="local"','primary'))+
    cardGroup(listed().filter(r=>r.type==='Lokální SEO'),pageCard)+groupTasks('Kontrola lokálních údajů',planned().filter(r=>r.category==='Lokální SEO'));
  return heading('Obsahové sekce',sections.obsah[2],action('+ Přidat video','data-new="video"','primary')+action('+ Přidat stránku','data-new="page"'))+
    group('Videa a edukace',listed().filter(r=>r.type==='Video'))+
    group('Anglické lekce',listed().filter(r=>r.id==='english'||r.audience==='Anglicky mluvící klienti'))+
    group('Lékaři a spolupracující pracoviště',listed().filter(r=>r.id==='partners'||r.parent==='partners'));
}
function groupTasks(title,list){
  return (title?'<h2 class="group-title">'+title+'</h2>':'')+cardGroup(list,r=>card(r,'<p>'+esc(r.description)+'</p><p><strong>Kontrola</strong> '+esc(r.check)+'</p>',r.owner||r.date?'<span class="url">'+esc([r.owner,dateText(r.date)].filter(Boolean).join(' · '))+'</span>':''));
}
function taskView(){
  const measurement=view==='mereni';
  return heading(measurement?'Měření':'Plán dalších kroků',sections[view][2],action('+ Přidat úkol','data-new="'+(measurement?'measurement':'task')+'"','primary'))+
    (measurement?groupTasks('',planned().filter(r=>r.category==='Měření').sort(sortByPriority)):
      groupTasks('Otevřené kroky',tasksPending())+groupTasks('Dokončené',planned().filter(isDone)));
}
function gapView(){
  return heading('Chybějící podklady',sections.podklady[2])+
    cardGroup(missing(),r=>card(r,(r.open?'<p>'+esc(r.open)+'</p>':'')+'<div class="badges">'+gaps(r).map(g=>badge(g,'open')).join('')+'</div>'));
}
const lanes=[
  {title:'K naplánování',states:['Návrh']},
  {title:'V řešení',states:['Rozpracováno']},
  {title:'Čeká na podklady',states:['Čeká na podklady']},
  {title:'Ke schválení',states:['K revizi','Připraveno']},
  {title:'Dokončeno',states:['Hotovo','Publikováno']}
];
let roadMode='list',roadPreset='',topic=topics[0],ownerFilter='',areaFilter='',tagFilter='';
const allTasks=()=>[...records.values()].filter(r=>r.kind==='task');
const normalized=value=>value.trim().normalize('NFC').toLocaleLowerCase('cs');
const otherOwner='other';
function assignedMemberId(task){
  if(Object.hasOwn(task,'ownerId'))return task.ownerId;
  const email=normalized(task.owner||'');
  return email&&email===normalized(currentUserEmail()||'')?currentUserId():null;
}
function memberLabel(member){
  const duplicate=members.some(row=>row.user_id!==member.user_id&&normalized(row.display_name)===normalized(member.display_name));
  return member.display_name+(duplicate?' · '+member.user_id.slice(0,8):'');
}
function taskOwner(task){
  const member=members.find(row=>row.user_id===assignedMemberId(task));
  return member?memberLabel(member):task.owner||'';
}
function ownerField(task){
  const member=members.find(row=>row.user_id===assignedMemberId(task));
  const useOther=!member&&Boolean(task.owner||task.ownerId);
  const choices=members.filter(row=>!task.socialId||task.publicationTask||socialReviewers.includes(row.user_id)||row.user_id===member?.user_id)
    .map(row=>({value:row.user_id,label:assigneeEmails.get(row.user_id)||memberLabel(row)}))
    .sort((a,b)=>a.label.localeCompare(b.label,'cs'));
  const choice=member?.user_id||(useOther?otherOwner:'');
  return '<label class="field">Držitel úkolu<select name="ownerChoice">'+options([...choices,{value:otherOwner,label:'Jiné'}],choice,'Bez přiřazení')+'</select></label>'+
    '<div class="wide" data-custom-owner '+(useOther?'':'hidden')+'><label class="field">Jiný držitel úkolu<input name="customOwner" placeholder="Např. agentura" value="'+esc(useOther?task.owner:'')+'" '+(useOther?'required':'disabled')+'></label></div>'+
    (membersReady?'':'<p class="help wide">Tým se nepodařilo načíst. Znovu ho načtete obnovením stránky.</p>');
}
function renderNotifications(){
  const userId=currentUserId();
  bell.hidden=!ready||!userId;
  if(bell.hidden){
    if(notifications.matches(':popover-open'))notifications.hidePopover();
    return;
  }
  const mine=allTasks().filter(task=>assignedMemberId(task)===userId)
    .sort((a,b)=>Number(isDone(a))-Number(isDone(b))||(a.date||'9999').localeCompare(b.date||'9999')||a.title.localeCompare(b.title,'cs'));
  const active=mine.filter(task=>!isDone(task)).length;
  const count=document.querySelector('#notification-count');
  count.hidden=!active;
  count.textContent=active>99?'99+':active;
  bell.setAttribute('aria-label',active?'Moje úkoly, otevřené: '+active:'Moje úkoly');
  document.querySelector('#notification-summary').textContent=mine.length
    ?'Otevřené úkoly: '+active+' · Celkem: '+mine.length
    :'Zatím nemáte přidělené žádné úkoly.';
  document.querySelector('#notification-list').innerHTML=mine.map(task=>'<li><button type="button" data-notice-task="'+esc(task.id)+'">'+
    '<strong>'+esc(task.title)+'</strong><span>'+esc(task.status)+' · '+esc(dateText(task.date)||'Bez termínu')+'</span></button></li>').join('');
}
notifications.addEventListener('click',event=>{
  const button=event.target.closest('[data-notice-task]');
  if(!button)return;
  const task=records.get(button.dataset.noticeTask);
  if(!task||assignedMemberId(task)!==currentUserId())return;
  notifications.hidePopover();
  bell.focus();
  editor(task);
});
notifications.addEventListener('toggle',async event=>{
  if(event.newState!=='open')return;
  try{
    let changed=false;
    const [,rows]=await Promise.all([refreshSections(),loadRecords()]);
    for(const [id,record] of records){
      if(!canOpen(recordSection(record))){
        records.delete(id);
        versions.delete(id);
        changed=true;
      }
    }
    for(const row of rows){
      if(!row.deleted&&!canOpen(recordSection(row.record)))continue;
      if(row.version<=(versions.get(row.id)||0))continue;
      versions.set(row.id,row.version);
      if(row.deleted)records.delete(row.id);
      else records.set(row.id,row.record);
      changed=true;
    }
    if(changed&&view!=='ucet'&&!dialog.open)render();
    else if(changed)renderNotifications();
  }catch{
    if(notifications.matches(':popover-open'))flash('Přehled ukazuje poslední načtené úkoly.');
  }
});
const taskTags=r=>Array.isArray(r.tags)?r.tags:[];
function parseTags(raw){
  const known=new Map(allTasks().flatMap(taskTags).map(t=>[normalized(t),t]));
  const tags=new Map();
  for(const part of raw.split(',')){
    const name=part.trim();
    const key=normalized(name);
    if(key&&!tags.has(key))tags.set(key,known.get(key)||name);
  }
  return [...tags.values()];
}
function tagBadges(r){
  const tags=taskTags(r);
  return tags.length?'<div class="task-tags">'+tags.map(tag=>badge(tag)).join('')+'</div>':'';
}
function tagField(r){
  const choices=uniq(allTasks().flatMap(taskTags));
  return '<div class="wide"><label class="field">Štítky<input name="tags" placeholder="Např. SEO, Obsah" value="'+esc(taskTags(r).join(', '))+'"></label><small>Více štítků oddělte čárkou.</small>'+
    (choices.length?'<div class="tag-choices">'+choices.map(t=>action(t,'data-add-tag="'+esc(t)+'"')).join('')+'</div>':'')+'</div>';
}
function filterChoices(values,emptyLabel){
  return [{value:'empty',label:emptyLabel},...uniq(values).map(label=>({value:'value:'+normalized(label),label})).filter((item,i,all)=>all.findIndex(x=>x.value===item.value)===i)];
}
function taskTile(r){
  return '<article class="ticket" draggable="'+(ready&&canWrite&&!r.publicationTask)+'" data-ticket="'+esc(r.id)+'"><small>'+esc(r.category)+'</small><button class="item-title" '+editAttr(r.id)+'>'+esc(r.title)+'</button>'+
    '<div class="badges flex flex-wrap gap-2">'+priorityBadge(r)+'</div>'+tagBadges(r)+(r.product?'<p>'+esc(r.product)+'</p>':'')+
    '<footer><span>'+esc(taskOwner(r)||'Bez přiřazení')+'</span><time>'+esc(dateText(r.date)||'Bez termínu')+'</time></footer></article>';
}
const pragueDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'});
function weekBounds(now=new Date()){
  const today=pragueDate.format(now);
  const sunday=new Date(today+'T00:00:00Z');
  sunday.setUTCDate(sunday.getUTCDate()+(7-sunday.getUTCDay())%7);
  return [today,sunday.toISOString().slice(0,10)];
}
const compareDue=(a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||a.title.localeCompare(b.title,'cs');
function taskList(tasks,editable=false){
  if(!tasks.length)return '<p class="help">Žádné úkoly.</p>';
  return '<div class="work-list">'+tasks.map(task=>{
    const label=esc(task.title);
    const id=esc(task.id);
    const memberId=assignedMemberId(task);
    const member=members.some(row=>row.user_id===memberId)?memberId:'';
    const ownerChoices=members.filter(row=>!task.socialId||socialReviewers.includes(row.user_id)||row.user_id===member)
      .map(row=>({value:row.user_id,label:assigneeEmails.get(row.user_id)||memberLabel(row)}));
    const custom=!member&&taskOwner(task);
    if(custom)ownerChoices.unshift({value:otherOwner,label:custom});
    const quickAttr=field=>'data-quick-task="'+id+'" data-quick-field="'+field+'"';
    const quickLabel=field=>' aria-label="'+field+' · '+label+'"';
    return '<article class="work-row" data-work-row="'+id+'"><div><button type="button" class="item-title" '+editAttr(task.id)+'>'+label+'</button><small>'+esc(task.category)+'</small></div>'+
      (editable&&!task.publicationTask?
        '<select '+quickAttr('status')+quickLabel('Stav')+'>'+options([...new Set([task.status,...statuses])].filter(Boolean),task.status,null)+'</select>'+
        '<select '+quickAttr('owner')+quickLabel('Držitel úkolu')+(membersReady?'':' disabled')+'>'+options(ownerChoices,member||(custom?otherOwner:''),'Bez držitele')+'</select>'+
        '<input type="date" '+quickAttr('date')+quickLabel('Termín')+' value="'+esc(task.date)+'">' :
        '<span>'+statusBadge(task)+'</span><span>'+esc(taskOwner(task)||'Bez držitele')+'</span><span>'+esc(dateText(task.date)||'Bez termínu')+'</span>')+'</article>';
  }).join('')+'</div>';
}
function myWork(){
  const [today,sunday]=weekBounds();
  const userId=currentUserId();
  const active=allTasks().filter(task=>!isDone(task)).sort(compareDue);
  const approvals=active.filter(task=>userId&&task.status==='K revizi'&&task.reviewerId===userId);
  const mine=active.filter(task=>assignedMemberId(task)===userId&&!approvals.includes(task));
  const groups=[
    ['Čeká na moje schválení',approvals],
    ['Po termínu',mine.filter(task=>task.date&&task.date<today)],
    ['Tento týden',mine.filter(task=>task.date>=today&&task.date<=sunday)],
    ['Později',mine.filter(task=>task.date>sunday)],
    ['Bez termínu',mine.filter(task=>!task.date)]
  ];
  if(isAdmin)groups.push(['Týmové úkoly bez držitele',active.filter(task=>!assignedMemberId(task)&&!taskOwner(task))]);
  const pilot=canOpen('web')&&records.get('assessment');
  const socialWork=[...records.values()].filter(r=>r.kind==='social'&&userId&&(
    (r.review?.state==='pending'&&r.review.reviewerId===userId)||(r.review?.state==='returned'&&r.review.requestedBy===userId)));
  return heading('Moje práce',sections.prace[2])+
    (pilot?'<section class="panel work-pilot"><div><h2>Pilotní stránka · Vstupní vyšetření</h2><p class="fine">Podklady, odborná revize, publikace a kontrola výsledků.</p></div>'+action('Otevřít pilotní kartu',editAttr('assessment'))+'</section>':'')+
    (socialWork.length?'<section class="panel work-group"><h2>Příspěvky SoMe '+badge(socialWork.length)+'</h2><div class="work-list">'+socialWork.sort(compareDue).map(r=>
      '<article class="work-row"><div><button type="button" class="item-title" '+editAttr(r.id)+'>'+esc(r.title)+'</button><small>'+esc(socialChannels[r.channel])+'</small></div>'+
      socialReviewBadge(r)+'<span>'+esc(dateText(r.date)||'Bez termínu')+'</span></article>').join('')+'</div></section>':'')+
    groups.map(([title,tasks])=>'<section class="panel work-group"><h2>'+title+' '+badge(tasks.length)+'</h2>'+taskList(tasks)+'</section>').join('');
}
function roadmap(){
  const tasks=allTasks();
  const [today,sunday]=weekBounds();
  const matchesPreset=task=>!roadPreset||(!isDone(task)&&(
    roadPreset==='week'?task.date>=today&&task.date<=sunday:
    roadPreset==='unassigned'?!assignedMemberId(task)&&!taskOwner(task):task.status==='Čeká na podklady'));
  const owners=filterChoices(tasks.map(taskOwner),'Bez přiřazení');
  const tags=filterChoices(tasks.flatMap(taskTags),'Bez štítku');
  if(!owners.some(item=>item.value===ownerFilter))ownerFilter='';
  if(!tags.some(item=>item.value===tagFilter))tagFilter='';
  const selected=tasks.filter(r=>{
    const name=taskOwner(r);
    const owner=name?'value:'+normalized(name):'empty';
    const tagValues=taskTags(r).map(tag=>'value:'+normalized(tag));
    const matchesTag=!tagFilter||(tagFilter==='empty'?tagValues.length===0:tagValues.includes(tagFilter));
    return matchesPreset(r)&&(!areaFilter||r.category===areaFilter)&&(!ownerFilter||owner===ownerFilter)&&matchesTag;
  }).sort(compareDue);
  const control=(label,mode)=>action(label,'data-mode="'+mode+'" aria-pressed="'+(roadMode===mode)+'"',mode===roadMode?'primary':'');
  let result;
  if(roadMode==='list'){
    result=taskList(selected,ready&&canWrite);
  }else if(roadMode==='board'){
    result='<div class="lanes">'+lanes.map(({title,states})=>{
      const items=selected.filter(r=>states.includes(r.status));
      return '<section class="lane" data-drop="'+states[0]+'"><h2>'+title+' <span>'+items.length+'</span></h2>'+items.map(taskTile).join('')+(!items.length&&canWrite?'<div class="dropHint">Přesunout úkol sem</div>':'')+'</section>';
    }).join('')+'</div>';
  }else{
    const groups=new Map();
    for(const r of selected){const key=r.date||'';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
    result='<div class="timeline">'+([...groups].map(([date,items])=>'<section><h2>'+esc(dateText(date)||'Bez termínu')+'</h2><div>'+items.map(r=>'<div class="time-row"><div><button class="item-title" '+editAttr(r.id)+'>'+esc(r.title)+'</button>'+tagBadges(r)+'</div><span>'+esc(taskOwner(r)||'Bez přiřazení')+'</span>'+statusBadge(r)+'</div>').join('')+'</div></section>').join('')||noResults('Výběru neodpovídají žádné úkoly.'))+'</div>';
  }
  return heading('Roadmapa',sections.roadmapa[2],action('+ Přidat úkol','data-new="project"','primary'))+
    '<div class="road-tools"><div class="actions">'+control('Seznam','list')+control('Podle stavu','board')+control('Časová osa','time')+'</div><div class="actions"><select aria-label="Rychlý filtr" data-road-filter="preset">'+options([{value:'week',label:'Tento týden'},{value:'unassigned',label:'Bez držitele'},{value:'waiting',label:'Čeká na podklady'}],roadPreset,'Všechny úkoly')+'</select><select aria-label="Oblast úkolů" data-road-filter="area">'+options(uniq(tasks.map(r=>r.category)),areaFilter,'Všechny oblasti')+'</select><select aria-label="Držitel úkolu" data-road-filter="owner">'+options(owners,ownerFilter,'Všichni držitelé')+'</select><select aria-label="Štítek úkolu" data-road-filter="tag">'+options(tags,tagFilter,'Všechny štítky')+'</select></div></div>'+
    (roadMode==='board'&&canWrite?'<p class="boardhelp">Kartu přetáhněte do dalšího sloupce nebo otevřete úkol a změňte stav.</p>':'')+result;
}
const driveHosts=new Set(['drive.google.com','docs.google.com','sheets.google.com','slides.google.com']);
function driveUrl(value){
  try{
    const url=new URL(value);
    if(url.protocol==='https:'&&driveHosts.has(url.hostname)&&!url.username&&!url.password&&!url.port)return url.href;
  }catch{}
  return '';
}
function driveLinks(record){
  return (Array.isArray(record.driveLinks)?record.driveLinks:[]).flatMap(link=>{
    const url=driveUrl(link?.url);
    return url?[{url,title:typeof link.title==='string'?link.title.trim():''}]:[];
  });
}
function driveAnchors(links){
  if(!links.length)return '';
  return '<ul class="drive-links" aria-label="Odkazy na Google Disk">'+links.map(link=>
    '<li><a href="'+esc(link.url)+'" target="_blank" rel="noopener noreferrer">'+esc(link.title||'Otevřít na Google Disku')+' <span aria-hidden="true">↗</span></a></li>').join('')+'</ul>';
}
function driveLinkFields(link={}){
  return '<div class="drive-link-row">'+input({driveTitle:link.title},'driveTitle','Název odkazu')+
    '<label class="field">Odkaz z Google Disku<input name="driveUrl" type="url" value="'+esc(link.url)+'" placeholder="https://drive.google.com/…"></label>'+
    action('Odebrat','data-remove-drive-link aria-label="Odebrat odkaz na Google Disk"')+'</div>';
}
function driveSection(record,editable=canWrite){
  const links=driveLinks(record);
  if(!editable&&!links.length)return '';
  return '<section class="form-section drive-section"><h3>Google Disk</h3>'+driveAnchors(links)+
    (editable?'<div data-drive-links>'+links.map(driveLinkFields).join('')+'</div>'+
      action('+ Přidat odkaz','data-add-drive-link'):'')+'</section>';
}
const socialMedia=r=>(Array.isArray(r.media)?r.media:[]).filter(file=>/^\/api\/social\/[a-f0-9-]{36}\.(jpg|png|webp|mp4)$/.test(file?.path));
const socialReviewLabels={pending:'Čeká na schválení',approved:'Schváleno k publikaci',returned:'Vráceno k úpravě',published:'Publikováno'};
function socialMember(id){
  const member=members.find(row=>row.user_id===id);
  return member?memberLabel(member):'Schvalovatel';
}
function socialReviewBadge(r){
  const state=r.review?.state;
  if(!socialReviewLabels[state])return statusBadge(r);
  return badge(socialReviewLabels[state],state==='returned'?'wait':state==='published'?'done':'progress');
}
function socialReviewDetails(r,editable){
  const review=r.review;
  const state=review?.state;
  const canDecide=editable&&state==='pending'&&review.reviewerId===currentUserId();
  const publicationTask=records.get('publish-'+r.id);
  const canPublish=editable&&state==='approved'&&publicationTask?.ownerId===currentUserId();
  const choices=members.filter(row=>socialReviewers.includes(row.user_id))
    .map(row=>({value:row.user_id,label:assigneeEmails.get(row.user_id)||memberLabel(row)}));
  return '<section class="form-section drive-section social-review"><h3>Schválení a publikace</h3><div class="badges">'+socialReviewBadge(r)+'</div>'+
    (state==='pending'?'<p>Čeká na <strong>'+esc(socialMember(review.reviewerId))+'</strong></p>':'')+
    (state==='approved'&&publicationTask?'<p>Publikuje <strong>'+esc(socialMember(publicationTask.ownerId))+'</strong></p>':'')+
    (review?.note?'<p class="social-copy"><strong>Poznámka ke schválení</strong> '+esc(review.note)+'</p>':'')+
    (canDecide?area({},'decisionNote','Poznámka k rozhodnutí')+'<div class="actions">'+
      '<button class="btn primary" type="button" data-social-action="approved">Schválit k publikaci</button>'+
      '<button class="btn" type="button" data-social-action="returned">Vrátit k úpravě</button></div>':'')+
    (canPublish?'<button class="btn primary" type="button" data-social-action="published">Označit jako publikované</button>':'')+
    (editable&&!['pending','approved','published'].includes(state)&&r.status!=='Publikováno'?
      '<label class="field">Schvaluje<select name="socialReviewer">'+options(choices,review?.reviewerId,'Vyberte schvalovatele')+'</select></label>'+
      '<div class="actions"><button class="btn primary" type="button" data-social-action="pending">Poslat ke schválení</button></div>':'')+
    '</section>';
}
function socialAttachments(r,editable){
  const files=socialMedia(r);
  return '<section class="form-section drive-section"><h3>Fotky a video</h3><div class="social-media">'+files.map(file=>{
    const video=file.path.endsWith('.mp4');
    return '<figure data-social-file="'+esc(file.path)+'">'+(video?
      '<video controls preload="none" hidden></video>'+action('Načíst video','data-load-social-video'):
      '<img data-hub-image="'+esc(file.path)+'" alt="'+esc(file.name)+'">')+
      '<figcaption>'+esc(file.name)+'</figcaption><div class="actions"><a class="btn" href="#some" data-hub-file="'+esc(file.path)+'" download="'+esc(file.name)+'">Stáhnout</a>'+
      (editable?action('Odebrat','data-remove-social-media aria-label="Odebrat '+esc(file.name)+'"'):'')+'</div></figure>';
  }).join('')+'</div>'+(editable?'<label class="field">Přidat fotky nebo video<input name="socialFiles" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.mp4"></label>'+
    '<small>JPG, PNG, WebP nebo MP4, do 20 MB na soubor. Větší soubory přidejte odkazem z Google Disku.</small>':'')+'</section>';
}
const socialFormatLabel=r=>socialFormats[r.channel]?.[r.postFormat]||'Bez formátu';
function socialFormatOptions(channel,selected){
  return options(Object.entries(socialFormats[channel]).map(([value,label])=>({value,label})),selected,'Bez formátu');
}
const byPublication=(a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||(a.publishTime||'99:99').localeCompare(b.publishTime||'99:99')||
  a.title.localeCompare(b.title,'cs');
const calendarHeading=new Intl.DateTimeFormat('cs-CZ',{month:'long',year:'numeric',timeZone:'UTC'});
const calendarDayLabel=new Intl.DateTimeFormat('cs-CZ',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'});
const calendarWeekdays=['Po','Út','St','Čt','Pá','So','Ne'];
const isoDay=date=>date.toISOString().slice(0,10);
function socialMonthDate(month){
  return new Date(month+'-01T00:00:00Z');
}
function calendarPost(r){
  return '<button type="button" class="calendar-post '+(r.channel==='instagram'?'calendar-instagram':'calendar-linkedin')+'" '+editAttr(r.id)+'>'+
    '<span class="calendar-post-meta">'+esc(socialChannels[r.channel])+' · '+esc(socialFormatLabel(r))+
    (r.publishTime?' · <time>'+esc(r.publishTime)+'</time>':'')+'</span><strong>'+esc(r.title)+'</strong>'+
    socialReviewBadge(r)+'</button>';
}
function socialCalendar(){
  const today=pragueDate.format(new Date());
  const month=calendarMonth||today.slice(0,7);
  const first=socialMonthDate(month);
  const monthName=calendarHeading.format(first);
  const daysInMonth=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  const leading=(first.getUTCDay()+6)%7;
  const posts=[...records.values()].filter(r=>r.kind==='social'&&Object.hasOwn(socialFormats,r.channel)&&
    (!calendarChannel||calendarChannel===r.channel)&&(!calendarFormat||calendarFormat===(r.postFormat||'empty'))).sort(byPublication);
  const byDay=new Map();
  for(const post of posts){
    if(!post.date?.startsWith(month+'-'))continue;
    if(!byDay.has(post.date))byDay.set(post.date,[]);
    byDay.get(post.date).push(post);
  }
  const days=Array.from({length:Math.ceil((leading+daysInMonth)/7)*7},(_,index)=>{
    const day=index-leading+1;
    if(day<1||day>daysInMonth)return '<div class="calendar-spacer" aria-hidden="true"></div>';
    const key=month+'-'+String(day).padStart(2,'0');
    const label=calendarDayLabel.format(new Date(key+'T00:00:00Z'));
    return '<section class="calendar-day'+(index%7>=5?' calendar-weekend':'')+(key===today?' calendar-today':'')+'" aria-label="'+esc(label)+'">'+
      '<div class="calendar-day-header"><time datetime="'+key+'"'+(key===today?' aria-current="date"':'')+'>'+
      '<span class="calendar-desktop-date" aria-hidden="true">'+day+'</span><span class="calendar-mobile-date" aria-hidden="true">'+esc(label)+'</span></time>'+
      (canWrite?'<button class="btn calendar-add" type="button" data-new-social-date="'+key+'" aria-label="Přidat příspěvek na '+esc(label)+'">+</button>':'')+'</div>'+
      (byDay.get(key)||[]).map(calendarPost).join('')+'</section>';
  }).join('');
  const formats=calendarChannel?calendarFormats.filter(item=>Object.hasOwn(socialFormats[calendarChannel],item.value)):calendarFormats;
  const unscheduled=posts.filter(r=>!r.date);
  return '<section class="social-calendar" aria-labelledby="calendar-month-label">'+
    '<div class="calendar-toolbar"><div class="calendar-month-nav"><h2 id="calendar-month-label" aria-live="polite">'+esc(monthName)+'</h2>'+
    '<div class="actions">'+action('‹','data-calendar-move="-1" aria-label="Předchozí měsíc"')+
    action('Dnes','data-calendar-move="today"')+action('›','data-calendar-move="1" aria-label="Další měsíc"')+'</div></div>'+
    '<div class="calendar-filters"><label class="field">Kanál<select data-calendar-filter="channel">'+
    options(socialPostChannels,calendarChannel,'Všechny kanály')+'</select></label><label class="field">Formát<select data-calendar-filter="format">'+
    options([...formats,{value:'empty',label:'Bez formátu'}],calendarFormat,'Všechny formáty')+'</select></label></div></div>'+
    '<div class="calendar-weekdays" aria-hidden="true">'+calendarWeekdays.map(label=>'<span>'+label+'</span>').join('')+'</div>'+
    '<div class="calendar-days">'+days+'</div></section>'+
    (unscheduled.length?'<section class="panel calendar-unscheduled"><h2>Bez termínu '+badge(unscheduled.length)+'</h2><div>'+
      unscheduled.map(calendarPost).join('')+'</div></section>':'');
}
function social(){
  const materials=socialChannel==='podklady';
  const items=[...records.values()].filter(r=>r.kind==='social'&&r.channel===socialChannel).sort(byPublication);
  const tabs='<nav class="topicbar social-tabs" aria-label="Kategorie SoMe">'+Object.entries({kalendar:'Kalendář',...socialChannels}).map(([id,label])=>
    '<a class="btn'+(id===socialChannel?' primary':'')+'" href="'+socialHref(id)+'"'+(id===socialChannel?' aria-current="page"':'')+'>'+label+'</a>').join('')+'</nav>';
  const cards=items.map(r=>'<article class="card"><div><h2><button class="item-title" '+editAttr(r.id)+'>'+esc(r.title)+'</button></h2>'+
    (materials?'':'<div class="badges">'+badge(socialFormatLabel(r))+socialReviewBadge(r)+(r.date?'<time datetime="'+esc(r.date)+'">Publikace '+dateText(r.date)+(r.publishTime?' · '+esc(r.publishTime):'')+'</time>':'')+'</div>'+
      (r.review?.state==='pending'?'<p class="fine">Čeká na '+esc(socialMember(r.review.reviewerId))+'</p>':'')+
      (socialMedia(r).length?'<p class="fine">Přílohy ('+socialMedia(r).length+')</p>':''))+
    (r.description?'<p class="social-copy">'+esc(r.description)+'</p>':'')+'</div>'+driveAnchors(driveLinks(r))+'</article>');
  return heading('SoMe',sections.some[2],action(materials?'+ Přidat podklad':'+ Nový příspěvek','data-new="social"','primary'))+
    tabs+(socialChannel==='kalendar'?socialCalendar():items.length?'<div class="cards">'+cards.join('')+'</div>':
      noResults(materials?'Zatím tu nejsou žádné podklady.':'Zatím tu nejsou žádné příspěvky.'));
}

function documentFolders(){
  return new Map([...documentRoots,...[...records.values()].filter(r=>r.kind==='document'&&r.isFolder===true)].map(folder=>[folder.id,folder]));
}
function folderPath(id,folders){
  const path=[];
  const visited=new Set();
  while(id&&folders.has(id)&&!visited.has(id)){
    visited.add(id);
    const folder=folders.get(id);
    path.unshift(folder);
    id=folder.folderId;
  }
  return path;
}
const folderHref=id=>'#dokumenty'+(id?'/'+encodeURIComponent(id):'');
function documentParent(record,folders){
  const id=Object.hasOwn(record,'folderId')?record.folderId:brandDocuments.has(record.id)?'folder-brand':'';
  return folders.has(id)?id:'';
}
const documentFiles=record=>(record.files||[]).filter(file=>/^\/api\/documents\/[a-z0-9-]+\.(pdf|docx|pptx|xlsx)$/.test(file.path));
function folderFileCounts(documents,folders){
  const counts=new Map();
  for(const document of documents){
    const total=documentFiles(document).length+driveLinks(document).length;
    for(const folder of folderPath(documentParent(document,folders),folders)){
      counts.set(folder.id,(counts.get(folder.id)||0)+total);
    }
  }
  return counts;
}
function documentList(){
  const folders=documentFolders();
  if(folderView&&!folders.has(folderView)){
    folderView='';
    history.replaceState(null,'',folderHref(''));
  }
  const trail=folderPath(folderView,folders);
  const current=folders.get(folderView);
  const children=[...folders.values()].filter(folder=>documentParent(folder,folders)===folderView);
  const documents=[...records.values()].filter(r=>r.kind==='document'&&!r.isFolder);
  const items=documents.filter(r=>documentParent(r,folders)===folderView);
  const detailed=documentView==='details';
  const counts=detailed?folderFileCounts(documents,folders):new Map();
  const count=number=>detailed?'<span class="document-file-count">Počet souborů: '+number+'</span>':'';
  const folderCards=children.map(folder=>'<article class="card document-folder"><h2><a href="'+folderHref(folder.id)+'"><span class="folder-icon" aria-hidden="true"></span>'+esc(folder.title)+'</a></h2>'+
    count(counts.get(folder.id)||0)+(folder.isFolder&&canWrite?'<div class="actions">'+action('Přejmenovat',editAttr(folder.id))+'</div>':'')+'</article>').join('');
  const breadcrumbs=current?'<nav class="document-path" aria-label="Umístění dokumentů"><a href="'+folderHref('')+'">Dokumenty</a>'+
    trail.map(folder=>folder.id===folderView?'<span aria-current="page">'+esc(folder.title)+'</span>':'<a href="'+folderHref(folder.id)+'">'+esc(folder.title)+'</a>').join('')+'</nav>':'';
  const viewButton=(label,mode)=>action(label,'data-document-view="'+mode+'" aria-pressed="'+(documentView===mode)+'"');
  const viewPicker='<div class="document-view-picker" role="group" aria-label="Zobrazení dokumentů">'+
    viewButton('Podrobnosti','details')+viewButton('Dlaždice','tiles')+'</div>';
  const documentCards=items.map(record=>{
    const files=documentFiles(record);
    const links=driveLinks(record);
    return '<article class="card"><div><h2>'+esc(record.title)+'</h2><p>'+esc(record.description)+'</p></div>'+count(files.length+links.length)+driveAnchors(links)+'<div class="actions">'+
      files.map(f=>{
        const ext=f.path.split('.').pop();
        return '<a class="btn" href="#dokumenty" data-hub-file="'+esc(f.path)+'" '+(ext==='pdf'?'target="_blank" rel="noopener"':'download="'+esc(f.name)+'"')+'>'+esc(ext==='pdf'?'Otevřít PDF':'Stáhnout '+ext.toUpperCase())+'</a>';
      }).join('')+action(canWrite?'Upravit':'Otevřít kartu',editAttr(record.id))+'</div></article>';
  }).join('');
  return heading(current?.title||'Dokumenty',current?'Dokumenty a podsložky':sections.dokumenty[2],
    action('+ Nová složka','data-new="document-folder"','primary')+action('+ Přidat dokument','data-new="document"'))+breadcrumbs+
    viewPicker+(children.length||items.length?'<div class="cards document-grid'+(detailed?' document-details':'')+'">'+folderCards+documentCards+'</div>':noResults('Tato složka je zatím prázdná.'));
}
function meetings(){
  const list=[...records.values()].filter(r=>r.kind==='meeting').sort((a,b)=>b.date.localeCompare(a.date)||a.title.localeCompare(b.title,'cs'));
  const tasks=allTasks();
  const cards=list.map(r=>{
    const linked=tasks.filter(t=>t.meetingId===r.id);
    return '<article class="card meeting-card"><time datetime="'+esc(r.date)+'">'+esc(dateText(r.date))+'</time><h2>'+esc(r.title)+'</h2>'+
      '<p class="meeting-notes">'+esc(r.notes)+'</p>'+
      (linked.length?'<h3>To Do</h3>'+linked.map(t=>'<button class="list-row" '+editAttr(t.id)+'><strong>'+esc(t.title)+'</strong>'+statusBadge(t)+'</button>').join(''):'')+
      driveAnchors(driveLinks(r))+'<div class="actions">'+action(canWrite?'Upravit zápis':'Otevřít zápis',editAttr(r.id))+action('+ Přidat úkol','data-meeting-task="'+esc(r.id)+'"')+'</div></article>';
  });
  return heading('Meetingy',sections.meetingy[2],action('+ Nový zápis','data-new="meeting"','primary'))+
    (list.length?'<div class="meeting-timeline grid gap-4">'+cards.join('')+'</div>':noResults('Zatím tu nejsou žádné zápisy ze schůzek.'));
}
function knowledge(){
  const data=[...records.values()].filter(r=>r.kind==='note'&&r.category===topic);
  return heading('Značka a nabídka',sections.strategie[2],action('+ Přidat podklad','data-new="note"','primary'))+
    '<div class="topicbar">'+topics.map(t=>action(t,'data-topic="'+esc(t)+'" aria-pressed="'+(t===topic)+'"',t===topic?'primary':'')).join('')+'</div>'+
    '<div class="kbgrid">'+data.map(r=>'<article class="kbcard"><h2><button class="item-title" '+editAttr(r.id)+'>'+esc(r.title)+'</button></h2><p>'+esc(r.description)+'</p>'+
      driveAnchors(driveLinks(r))+(r.insight?'<div class="insight"><strong>Podnět k rozvoji</strong><p>'+esc(r.insight)+'</p></div>':'')+action('Upravit podklad',editAttr(r.id),'link')+'</article>').join('')+'</div>'+(!data.length?noResults('V této oblasti zatím nejsou podklady.'):'');
}
main.addEventListener('click',event=>{
  const button=event.target.closest('button');
  const move=button?.dataset.calendarMove;
  if(move){
    const today=pragueDate.format(new Date()).slice(0,7);
    const month=socialMonthDate(calendarMonth||today);
    if(move!=='today')month.setUTCMonth(month.getUTCMonth()+Number(move));
    calendarMonth=move==='today'?today:isoDay(month).slice(0,7);
    render();
    main.querySelector('[data-calendar-move="'+move+'"]')?.focus();
  }
  if(button?.dataset.mode){roadMode=button.dataset.mode;render();}
  if(button?.dataset.topic){topic=button.dataset.topic;render();}
});
main.addEventListener('change',async event=>{
  const calendarFilter=event.target.dataset.calendarFilter;
  if(calendarFilter){
    if(calendarFilter==='channel'){
      calendarChannel=event.target.value;
      if(calendarChannel&&calendarFormat!=='empty'&&!Object.hasOwn(socialFormats[calendarChannel],calendarFormat))calendarFormat='';
    }else calendarFormat=event.target.value;
    render();
    main.querySelector('[data-calendar-filter="'+calendarFilter+'"]')?.focus();
    return;
  }
  const {quickTask,quickField}=event.target.dataset;
  if(quickTask&&ready&&canWrite){
    const task=records.get(quickTask);
    if(!task)return;
    const value=event.target.value;
    const update={...task};
    if(quickField==='owner'){
      if(value===otherOwner)return;
      const member=members.find(row=>row.user_id===value);
      if(value&&!member){render();return;}
      update.ownerId=member?.user_id??null;
      update.owner=member?.display_name||'';
    }else if((quickField==='status'&&statuses.includes(value))||quickField==='date'){
      update[quickField]=value;
    }else return;
    const row=event.target.closest('[data-work-row]');
    row.querySelectorAll('input,select').forEach(control=>control.disabled=true);
    await persist(task.id,versions.get(task.id)||0,update,false,{inline:true});
    render();
    [...main.querySelectorAll('[data-quick-task]')].find(control=>control.dataset.quickTask===quickTask&&control.dataset.quickField===quickField)?.focus();
    return;
  }
  const key=event.target.dataset.roadFilter;
  if(!key)return;
  if(key==='area')areaFilter=event.target.value;
  else if(key==='owner')ownerFilter=event.target.value;
  else if(key==='tag')tagFilter=event.target.value;
  else if(key==='preset')roadPreset=event.target.value;
  render();
});
main.addEventListener('dragstart',event=>{
  const id=event.target.closest('[data-ticket]')?.dataset.ticket;
  if(id)event.dataTransfer.setData('text/plain',id);
});
main.addEventListener('dragover',event=>{
  const lane=event.target.closest('[data-drop]');
  if(canWrite&&lane){event.preventDefault();lane.classList.add('drop-active');}
});
main.addEventListener('dragleave',event=>{
  const lane=event.target.closest('[data-drop]');
  if(lane&&!lane.contains(event.relatedTarget))lane.classList.remove('drop-active');
});
const clearDrop=()=>main.querySelectorAll('.drop-active').forEach(lane=>lane.classList.remove('drop-active'));
main.addEventListener('dragend',clearDrop);
main.addEventListener('drop',async event=>{
  clearDrop();
  const status=event.target.closest('[data-drop]')?.dataset.drop;
  const r=records.get(event.dataTransfer.getData('text/plain'));
  if(!canWrite||!ready||!status||r?.kind!=='task'||r.publicationTask)return;
  event.preventDefault();
  if(lanes.find(l=>l.states.includes(r.status))?.states[0]===status)return;
  await persist(r.id,versions.get(r.id)||0,{...r,status},false);
});

function render(){
  if(!canOpen(view)){
    view=firstView();
    history.replaceState(null,'','#'+view);
  }
  document.querySelector('#crumb').textContent=sections[view][1];
  const link=(id,title=sections[id][1])=>'<a href="#'+id+'" '+(id===view?'aria-current="page"':'')+'><span class="nav-icon" aria-hidden="true">'+sections[id][0]+'</span>'+title+'</a>';
  document.querySelector('.brand').setAttribute('href','#'+firstView());
  document.querySelector('#nav').innerHTML=['prace','roadmapa','meetingy','dokumenty','prehled','some','strategie'].filter(canOpen).map(id=>{
    if(id!=='prehled')return link(id);
    return link(id,'Web')+(webViews.includes(view)?'<div class="subnav">'+webViews.map(item=>link(item)).join('')+'</div>':'');
  }).join('');
  settingsLink.hidden=!isAdmin;
  if(view==='ucet')settingsLink.setAttribute('aria-current','page');
  else settingsLink.removeAttribute('aria-current');
  const sync=document.querySelector('#sync');
  sync.textContent=ready?(canWrite?'Ukládání do hubu':'Režim čtení'):loading?'Načítám data…':'Připojení se nezdařilo';
  sync.classList.toggle('ready',ready);
  main.innerHTML=loading?noResults('Načítám pracovní prostor…'):({
    prace:myWork,ucet:accountPanel,roadmapa:roadmap,dokumenty:documentList,meetingy:meetings,some:social,strategie:knowledge,prehled:overview,stranky:pageList,sitemap,obsah:projectSections,lokalni:projectSections,mereni:taskView,podklady:gapView,plan:taskView,
    'bez-pristupu':()=>noResults('Zatím nemáte přístup k žádné sekci HUBu.')
  })[view]();
  const heading=main.querySelector('.heading');
  if(heading){
    heading.append(heroArt);
    if(!motionStarted&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
      motionStarted=true;
      import('./motion.js').then(({startMotion})=>startMotion(heroArt.querySelector('canvas'))).catch(()=>{});
    }
  }
  renderNotifications();
  if(view==='ucet'&&!loading)bindAccount();
  if(view==='stranky'&&!loading) fillResults();
  if(!ready&&!loading) main.insertAdjacentHTML('afterbegin','<p class="error">Zobrazeny dostupné podklady. Pro úpravy obnovte připojení. '+action('Zkusit znovu','data-retry','link')+'</p>');
}
function route(){
  const hash=location.hash.slice(1);
  const documentRoute=hash.match(/^dokumenty\/([a-zA-Z0-9-]{1,80})$/);
  const socialRoute=hash.match(/^some\/(kalendar|instagram|linkedin|podklady)$/);
  socialChannel=socialRoute?.[1]||'kalendar';
  const section=documentRoute?'dokumenty':socialRoute?'some':hash;
  folderView=documentRoute?.[1]||'';
  view=Object.hasOwn(sections,section)?section:firstView();
  render();
  if(ready)refreshMembers().then(renderNotifications);
}
function flash(message){
  const toast=document.querySelector('#toast');
  toast.textContent=message;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.textContent='',3600);
}
async function refreshMembers(){
  const [people,emails,reviewers]=await Promise.allSettled([loadAssignees(),canWrite?loadAssigneeEmails():[],canWrite&&canOpen('some')?loadSocialReviewers():[]]);
  membersReady=people.status==='fulfilled';
  if(membersReady)members=people.value;
  assigneeEmails=new Map(emails.status==='fulfilled'?emails.value.map(row=>[row.user_id,row.email]):[]);
  socialReviewers=reviewers.status==='fulfilled'?reviewers.value:[];
}
document.addEventListener('fcg-members-changed',()=>refreshMembers().then(renderNotifications));
async function load(){
  loading=true;
  render();
  try{
    const [data]=await Promise.all([loadRecords(),refreshSections().then(refreshMembers)]);
    records.clear();
    versions.clear();
    for(const row of data){
      if(!row.deleted&&canOpen(recordSection(row.record))) records.set(row.id,row.record);
      if(row.version) versions.set(row.id,row.version);
    }
    ready=true;
  }catch{
    ready=false;
  }
  loading=false;
  render();
}

function input(r,key,label,{type='text',values,wide=false,required=false}={}){
  const attrs='name="'+key+'"'+(required?' required':'');
  let control;
  if(type==='textarea') control='<textarea '+attrs+'>'+esc(r[key])+'</textarea>';
  else if(values) control='<select '+attrs+'>'+options(values,r[key],required?null:'Vyberte')+'</select>';
  else control='<input '+attrs+' type="'+type+'" value="'+esc(r[key])+'">';
  return '<label class="field '+(wide?'wide':'')+'">'+esc(label)+control+'</label>';
}
const area=(r,key,label)=>input(r,key,label,{type:'textarea',wide:true});
const group=(title,fields,open=false)=>'<details class="form-section" '+(open?'open':'')+'><summary>'+title+'</summary><div class="form-grid">'+fields+'</div></details>';
const contentKeys=['heading','text','image','alt'];
const imagePath=/^\/api\/images\/[a-f0-9-]{36}$/;
function contentBlock(block={}){
  const image=block.image??'';
  const uploaded=imagePath.test(image);
  return '<fieldset class="content-block"><legend>Obsahový blok</legend>'+
    input(block,'heading','Nadpis bloku')+area(block,'text','Text na web')+
    '<label class="field">Odkaz na obrázek (volitelné)<input name="image" type="url" value="'+esc(uploaded?'':image)+'" placeholder="https://…"></label>'+
    '<input type="hidden" name="uploadedImage" value="'+esc(uploaded?image:'')+'">'+
    '<label class="field">Nahrát obrázek<input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label>'+
    (uploaded?'<img class="content-image" data-hub-image="'+esc(image)+'" alt="'+esc(block.alt)+'">':'')+
    input(block,'alt','Alt text obrázku')+
    '<div class="content-actions">'+action('Odebrat obrázek','data-clear-image')+action('Odebrat blok','data-remove-block','danger')+'</div></fieldset>';
}
async function uploadImage(file){
  return upload(file,'images');
}
function descendantOf(page,ancestor){
  const seen=new Set();
  while(page?.parent&&!seen.has(page.id)){
    seen.add(page.id);
    if(page.parent===ancestor) return true;
    page=records.get(page.parent);
  }
  return false;
}
function editor(record,defaultType,meetingId,pageId,socialId,socialDate=''){
  if(!canWrite&&!record)return;
  if(!ready){flash('Pro úpravy je potřeba obnovit připojení.');return;}
  const folder=record?.isFolder===true||defaultType==='document-folder';
  const doc=record?.kind==='document'||defaultType==='document'||folder;
  const meeting=record?.kind==='meeting'||defaultType==='meeting';
  const note=record?.kind==='note'||defaultType==='note';
  const socialEntry=record?.kind==='social'||defaultType==='social';
  const materials=(record?.channel||socialChannel)==='podklady';
  const task=record?.kind==='task'||['task','measurement','project','social-task'].includes(defaultType);
  const today=new Date();
  const localDate=new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);
  const draftChannel=socialChannel==='kalendar'?(calendarChannel||'instagram'):socialChannel;
  const r=record??(socialEntry?{kind:'social',id:crypto.randomUUID(),channel:draftChannel,date:socialDate,title:'',status:'Návrh'}:doc?{kind:'document',id:crypto.randomUUID(),title:'',folderId:folderView,...(folder?{isFolder:true}:{files:[]})}:meeting?{kind:'meeting',id:crypto.randomUUID(),date:localDate,title:'',notes:''}:{id:crypto.randomUUID(),title:'',type:defaultType==='video'?'Video':defaultType==='local'?'Lokální SEO':'Obsah',
    service:defaultType==='video'?'Koučink':'',parent:defaultType==='video'?'videos':defaultType==='local'?'branches':'',
    category:socialId?'SoMe':defaultType==='measurement'?'Měření':'Obsah',status:'Návrh',priority:'Střední',...(note?{kind:'note',category:topic}:{}),...(defaultType==='project'?{category:'Projekt'}:{}),...(task?{kind:'task',...(meetingId?{meetingId}:{}),...(pageId?{pageId}:{}),...(socialId?{socialId}:{})}:{links:[]})});
  if(!canOpen(recordSection(r)))return;
  const socialPost=socialEntry&&!materials;
  const editable=canWrite&&!r.publicationTask&&!(socialPost&&r.review?.state==='published');
  const pageChoices=listed().filter(p=>p.id!==r.id).map(p=>({value:p.id,label:p.title}));
  const workflow=(task?ownerField(r):input(r,'owner','Vlastník'))+input(r,'date','Termín',{type:'date'})+
    input(r,'status','Stav',{values:statuses,required:true})+input(r,'priority','Priorita',{values:priorities,required:true});
  const requiredTitle=input(r,'title',task?'Název úkolu':'Název stránky',{wide:true,required:true});
  let fields;
  if(folder){
    fields=group('Složka',input(r,'title','Název složky',{required:true,wide:true}),true);
  }else if(doc){
    const folders=documentFolders();
    const choices=[...folders.values()].map(item=>({value:item.id,label:folderPath(item.id,folders).map(part=>part.title).join(' / ')}))
      .sort((a,b)=>a.label.localeCompare(b.label,'cs'));
    fields=group('Dokument',input(r,'title','Název dokumentu',{required:true,wide:true})+area(r,'description','Krátký popis')+
      '<label class="field wide">Složka<select name="folderId">'+options(choices,documentParent(r,folders),'Dokumenty (hlavní úroveň)')+'</select></label>'+
      '<label class="field wide">'+(record?'Přidat další soubor':'Nahrát soubor')+'<input name="docFile" type="file" accept=".pdf,.docx,.pptx,.xlsx"></label><small class="wide">PDF, DOCX, PPTX nebo XLSX do 20 MB.</small>',true);
  }else if(meeting){
    fields=group('Zápis ze schůzky',input(r,'date','Datum schůzky',{type:'date',required:true})+
      input(r,'title','Téma schůzky (volitelné)')+area(r,'notes','Poznámky'),true);
  }else if(note){
    fields=group('Podklad',input(r,'title','Název',{wide:true,required:true})+input(r,'category','Oblast',{values:topics,required:true})+area(r,'description','Popis a současný stav')+area(r,'insight','Poznatky a možnosti rozšíření')+area(r,'source','Zdroj a datum ověření'),true);
  }else if(socialEntry){
    fields=group(materials?'Podklad':'Draft příspěvku',input(r,'title','Název',{wide:true,required:true})+
      (materials?'':input(r,'channel','Kanál',{values:socialPostChannels,required:true})+
        '<label class="field">Formát příspěvku<select name="postFormat">'+socialFormatOptions(r.channel,r.postFormat)+'</select></label>'+
        input(r,'date','Navrhovaný termín publikace',{type:'date'})+input(r,'publishTime','Čas publikace (Praha, volitelný)',{type:'time'}))+
      area(r,'description',materials?'Popis podkladu':'Text příspěvku')+
      (record&&!materials?'<div class="wide">'+action('Zkopírovat text','data-copy-social-text')+'</div>':''),true);
    if(socialPost){
      const linked=allTasks().filter(item=>item.socialId===r.id).sort(compareDue);
      fields+=socialAttachments(r,editable)+driveSection(r,editable)+socialReviewDetails(r,editable)+
        (record?'<section class="form-section linked-work"><h3>Navázané úkoly</h3>'+taskList(linked)+
          (canWrite?action('+ Přidat úkol','data-new-social-task="'+esc(r.id)+'"'):'')+'</section>':'');
    }
  }else if(task){
    const source=records.get(r.meetingId);
    const socialSource=records.get(r.socialId);
    const taskAreas=r.socialId?['SoMe']:[...new Set([r.category,...projectAreas,...categories])].filter(category=>category&&canOpen(taskSection(category,r.meetingId)));
    const page=canOpen('web')&&records.get(r.pageId);
    const reviewerChoices=members.map(member=>({value:member.user_id,label:assigneeEmails.get(member.user_id)||memberLabel(member)}));
    if(r.reviewerId&&!members.some(member=>member.user_id===r.reviewerId)){
      reviewerChoices.push({value:r.reviewerId,label:'Dříve nastavený schvalovatel'});
    }
    const relatedPage=!r.socialId&&canOpen('web')?'<label class="field">Související stránka<select name="pageId">'+
      options(listed().map(entry=>({value:entry.id,label:entry.title})),r.pageId,'Bez vazby')+'</select></label>':'';
    fields=(socialSource?'<div class="actions">'+action('Otevřít příspěvek '+socialSource.title,editAttr(socialSource.id))+'</div>':'')+
      (source?'<p class="help">Ze schůzky '+esc(source.title)+' · '+esc(dateText(source.date))+'</p>':'')+
      (page?'<div class="actions">'+action('Otevřít stránku '+page.title,editAttr(page.id))+'</div>':'')+
      group('Zadání a plán',requiredTitle+input(r,'category','Oblast',{values:taskAreas,required:true})+
      workflow+'<label class="field">Schvaluje<select name="reviewerId">'+options(reviewerChoices,r.reviewerId,'Bez schvalovatele')+'</select></label>'+
      relatedPage+tagField(r)+input(r,'product','Produkt / výstup',{wide:true})+area(r,'description','Popis úkolu a výstupu')+area(r,'check','Jak ověříme splnění')+area(r,'notes','Poznámky'),true);
  }else{
    fields=group('Stránka a stav',requiredTitle+input(r,'type','Typ stránky',{values:types,required:true})+
      input(r,'service','Služba')+workflow,true)+
      group('Texty a obrázky','<p class="help wide">Přidejte blok pro každou část stránky. Fotku můžete nahrát (JPG, PNG, WebP nebo GIF do 10 MB) nebo vložit její odkaz. Změny potvrdíte tlačítkem Uložit.</p>'+
        '<div class="wide" data-content-blocks>'+((r.contentBlocks?.length?r.contentBlocks:[{}]).map(contentBlock).join(''))+'</div>'+
        '<div class="wide">'+action('Přidat obsahový blok','data-add-block')+'</div>',true)+
      group('Sitemap a mapování URL',input(r,'url','Cílová URL')+input(r,'oldUrl','Stávající URL')+
        input(r,'parent','Nadřazená stránka',{values:pageChoices.filter(p=>!descendantOf(records.get(p.value),r.id))})+
        input(r,'redirect','Migrační akce')+input(r,'canonical','Plánovaná kanonická URL'),true)+
      group('Cílová skupina a sdělení',input(r,'audience','Cílová skupina')+input(r,'need','Vstupní potřeba',{values:needs})+
        area(r,'barriers','Bariéry')+area(r,'message','Doporučené sdělení')+input(r,'cta','Hlavní CTA',{wide:true}))+
      group('SEO, AEO a GEO',area(r,'topics','Hlavní klíčová témata')+
        input(r,'intent','Search intent',{values:['Informační','Orientační','Transakční','Lokální','Srovnávací','Smíšený']})+
        input(r,'metaTitle','SEO title')+area(r,'metaDescription','Meta description')+
        area(r,'headings','Doporučené nadpisy H1–H3')+area(r,'faq','FAQ a odpovědi')+
        area(r,'trust','Důvěryhodnost obsahu a odborný garant')+area(r,'ai','Podklady pro AI vyhledávání'))+
      group('Interní prolinkování','<p class="help wide">Zaškrtněte stránky, na které má karta odkazovat.</p>'+
        '<div class="wide" style="display:grid;gap:7px;max-height:210px;overflow:auto">'+pageChoices.map(p=>
          '<label class="help"><input type="checkbox" name="links" value="'+esc(p.value)+'" '+(r.links?.includes(p.value)?'checked':'')+'> '+esc(p.label)+'</label>').join('')+'</div>')+
      (r.type==='Video'||!record?group('Podklady k videu',input(r,'videoUrl','Odkaz na video')+
        input(r,'videoLength','Délka')+input(r,'videoAuthor','Autor')+input(r,'videoThumbnail','Odkaz na náhled')+
        area(r,'transcript','Přepis a časové značky')):'')+
      group('Ověřené a otevřené informace',area(r,'verified','Ověřené informace a zdroj')+
        area(r,'open','Otevřené informace k ověření')+area(r,'notes','Poznámky'),true);
  }
  if(record&&!doc&&!meeting&&!note&&!task&&!socialEntry){
    const linked=allTasks().filter(item=>item.pageId===r.id)
      .sort((a,b)=>(a.pilotStep||99)-(b.pilotStep||99)||compareDue(a,b));
    fields='<section class="form-section linked-work"><h3>Související úkoly</h3>'+taskList(linked)+
      (canWrite?action('+ Přidat úkol','data-new-page-task="'+esc(r.id)+'"'):'')+'</section>'+fields;
  }
  if(!folder&&!socialPost)fields=driveSection(r,editable)+fields;
  dialog.innerHTML='<form id="record-form"><header class="dialog-head"><h2 id="editor-title">'+esc(record?r.title:folder?'Nová složka':doc?'Nový dokument':meeting?'Nový zápis':(note||(socialEntry&&materials))?'Nový podklad':socialEntry?'Nový příspěvek':task?'Nový úkol':'Nová stránka')+'</h2>'+
    action('Zavřít','data-close')+'</header><div class="dialog-body">'+fields+'</div>'+
    '<footer class="dialog-foot"><div>'+(record&&isAdmin&&!folder?action('Smazat','data-delete','danger'):'')+'</div>'+
    '<div>'+action('Zrušit','data-close')+(meeting||socialPost?'<button class="btn" type="submit" data-save-and-add>Uložit a přidat úkol</button>':'')+'<button type="submit" class="btn primary">Uložit</button></div></footer></form>';
  const form=dialog.querySelector('form');
  const workflowEntries=()=>[...new FormData(form)].filter(([key])=>key!=='decisionNote');
  const initialEntries=workflowEntries();
  const isChanged=()=>{
    const currentEntries=workflowEntries();
    const sameField=(a,b)=>typeof a==='string'?a===b:typeof b!=='string'&&a.name===b.name&&a.size===b.size&&(!a.name||a.lastModified===b.lastModified);
    return currentEntries.length!==initialEntries.length||
      currentEntries.some(([key,value],index)=>key!==initialEntries[index][0]||!sameField(value,initialEntries[index][1]))||
      (socialPost&&form.querySelectorAll('[data-social-file]').length!==socialMedia(r).length);
  };
  form.addEventListener('click',event=>{
    if(!event.target.closest('[data-edit],[data-new-page-task],[data-new-social-task]'))return;
    if(isChanged()&&!confirm('Otevřít položku bez uložení rozepsaných změn?'))event.stopPropagation();
  });
  const previews=()=>{
    for(const img of dialog.querySelectorAll('[data-hub-image]'))fileUrl(img.dataset.hubImage).then(url=>img.src=url).catch(()=>flash('Obrázek se nepodařilo načíst.'));
  };
  if(!editable){
    form.querySelector('footer').remove();
    for(const element of form.querySelectorAll('.dialog-body input,.dialog-body select,.dialog-body textarea,.dialog-body button')){
      if(element.matches('button')){
        if(!element.matches('[data-edit],[data-load-social-video],[data-new-social-task],[data-copy-social-text]'))element.remove();
        continue;
      }
      if(element.matches('input[type=file]'))element.closest('label').remove();
      else if(element.matches('textarea,input:not([type=checkbox])'))element.readOnly=true;
      else element.disabled=true;
    }
    form.addEventListener('submit',event=>event.preventDefault());
    dialog.showModal();
    previews();
    return;
  }
  const revision=versions.get(r.id)??0;
  const blockList=form.querySelector('[data-content-blocks]');
  if(socialPost){
    const {channel,postFormat}=form.elements;
    channel.onchange=()=>{postFormat.innerHTML=socialFormatOptions(channel.value,postFormat.value);};
  }
  if(task){
    const {ownerChoice,customOwner}=form.elements;
    ownerChoice.onchange=()=>{
      const custom=ownerChoice.value===otherOwner;
      form.querySelector('[data-custom-owner]').hidden=customOwner.disabled=!custom;
      customOwner.required=custom;
      if(custom)customOwner.focus();
    };
  }
  form.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(button?.hasAttribute('data-add-tag')){
      const field=form.elements.tags;
      field.value=parseTags(field.value+','+button.dataset.addTag).join(', ');
      field.focus();
    }
    if(button?.hasAttribute('data-add-block')){
      blockList.insertAdjacentHTML('beforeend',contentBlock());
      blockList.lastElementChild.querySelector('[name=heading]').focus();
    }
    if(button?.hasAttribute('data-add-drive-link')){
      const list=form.querySelector('[data-drive-links]');
      list.insertAdjacentHTML('beforeend',driveLinkFields());
      list.lastElementChild.querySelector('[name=driveUrl]').focus();
    }
    if(button?.hasAttribute('data-remove-drive-link')){
      button.closest('.drive-link-row').remove();
      form.querySelector('[data-add-drive-link]').focus();
    }
    if(button?.hasAttribute('data-remove-social-media'))button.closest('[data-social-file]').remove();
    if(button?.dataset.socialAction){
      form.dataset.socialAction=button.dataset.socialAction;
      form.requestSubmit();
      delete form.dataset.socialAction;
    }
    const block=button?.closest('.content-block');
    if(button?.hasAttribute('data-remove-block')){
      block.remove();
      form.querySelector('[data-add-block]').focus();
    }
    if(button?.hasAttribute('data-clear-image')){
      for(const name of ['image','imageFile','uploadedImage','alt']) block.querySelector('[name='+name+']').value='';
      block.querySelector('img')?.remove();
    }
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const fd=new FormData(form);
    const blockFields=new Set([...contentKeys,'docFile','imageFile','uploadedImage','driveTitle','driveUrl','socialFiles','socialReviewer','decisionNote']);
    const pageFields=[...fd].filter(([key])=>!['links','ownerChoice','customOwner'].includes(key)&&!blockFields.has(key));
    const update={...r,...Object.fromEntries(pageFields.map(([key,value])=>[key,value.trim()]))};
    if(folder){
      if(!update.title){showError('Doplňte název složky.');return;}
      if(update.folderId&&!documentFolders().has(update.folderId)){showError('Nadřazená složka už není dostupná.');return;}
      await persist(r.id,revision,update,false);
      return;
    }
    const driveTitles=fd.getAll('driveTitle');
    const links=[];
    for(const [index,value] of fd.getAll('driveUrl').entries()){
      const title=driveTitles[index].trim();
      if(!value.trim()&&!title)continue;
      const url=driveUrl(value.trim());
      if(!url){showError('Vložte platný odkaz HTTPS z Google Disku nebo Dokumentů Google.');return;}
      links.push({title,url});
    }
    if(links.length||r.driveLinks)update.driveLinks=links;
    if(socialEntry){
      if(!update.title){showError('Doplňte název.');return;}
      if(socialPost){
        await saveSocialPost(form,fd,r,update,revision,isChanged,event.submitter?.hasAttribute('data-save-and-add'));
        return;
      }
      if(await persist(r.id,revision,update,false)&&update.channel!==socialChannel)location.hash=socialHref(update.channel);
      return;
    }
    if(doc){
      if(!update.title){showError('Doplňte název dokumentu.');return;}
      if(update.folderId&&!documentFolders().has(update.folderId)){showError('Vybraná složka už není dostupná.');return;}
      const file=form.elements.docFile.files[0];
      if(!record&&!file&&!links.length){showError('Přidejte soubor nebo odkaz z Google Disku.');return;}
      const controls=[...form.elements].filter(el=>!el.disabled);
      controls.forEach(el=>el.disabled=true);
      try{
        if(file){
          const ext=file.name.split('.').pop().toLowerCase();
          if(!['pdf','docx','pptx','xlsx'].includes(ext)||file.size>20*1024*1024)throw Error('Vyberte podporovaný soubor do 20 MB.');
          if(form.cachedUpload?.file!==file){
            form.cachedUpload={file,path:await upload(file,'documents')};
          }
          update.files=[...r.files,{name:file.name,path:form.cachedUpload.path}];
        }
        await persist(r.id,revision,update,false);
      }catch(error){showError(error.message);}
      finally{controls.forEach(el=>el.disabled=false);}
      return;
    }
    if(task){
      const choice=fd.get('ownerChoice');
      const member=members.find(row=>row.user_id===choice);
      const custom=fd.get('customOwner')?.trim();
      if(choice===otherOwner&&!custom){showError('Doplňte jméno nebo název držitele úkolu.');return;}
      if(choice&&choice!==otherOwner&&!member){showError('Vybraný uživatel už není v nabídce. Otevřete úkol znovu.');return;}
      update.owner=member?.display_name||(choice===otherOwner?custom:'');
      if(member||choice!==otherOwner||custom!==r.owner||membersReady){
        update.ownerId=member?.user_id??(choice===otherOwner&&custom===r.owner?r.ownerId??null:null);
      }
      update.tags=parseTags(fd.get('tags')||'');
    }
    if(meeting){
      update.title ||= 'Schůzka '+dateText(update.date);
      const addTask=event.submitter?.hasAttribute('data-save-and-add');
      if(await persist(r.id,revision,update,false) && addTask) editor(null,'project',r.id);
      return;
    }
    if(!task&&!note) update.links=fd.getAll('links');
    if(!update.title){showError('Doplňte název.');return;}
    if(!task&&update.url&&!/^\/(?!\/)[^\s?#]*$/.test(update.url)){showError('Cílovou URL zapište jako cestu začínající jedním lomítkem.');return;}
    if(task||note){await persist(r.id,revision,update,false);return;}
    const blocks=[...blockList.querySelectorAll('.content-block')];
    const drafts=blocks.map(block=>{
      const field=name=>block.querySelector('[name='+name+']');
      return {block,fields:Object.fromEntries(contentKeys.map(key=>[key,field(key).value.trim()])),
        fileInput:field('imageFile'),uploaded:field('uploadedImage')};
    });
    if(drafts.some(({fields})=>fields.image&&!/^https?:\/\//i.test(fields.image))){
      showError('Odkaz na obrázek musí začínat https:// nebo http://.');return;
    }
    if(drafts.some(({fileInput})=>fileInput.files[0]?.size>10*1024*1024)){
      showError('Obrázek může mít nejvýše 10 MB.');return;
    }
    const controls=[...form.elements].filter(element=>!element.disabled);
    controls.forEach(element=>element.disabled=true);
    try{
      update.contentBlocks=[];
      for(const {block,fields,fileInput,uploaded} of drafts){
        const file=fileInput.files[0];
        if(file){
          uploaded.value=await uploadImage(file);
          fileInput.value='';
          block.querySelector('[name=image]').value='';
          fields.image='';
          let preview=block.querySelector('img');
          if(!preview){
            preview=document.createElement('img');
            preview.className='content-image';
            uploaded.after(preview);
          }
          preview.src=await fileUrl(uploaded.value);
          preview.alt=fields.alt;
        }
        fields.image=fields.image||uploaded.value;
        if(Object.values(fields).some(Boolean)) update.contentBlocks.push(fields);
      }
      await persist(r.id,revision,update,false);
    }catch(error){
      showError(error.message);
    }finally{
      controls.forEach(element=>element.disabled=false);
    }
  });
  form.querySelector('[data-delete]')?.addEventListener('click',async()=>{
    if(!task&&listed().some(p=>p.id!==r.id&&(p.parent===r.id||p.links?.includes(r.id)))){
      showError('Nejdřív upravte podřízené stránky a interní odkazy vedoucí na tuto stránku.');
      return;
    }
    if(meeting&&allTasks().some(t=>t.meetingId===r.id)){
      showError('Zápis má navázané úkoly v roadmapě. Ponechte jej jako zdroj těchto úkolů.');
      return;
    }
    if(socialPost&&allTasks().some(t=>t.socialId===r.id&&!t.publicationTask)){
      showError('Příspěvek má navázané úkoly. Nejprve je odeberte.');return;
    }
    const tombstone={kind:r.kind,category:r.category,meetingId:r.meetingId,channel:r.channel,socialId:r.socialId};
    if(confirm('Smazat položku „'+r.title+'“?')&&await persist(r.id,revision,tombstone,true)&&socialPost)await load();
  });
  dialog.showModal();
  previews();
}
async function saveSocialPost(form,fd,record,update,revision,isChanged,addTask){
  const action=form.dataset.socialAction;
  const previous=record.review?.state;
  const decision=['approved','returned','published'].includes(action);
  const reviewer=fd.get('socialReviewer');
  const note=fd.get('decisionNote')?.trim()||'';
  const isNew=revision===0;
  if(!Object.hasOwn(socialFormats[update.channel],update.postFormat))delete update.postFormat;
  if(update.publishTime&&!update.date){showError('K času publikace doplňte datum.');return;}
  if(!update.publishTime)delete update.publishTime;
  if(decision&&isChanged()){showError('Nejdřív uložte změny draftu. Rozhodnutí platí pro uloženou verzi.');return;}
  if(action==='returned'&&!note){showError('Napište, co je potřeba upravit.');return;}
  if(action==='pending'&&(!socialReviewers.includes(reviewer)||!update.date)){
    showError('Vyberte schvalovatele a doplňte navrhovaný termín publikace.');
    return;
  }
  const controls=[...form.elements].filter(element=>!element.disabled);
  controls.forEach(element=>element.disabled=true);
  try{
    const kept=new Set([...form.querySelectorAll('[data-social-file]')].map(element=>element.dataset.socialFile));
    const files=fd.getAll('socialFiles').filter(file=>file.name);
    if(files.some(file=>file.size>20*1024*1024))throw Error('Soubor může mít nejvýše 20 MB. Větší soubor přidejte odkazem z Google Disku.');
    form.mediaUploads??=new Map();
    const media=socialMedia(record).filter(file=>kept.has(file.path));
    for(const file of files){
      const key=JSON.stringify([file.name,file.size,file.lastModified]);
      if(!form.mediaUploads.has(key))form.mediaUploads.set(key,await uploadSocialMedia(file));
      media.push(form.mediaUploads.get(key));
    }
    if(media.length||record.media)update.media=media;

    if(decision){
      update={...record,review:{...record.review,state:action,...(action==='published'?{}:{note})}};
    }else if(action==='pending'){
      update.review={state:'pending',reviewerId:reviewer,requestedBy:currentUserId()};
    }else if(['pending','approved'].includes(previous)&&['title','description','channel','date','postFormat','publishTime','driveLinks','media'].some(key=>
      JSON.stringify(update[key]??null)!==JSON.stringify(record[key]??null))){
      delete update.review;
      update.status='Návrh';
    }

    if(!await persist(record.id,revision,update,false))return;
    if(action||previous==='approved')await load();
    if(view==='some'&&socialChannel==='kalendar'){
      if(update.date&&(isNew||update.date!==record.date)){
        calendarMonth=update.date.slice(0,7);
        render();
      }
    }else if(view==='some'&&update.channel!==socialChannel)location.hash=socialHref(update.channel);
    if(addTask)editor(null,'social-task',null,null,record.id);
  }catch(error){showError(error.message);}
  finally{controls.forEach(element=>element.disabled=false);}
}
function showError(message){
  if(!dialog.open){flash(message);return;}
  const body=dialog.querySelector('.dialog-body');
  body.querySelector('.error')?.remove();
  const error=document.createElement('p');
  error.className='error';
  error.setAttribute('role','alert');
  error.textContent=message;
  body.prepend(error);
  body.scrollTop=0;
}
async function persist(id,version,record,deleted,{inline=false}={}){
  const controls=inline?[]:[...dialog.querySelectorAll('.dialog-head button,.dialog-foot button')];
  controls.forEach(button=>button.disabled=true);
  try{
    const response=await saveRecord(id,version,record,deleted,records.has(id)||versions.has(id));
    if(response.status===409){showError(inline?'Úkol mezitím někdo upravil. Zkontrolujte načtený stav.':'Položku mezitím někdo upravil. Zkopírujte rozpracované změny, zavřete kartu a znovu ji otevřete.');await load();return;}
    if(!response.ok) throw Error();
    const result=await response.json();
    if(deleted) records.delete(id);
    else records.set(id,record);
    versions.set(id,result.version);
    if(!inline){dialog.close();render();}
    flash(deleted?'Položka byla smazána.':'Změny byly uloženy.');
    return true;
  }catch{
    showError(inline?'Změnu v seznamu se nepodařilo uložit.':'Uložení se nepodařilo. Úpravy zůstaly ve formuláři. Zkuste uložit znovu.');
  }finally{
    controls.forEach(button=>button.disabled=false);
  }
}

document.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button) return;
  if(button.dataset.documentView&&button.dataset.documentView!==documentView){
    documentView=button.dataset.documentView;
    try{localStorage.setItem(documentViewKey,documentView);}catch{}
    render();
    main.querySelector('[data-document-view][aria-pressed="true"]')?.focus();
    return;
  }
  const {edit,go,map}=button.dataset;
  if(edit&&records.has(edit)) editor(records.get(edit));
  if(go) location.hash=go;
  if(button.dataset.meetingTask) editor(null,'project',button.dataset.meetingTask);
  if(button.dataset.newPageTask&&canOpen('web'))editor(null,'task',null,button.dataset.newPageTask);
  if(button.dataset.newSocialTask&&records.get(button.dataset.newSocialTask)?.kind==='social'){
    editor(null,'social-task',null,null,button.dataset.newSocialTask);
  }
  if(button.dataset.new) editor(null,button.dataset.new);
  if(button.dataset.newSocialDate) editor(null,'social',null,null,null,button.dataset.newSocialDate);
  if(map){mapMode=map;render();}
  if(button.hasAttribute('data-close')) dialog.close();
  if(button.hasAttribute('data-retry')) load();
  if(button.hasAttribute('data-clear')){
    Object.keys(filters).forEach(key=>filters[key]='');
    render();
  }
});
document.addEventListener('input',event=>{
  const key=event.target.dataset.filter;
  if(key){filters[key]=event.target.value;fillResults();}
});

dialog.addEventListener('cancel',event=>{
  if(dialog.querySelector('button[type=submit]')?.disabled) event.preventDefault();
});
await start();
signOutButton.onclick=signOut;
signOutButton.hidden=false;
window.addEventListener('hashchange',()=>{route();window.scrollTo(0,0);});
document.addEventListener('click',async event=>{
  const copyButton=event.target.closest('[data-copy-social-text]');
  if(copyButton){
    try{
      await navigator.clipboard.writeText(copyButton.form.elements.description.value);
      flash('Text příspěvku je zkopírovaný.');
    }catch{flash('Text se nepodařilo zkopírovat.');}
    return;
  }
  const videoButton=event.target.closest('[data-load-social-video]');
  if(videoButton){
    const figure=videoButton.closest('[data-social-file]');
    const video=figure.querySelector('video');
    videoButton.disabled=true;
    try{
      video.src=await fileUrl(figure.dataset.socialFile);
      video.hidden=false;
      videoButton.remove();
    }catch{
      flash('Video se nepodařilo načíst.');
      videoButton.disabled=false;
    }
    return;
  }
  const a=event.target.closest('[data-hub-file]'); if(!a)return;
  event.preventDefault();
  const tab=a.target==='_blank'?window.open('about:blank','_blank'):null;
  if(tab)tab.opener=null;
  try{
    const url=await fileUrl(a.dataset.hubFile);
    if(tab)tab.location.replace(url);
    else{const link=document.createElement('a');link.href=url;link.download=a.download||a.dataset.hubFile.split('/').pop();link.click();}
  }catch{tab?.close();flash('Soubor se nepodařilo otevřít.');}
});
route();
load();
