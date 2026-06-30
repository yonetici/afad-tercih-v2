const MAX=Number(window.MAX_PREFS)||15;
let sb=null, me=null, chosen=[], rem={}, locked=false, savedPrefs=[], SEEKERS={};

if(!window.SUPABASE_URL||!window.SUPABASE_ANON_KEY){
  document.getElementById('cfgWarn').classList.remove('hidden');
}else{
  sb=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
  document.getElementById('loginCard').classList.remove('hidden');
  ['Başkanlık',...[...PROVINCES].sort((a,b)=>a.localeCompare(b,'tr'))].forEach(p=>{
    const o=document.createElement('option');o.value=p;o.textContent=p;document.getElementById('fIl').appendChild(o);
  });
}
document.getElementById('fSira').addEventListener('input',e=>{e.target.value=e.target.value.replace(/\D/g,'');});

/* ---- GİRİŞ ---- */
document.getElementById('loginBtn').addEventListener('click',async()=>{
  const sira=Number(document.getElementById('fSira').value.trim());
  const il=document.getElementById('fIl').value;
  const pass=document.getElementById('fPass').value;
  const m=document.getElementById('loginMsg');
  if(!sira||!il||!pass){m.innerHTML='<div class="msg bad">Sıra no, il ve şifreyi girin.</div>';return;}
  const {data,error}=await sb.rpc('login',{p_sira:sira,p_il:il,p_password:pass});
  if(error){m.innerHTML=`<div class="msg bad">${error.message}</div>`;return;}
  if(!data.ok){
    const t={NOTFOUND:'Bu sıra numarası bulunamadı.',BADIL:'Sıra no ile il eşleşmiyor.',BADPASS:'Şifre hatalı.'}[data.err]||'Giriş başarısız.';
    m.innerHTML=`<div class="msg bad">${t}</div>`;return;
  }
  me={sira,il,password:pass,ad:data.ad||'',soyad:data.soyad||''};
  if(data.must_change){ openPwChange(); return; }
  await enterEditor(data);
});

/* ---- İLK GİRİŞ: ŞİFRE DEĞİŞTİR ---- */
function openPwChange(){
  document.getElementById('loginCard').classList.add('hidden');
  document.getElementById('pwCard').classList.remove('hidden');
}
document.getElementById('pwBtn').addEventListener('click',async()=>{
  const n1=document.getElementById('np1').value, n2=document.getElementById('np2').value;
  const m=document.getElementById('pwMsg');
  if(n1.length<4){m.innerHTML='<div class="msg bad">Şifre en az 4 karakter olmalı.</div>';return;}
  if(n1!==n2){m.innerHTML='<div class="msg bad">Şifreler eşleşmiyor.</div>';return;}
  const {data,error}=await sb.rpc('change_password',{p_sira:me.sira,p_il:me.il,p_old:me.password,p_new:n1});
  if(error){m.innerHTML=`<div class="msg bad">${error.message}</div>`;return;}
  if(data!=='OK'){m.innerHTML=`<div class="msg bad">Hata: ${data}</div>`;return;}
  me.password=n1;
  document.getElementById('pwCard').classList.add('hidden');
  // şifre değişti; tercihleri çekmek için tekrar login
  const {data:ld}=await sb.rpc('login',{p_sira:me.sira,p_il:me.il,p_password:n1});
  await enterEditor(ld);
});

/* ---- EDİTÖRE GİR ---- */
async function enterEditor(loginData){
  document.getElementById('loginCard').classList.add('hidden');
  document.getElementById('logoutBtn').classList.remove('hidden');
  document.getElementById('reportBtn').classList.remove('hidden');
  locked=!!loginData.locked;
  const aq=await sb.rpc('available_quota',{p_sira:me.sira});
  rem={}; (aq.data||[]).forEach(r=>rem[r.il]=r.kalan);
  const ps=await sb.rpc('province_seekers',{p_sira:me.sira});
  SEEKERS={}; (ps.data||[]).forEach(r=>{(SEEKERS[r.il]=SEEKERS[r.il]||[]).push(r);});
  const saved=Array.isArray(loginData.prefs)?loginData.prefs.filter(x=>OPEN_PROVINCES.includes(x)):[];
  chosen=saved.slice(0,MAX); savedPrefs=saved.slice(0,MAX);
  document.getElementById('meInfo').innerHTML=`👤 <b>#${me.sira} — ${((me.ad||'')+' '+(me.soyad||'')).trim()||'(isim yok)'}</b> · Mevcut il: ${me.il}`;
  document.getElementById('lockNote').innerHTML = locked
    ? '<div class="msg bad">🔒 Tercih dönemi kapalı. Görüntüleyebilir ama değiştiremezsiniz.</div>' : '';
  document.getElementById('saveBtn').disabled=locked;
  document.getElementById('prefCard').classList.remove('hidden');
  await drawMap(); renderAll();
  try{ if(window.Notification && Notification.permission==='default') Notification.requestPermission(); }catch(e){}
  startPolling();
}

/* ---- Üst sıradakiler değişince bildirim (periyodik kontrol) ---- */
let pollTimer=null;
function startPolling(){
  if(pollTimer) clearInterval(pollTimer);
  pollTimer=setInterval(poll, 25000);
}
async function poll(){
  if(!me) return;
  const before=projection();
  const [aq,ps]=await Promise.all([
    sb.rpc('available_quota',{p_sira:me.sira}),
    sb.rpc('province_seekers',{p_sira:me.sira})
  ]);
  if(aq && aq.data){ rem={}; aq.data.forEach(r=>rem[r.il]=r.kalan); }
  if(ps && ps.data){ SEEKERS={}; ps.data.forEach(r=>{(SEEKERS[r.il]=SEEKERS[r.il]||[]).push(r);}); }
  renderAll();
  const after=projection();
  if(JSON.stringify(before)!==JSON.stringify(after)) notifyChange(before, after);
}
function notifyChange(oldP, newP){
  const msg = newP
    ? `Üst sıradaki bir aday tercih yaptı. Tahmini yerleşmeniz «${oldP||'yok'}» → «${newP}» olarak değişti. (${newP===chosen[0]?'1.':(chosen.indexOf(newP)+1)+'.'} tercihiniz)`
    : 'Üst sıradaki adaylar yüzünden seçtiğiniz iller doldu; şu an yerleşme görünmüyor. Lütfen uygun (yeşil) illerden yeni tercih ekleyin.';
  const t=document.getElementById('toast'); document.getElementById('toastMsg').innerHTML=msg; t.classList.remove('hidden');
  setTimeout(()=>t.classList.add('hidden'), 15000);
  try{ if(window.Notification && Notification.permission==='granted') new Notification('AFAD Tercih — yerleşme değişti', {body:msg}); }catch(e){}
}
document.getElementById('logoutBtn').addEventListener('click',()=>location.reload());

/* ---- Tüm yerleştirme raporu ---- */
let REPORT=[];
document.getElementById('reportBtn').addEventListener('click',async()=>{
  const btn=document.getElementById('reportBtn'); btn.disabled=true;
  const {data,error}=await sb.rpc('placement_report');
  btn.disabled=false;
  if(error){alert('Rapor alınamadı: '+error.message);return;}
  REPORT=data||[];
  document.getElementById('reportNote').innerHTML = locked
    ? '✅ Kesin sonuç (tercih dönemi kapalı).'
    : '⏳ Geçici sonuç — dönem henüz açık; adaylar tercih değiştirdikçe değişebilir.';
  renderReport();
  document.getElementById('reportOverlay').classList.remove('hidden');
});
document.getElementById('reportClose').addEventListener('click',()=>document.getElementById('reportOverlay').classList.add('hidden'));
document.getElementById('reportSearch').addEventListener('input',renderReport);
function renderReport(){
  const term=normKey(document.getElementById('reportSearch').value);
  const n=REPORT.length, placed=REPORT.filter(r=>r.placed).length, p1=REPORT.filter(r=>r.rank===1).length;
  document.getElementById('reportStats').innerHTML=
    `<span>Toplam: <b>${n}</b></span> <span style="color:#86efac">Yerleşen: <b>${placed}</b></span> `+
    `<span style="color:#fca5a5">Açıkta: <b>${n-placed}</b></span> <span>1. Tercih: <b>${p1}</b></span>`;
  const rows=REPORT.filter(r=>{const h=normKey((r.ad||'')+(r.soyad||'')+(r.placed||'')+(r.il||''));return term===''||h.includes(term);})
    .map(r=>{
      const mine=me&&r.sira===me.sira;
      const yer=r.placed?`<span class="pill ok">${r.placed}</span>`:'<span class="pill bad">AÇIKTA</span>';
      return `<tr style="${mine?'background:rgba(56,189,248,.18)':''}"><td>${r.sira}</td><td><b>${((r.ad||'')+' '+(r.soyad||'')).trim()||'-'}</b>${mine?' 👈 siz':''}</td><td class="muted">${r.il||'-'}</td><td>${yer}</td><td>${r.placed?r.rank+'. tercih':'—'}</td></tr>`;
    }).join('');
  document.getElementById('reportBody').innerHTML=rows||'<tr><td colspan="5" style="text-align:center;color:#888;padding:20px">Kayıt yok</td></tr>';
}

/* ---- yardımcılar (sim ile aynı) ---- */
function isOpen(p){return DEFAULT_QUOTA[p]!=null;}
function canAdd(p){return isOpen(p)&&(rem[p]||0)>0&&!chosen.includes(p)&&chosen.length<MAX;}
function projection(){for(const p of chosen){if((rem[p]||0)>0)return p;}return null;}
function toggle(p){ if(locked||!isOpen(p))return; const i=chosen.indexOf(p);
  if(i>=0)chosen.splice(i,1); else if(canAdd(p))chosen.push(p); else return; renderAll(); }
function move(i,d){ if(locked)return; const j=i+d; if(j<0||j>=chosen.length)return; [chosen[i],chosen[j]]=[chosen[j],chosen[i]]; renderAll(); }

function mapFill(p){ if(!isOpen(p))return '#334155'; if(chosen.includes(p))return '#0ea5e9'; return (rem[p]||0)>0?'#22c55e':'#ef4444'; }
function mapLabel(p){ if(!isOpen(p))return ''; const i=chosen.indexOf(p); return i>=0?`${i+1}·${p}`:p; }
function mapInfo(p){ const el=document.getElementById('mapInfo');
  if(!p){el.innerHTML='Bir ilin üzerine gelin ya da tıklayın.';return;}
  if(!isOpen(p)){el.innerHTML=`<b>${p}</b> — açık kadro yok`;return;}
  const i=chosen.indexOf(p),k=rem[p]||0;
  const d=i>=0?`<span style="color:#7dd3fc">${i+1}. tercihiniz</span>`:(k>0?'<span style="color:#86efac">uygun</span>':'<span style="color:#fca5a5">dolu</span>');
  const sk=SEEKERS[p]||[];
  let extra = sk.length? ` · 👥 üstünde <b>${sk.length}</b> kişi istiyor` : '';
  if(k<=0){
    const fillers=sk.filter(x=>x.placed).map(x=>`#${x.sira} ${((x.ad||'')+' '+(x.soyad||'')).trim()}`);
    if(fillers.length) extra += `<br><span style="color:#fca5a5">Kadroyu dolduran: ${fillers.join(', ')}</span>`;
  }
  el.innerHTML=`<b>${p}</b> — ${DEFAULT_QUOTA[p]} kadro · size kalan <b>${k}</b> · ${d}${extra}`; }
async function drawMap(){ await renderTurkeyMap(document.getElementById('mapBox'),{
  fill:mapFill,label:mapLabel,labelSize:9,onClick:toggle,onHover:mapInfo,
  title:p=>isOpen(p)?`${p} — ${DEFAULT_QUOTA[p]} kadro · kalan ${rem[p]||0}`:`${p} (kadro yok)`}); }
function repaintMap(){ drawMap(); }

let term='';
document.getElementById('search').addEventListener('input',e=>{term=normKey(e.target.value);renderTable();});
function renderTable(){
  const rows=OPEN_PROVINCES.filter(p=>term===''||normKey(p).includes(term)).map(p=>{
    const k=rem[p]||0,ch=chosen.includes(p);
    const durum=ch?'<span class="pill ok">seçildi</span>':(k>0?'<span class="pill ok">uygun</span>':'<span class="pill bad">dolu</span>');
    const btn=ch?`<button class="btn ghost sm" data-rm="${p}" ${locked?'disabled':''}>çıkar</button>`:`<button class="btn sm" data-add="${p}" ${canAdd(p)&&!locked?'':'disabled'}>ekle</button>`;
    const sk=SEEKERS[p]||[]; const above=sk.length;
    const aboveCell=above?`<span title="${sk.map(x=>'#'+x.sira+' '+((x.ad||'')+' '+(x.soyad||'')).trim()+(x.placed?' (yerleşti)':'')).join('\n')}">${above}</span>`:'0';
    return `<tr class="${k>0||ch?'':'full'}"><td><b>${p}</b></td><td>${DEFAULT_QUOTA[p]}</td><td>${k}</td><td>${aboveCell}</td><td>${durum}</td><td>${btn}</td></tr>`;
  }).join('');
  const b=document.getElementById('availBody'); b.innerHTML=rows;
  b.querySelectorAll('[data-add]').forEach(x=>x.onclick=()=>toggle(x.dataset.add));
  b.querySelectorAll('[data-rm]').forEach(x=>x.onclick=()=>toggle(x.dataset.rm));
}
function renderChosen(){
  const ol=document.getElementById('chosen');
  ol.innerHTML=chosen.map((p,i)=>`<li><span class="rank">${i+1}</span><span class="name">${p}</span><span class="q">${DEFAULT_QUOTA[p]} kadro</span>
    <button class="btn ghost sm" ${i===0||locked?'disabled':''} data-up="${i}">▲</button>
    <button class="btn ghost sm" ${i===chosen.length-1||locked?'disabled':''} data-down="${i}">▼</button>
    <button class="btn ghost sm" ${locked?'disabled':''} data-del="${i}">✕</button></li>`).join('')
    || '<li class="muted" style="justify-content:center">Henüz tercih eklemediniz.</li>';
  ol.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>move(+b.dataset.up,-1));
  ol.querySelectorAll('[data-down]').forEach(b=>b.onclick=()=>move(+b.dataset.down,1));
  ol.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>toggle(chosen[+b.dataset.del]));
}
function renderProj(){
  const p=projection(),el=document.getElementById('proj');
  if(!chosen.length){el.className='msg info proj';el.innerHTML='Henüz tercih yok. Uygun (yeşil) illerden seçin.';return;}
  if(p){el.className='msg ok proj';el.innerHTML=`✅ Mevcut seçimlerinize ve üst sıradakilere göre tahmini yerleşeceğiniz il: <b>${p}</b> (${chosen.indexOf(p)+1}. tercihiniz).`;}
  else{el.className='msg bad proj';el.innerHTML='⚠ Seçtiğiniz iller dolmuş görünüyor. Uygun (yeşil) illerden ekleyin.';}
}
function renderCnt(){const c=document.getElementById('cnt');c.textContent=`${chosen.length}/${MAX}`;c.className='counter'+(chosen.length>=MAX?' full':'');}
function renderEasy(){
  const box=document.getElementById('easyBox'),chips=document.getElementById('easyChips');
  if(locked||chosen.length>=MAX){box.style.display='none';return;} box.style.display='block';
  const list=OPEN_PROVINCES.filter(p=>!chosen.includes(p)&&(rem[p]||0)>0).sort((a,b)=>(rem[b]||0)-(rem[a]||0)).slice(0,8);
  chips.innerHTML=list.map(p=>`<button class="btn ghost sm" data-easy="${p}" style="border-color:#16a34a">${p} <span style="opacity:.7">(${rem[p]} boş)</span></button>`).join('')||'<span class="muted" style="font-size:12px">Tüm uygun iller seçildi.</span>';
  chips.querySelectorAll('[data-easy]').forEach(b=>b.onclick=()=>toggle(b.dataset.easy));
}
function renderSummary(){
  const el=document.getElementById('summaryBox'); if(!el) return;
  let proj=null; for(const p of savedPrefs){ if((rem[p]||0)>0){proj=p;break;} }
  const list = savedPrefs.length
    ? savedPrefs.map((p,i)=>`<span style="display:inline-block;background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:2px 8px;margin:2px">${i+1}. ${p}</span>`).join(' ')
    : '<span class="muted">Henüz kayıtlı tercihiniz yok.</span>';
  const projHtml = savedPrefs.length
    ? (proj?`Mevcut duruma göre tahmini yerleşeceğiniz il: <b style="color:#86efac">${proj}</b> (${savedPrefs.indexOf(proj)+1}. tercih).`
           :'<b style="color:#fca5a5">Kayıtlı tercihlerinizle şu an yerleşme görünmüyor.</b>')
    : '';
  const unsaved = JSON.stringify(savedPrefs)!==JSON.stringify(chosen);
  el.innerHTML = `<div style="font-weight:700;margin-bottom:6px">📋 Kayıtlı Tercih Özetiniz</div>
    <div>${list}</div>
    ${projHtml?`<div style="margin-top:8px">${projHtml}</div>`:''}
    ${unsaved?'<div style="margin-top:8px;color:#fcd34d">⚠ Kaydedilmemiş değişiklikleriniz var — aşağıdan <b>Tercihlerimi Kaydet</b>\'e basın.</div>':''}
    <div class="muted" style="margin-top:8px;font-size:12px">Nihai yerleştirme, tüm adaylar tercihlerini girip dönem kapandıktan sonra kesinleşir.</div>`;
}
function renderAll(){renderCnt();renderProj();renderEasy();renderTable();renderChosen();repaintMap();renderSummary();}

/* ---- KAYDET ---- */
document.getElementById('saveBtn').addEventListener('click',async()=>{
  if(!me)return;
  if(chosen.length===0 && !confirm('Hiç tercih eklemediniz. Boş kaydedilsin mi?'))return;
  const btn=document.getElementById('saveBtn');btn.disabled=true;btn.textContent='Kaydediliyor…';
  const {data,error}=await sb.rpc('save_preferences',{p_sira:me.sira,p_il:me.il,p_password:me.password,p_prefs:chosen});
  btn.disabled=false;btn.textContent='✔ Tercihlerimi Kaydet';
  const m=document.getElementById('saveMsg');
  const t={OK:null,LOCKED:'Tercih dönemi kapalı, değiştirilemez.',MUSTCHANGE:'Önce şifrenizi değiştirmelisiniz.',BADPASS:'Oturum doğrulanamadı, tekrar giriş yapın.',BADIL:'Kimlik doğrulanamadı.',NOTFOUND:'Kayıt bulunamadı.'};
  if(error){m.innerHTML=`<div class="msg bad">Hata: ${error.message}</div>`;return;}
  if(data==='OK'){ savedPrefs=chosen.slice(); renderSummary(); m.innerHTML=`<div class="msg ok">✅ Tercihleriniz kaydedildi (${chosen.length} tercih).</div>`; }
  else m.innerHTML=`<div class="msg bad">${t[data]||('Beklenmeyen yanıt: '+data)}</div>`;
});

/* ---- PDF özet ---- */
document.getElementById('printBtn').addEventListener('click',()=>{
  if(!me)return; const proj=projection(); const now=new Date().toLocaleString('tr-TR');
  const rows=chosen.map((p,i)=>`<tr><td style="text-align:center">${i+1}</td><td>${p}</td><td style="text-align:center">${DEFAULT_QUOTA[p]}</td></tr>`).join('')||'<tr><td colspan="3" style="text-align:center;color:#888">Tercih yok</td></tr>';
  const html=`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>Tercih Özeti #${me.sira}</title>
  <style>body{font-family:Arial;color:#111;padding:32px;max-width:640px;margin:auto}h1{font-size:18px;margin:0 0 4px}.sub{color:#555;font-size:13px;margin-bottom:18px}
  .box{border:1px solid #ccc;border-radius:8px;padding:14px;margin-bottom:16px}.box b{display:inline-block;min-width:120px}
  table{width:100%;border-collapse:collapse;margin-top:6px}th,td{border:1px solid #ccc;padding:8px 10px}th{background:#f1f5f9;text-align:left}
  .proj{background:#ecfdf5;border:1px solid #10b981;border-radius:8px;padding:12px}@media print{.noprint{display:none}}</style></head><body>
  <h1>AFAD Şube Müdürü — Tercih Özeti</h1><div class="sub">${now}</div>
  <div class="box"><div><b>Sıra No:</b> ${me.sira}</div><div><b>Ad Soyad:</b> ${(me.ad+' '+me.soyad).trim()||'-'}</div><div><b>Mevcut İl:</b> ${me.il}</div></div>
  <table><thead><tr><th style="width:60px;text-align:center">Sıra</th><th>Tercih</th><th style="width:70px;text-align:center">Kadro</th></tr></thead><tbody>${rows}</tbody></table>
  <p class="proj">${proj?`Tahmini yerleşme: <b>${proj}</b> (${chosen.indexOf(proj)+1}. tercih).`:'Mevcut seçimlerle yerleşme görünmüyor.'}</p>
  <p class="noprint"><button onclick="window.print()" style="padding:10px 16px;font-size:14px;cursor:pointer">Yazdır / PDF Kaydet</button></p></body></html>`;
  const w=window.open('','_blank');w.document.write(html);w.document.close();w.focus();
});
