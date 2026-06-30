/* Sabit veri & yardımcılar data.js'ten gelir: PROVINCES, ALIASES, normKey,
   resolveProvince, DEFAULT_QUOTA, OPEN_PROVINCES */

/* ============ Durum ============ */
let STATE = {
  candidates: [],   // {sira, il, ad, soyad, prefsRaw:[], prefs:[{raw,canon,valid}], }
  quota: {...DEFAULT_QUOTA},
  result: null      // {placements:[{cand, placedProvince, prefRank}], remaining, unplaced[]}
};

/* ============ Excel okuma ============ */
document.getElementById('fileInput').addEventListener('change', e=>{
  const f = e.target.files[0]; if(!f) return;
  const reader = new FileReader();
  reader.onload = ev=>{
    try{
      const wb = XLSX.read(ev.target.result, {type:'array'});
      parseWorkbook(wb);
      document.getElementById('loadStatus').textContent = `Yüklendi: ${f.name}`;
    }catch(err){ alert('Dosya okunamadı: '+err.message); }
  };
  reader.readAsArrayBuffer(f);
});

function parseWorkbook(wb){
  // ilk sayfayı kullan (Sayfa1); ayrıştırma data.js'teki ortak fonksiyonda
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, raw:false});
  STATE.candidates = parseCandidateRows(rows);
  runPlacement();
  renderAll();
  document.getElementById('loadSummary').style.display='block';
}

/* ============ YERLEŞTİRME ALGORİTMASI ============
   Sıra numarasına göre (sira artan) serial dictatorship:
   her aday, kadrosu boş olan en yüksek sıradaki geçerli tercihine yerleşir. */
function runPlacement(){
  const remaining = {};
  for(const [p,n] of Object.entries(STATE.quota)) remaining[p]=Number(n)||0;
  const order = [...STATE.candidates].sort((a,b)=> a.sira-b.sira);
  const placements = [];
  for(const cand of order){
    let placed=null, rank=0;
    for(let i=0;i<cand.prefs.length;i++){
      const pr = cand.prefs[i];
      if(pr.valid && remaining[pr.canon]>0){
        placed = pr.canon; rank=i+1; remaining[pr.canon]--; break;
      }
    }
    placements.push({cand, placedProvince:placed, prefRank:rank});
  }
  STATE.result = {
    placements,
    remaining,
    unplaced: placements.filter(p=>!p.placedProvince).map(p=>p.cand)
  };
}

/* ============ Talep hesapları ============ */
function demandMaps(){
  const first = {}, total = {};
  for(const c of STATE.candidates){
    c.prefs.forEach((p,i)=>{
      if(!p.valid) return;
      total[p.canon]=(total[p.canon]||0)+1;
      if(i===0) first[p.canon]=(first[p.canon]||0)+1;
    });
  }
  return {first,total};
}

/* ============ RENDER ============ */
function renderAll(){ renderQuota(); renderResult(); renderConflict(); renderWarn(); renderLoadStats(); renderBadges(); renderDash(); }

/* ---- Dashboard (harita + tablo) ---- */
function placedByProvince(){
  const m={};
  if(STATE.result) STATE.result.placements.forEach(p=>{ if(p.placedProvince){(m[p.placedProvince]=m[p.placedProvince]||[]).push(p.cand);} });
  return m;
}
let dashSearchTerm='';
function dashFill(prov,placedMap){
  if(!isOpenKadro(prov)) return '#334155';
  const q=Number(STATE.quota[prov])||0, pl=(placedMap[prov]||[]).length;
  if(pl>=q) return '#ef4444';
  if(pl>0)  return '#f59e0b';
  return '#22c55e';
}
function renderDash(){
  const placedMap=placedByProvince();
  const {first}=demandMaps();
  const provs=Object.keys(STATE.quota);
  const totQ=sumQuota();
  const placed=STATE.result?STATE.result.placements.filter(p=>p.placedProvince).length:0;
  const full=provs.filter(p=>(placedMap[p]||[]).length>=(Number(STATE.quota[p])||0) && (Number(STATE.quota[p])||0)>0).length;
  document.getElementById('dashStats').innerHTML=`
    ${stat('acc',totQ,'Toplam Kadro')}
    ${stat('ok',placed,'Yerleşen')}
    ${stat(totQ-placed>0?'warn':'ok',totQ-placed,'Boş Kadro')}
    ${stat('acc',provs.length,'İl')}
    ${stat(full?'bad':'ok',full,'Tam Dolan İl')}
  `;
  // harita (container görünür olmasa da SVG çizilir)
  if(typeof renderTurkeyMap==='function'){
    renderTurkeyMap(document.getElementById('dashMap'),{
      fill:p=>dashFill(p,placedMap),
      label:p=> isOpenKadro(p)? `${(placedMap[p]||[]).length}/${Number(STATE.quota[p])||0}`:'',
      title:p=> isOpenKadro(p)? `${p}: ${(placedMap[p]||[]).length}/${Number(STATE.quota[p])||0} dolu`:`${p} (kadro yok)`,
      onHover:p=>{
        const el=document.getElementById('dashMapInfo'); if(!el) return;
        if(!p){el.innerHTML='Bir ilin üzerine gelin.';return;}
        if(!isOpenKadro(p)){el.innerHTML=`<b>${p}</b> — kadro yok`;return;}
        const q=Number(STATE.quota[p])||0, pl=placedMap[p]||[];
        const names=pl.sort((a,b)=>a.sira-b.sira).map(c=>`#${c.sira} ${c.ad} ${c.soyad}`).join(', ');
        el.innerHTML=`<b>${p}</b> — ${pl.length}/${q} dolu · boş ${q-pl.length}${names?' · '+names:''}`;
      }
    });
  }
  // tablo
  const term=dashSearchTerm.toLocaleLowerCase('tr-TR');
  const rows=provs.filter(p=>p.toLocaleLowerCase('tr-TR').includes(term))
    .sort((a,b)=>a.localeCompare(b,'tr')).map(p=>{
      const q=Number(STATE.quota[p])||0, pl=placedMap[p]||[], rem=q-pl.length;
      const names=pl.sort((a,b)=>a.sira-b.sira).map(c=>`#${c.sira} ${c.ad} ${c.soyad}`).join(', ');
      const d=first[p]||0;
      return `<tr>
        <td><b>${p}</b></td><td>${q}</td>
        <td>${pl.length}</td>
        <td><span class="pill ${rem>0?'ok':'bad'}">${rem}</span></td>
        <td>${d>q?`<span style="color:#fca5a5">${d}</span>`:d}</td>
        <td class="small muted">${names||'—'}</td>
      </tr>`;
    }).join('');
  document.getElementById('dashBody').innerHTML=rows||'<tr><td colspan="6" class="empty">Veri yok</td></tr>';

  renderDashAnalysis(placedMap, first);
}

function renderDashAnalysis(placedMap, first){
  const provs=Object.keys(STATE.quota);
  const n=STATE.candidates.length;
  const placed=STATE.result?STATE.result.placements.filter(p=>p.placedProvince).length:0;
  // boş/rahat iller (kalan kadro)
  const empty=provs.map(p=>({p,free:(Number(STATE.quota[p])||0)-(placedMap[p]||[]).length}))
    .filter(x=>x.free>0).sort((a,b)=>b.free-a.free);
  const emptyTotal=empty.reduce((s,x)=>s+x.free,0);
  // en çok rekabet (1. tercih talebi > kadro)
  const comp=provs.map(p=>({p,d:first[p]||0,q:Number(STATE.quota[p])||0}))
    .filter(x=>x.d>x.q).sort((a,b)=>(b.d-b.q)-(a.d-a.q));
  // açıkta kalma riski (yerleşemeyenler)
  const risk=(STATE.result?STATE.result.unplaced:[]).map(c=>{
    let reason='tüm tercihleri doldu';
    if(c.prefs.length===0) reason='tercih girmemiş';
    else if(!c.prefs.some(p=>p.valid && isOpenKadro(p.canon))) reason='geçersiz/kadrosuz tercih';
    return {c,reason};
  });

  const li=(l,c,r)=>`<div class="anarow"><span>${l}</span><span class="v" style="color:${c||'inherit'}">${r}</span></div>`;
  document.getElementById('anaEmpty').innerHTML = empty.length
    ? empty.map(x=>li(`<b>${x.p}</b>`,'#86efac',`${x.free} boş`)).join('') : '<div class="anaempty">Boş kadro yok 🎉</div>';
  document.getElementById('anaComp').innerHTML = comp.length
    ? comp.map(x=>li(`<b>${x.p}</b>`,'#fca5a5',`talep ${x.d} / kadro ${x.q}`)).join('') : '<div class="anaempty">Kontenjan aşımı yok</div>';
  document.getElementById('anaRisk').innerHTML = risk.length
    ? risk.sort((a,b)=>a.c.sira-b.c.sira).map(x=>li(`#${x.c.sira} ${(x.c.ad+' '+x.c.soyad).trim()||'(isim yok)'}`,'#fcd34d',x.reason)).join('')
    : '<div class="anaempty">Açıkta kalan yok 🎉</div>';

  document.getElementById('dashNarrative').innerHTML=
    `<b>${placed}/${n}</b> aday yerleşti, <b style="color:#fca5a5">${n-placed}</b> açıkta · `+
    `<b style="color:#fca5a5">${comp.length}</b> ilde kontenjan aşımı · `+
    `<b style="color:#86efac">${empty.length}</b> ilde toplam <b style="color:#86efac">${emptyTotal}</b> boş kadro.`;
}

function renderBadges(){
  document.getElementById('b-quota').textContent = Object.keys(STATE.quota).length;
  document.getElementById('b-result').textContent = STATE.result? STATE.result.placements.filter(p=>p.placedProvince).length : 0;
  const conf = conflictProvinces().length;
  document.getElementById('b-conflict').textContent = conf;
  document.getElementById('b-warn').textContent = warnCount();
}

function renderLoadStats(){
  const totalQ = sumQuota();
  const n = STATE.candidates.length;
  const placed = STATE.result? STATE.result.placements.filter(p=>p.placedProvince).length:0;
  const noPref = STATE.candidates.filter(c=>c.prefs.length===0).length;
  const invalid = STATE.candidates.filter(c=>c.prefs.some(p=>!p.valid)).length;
  const el = document.getElementById('loadStats');
  el.innerHTML = `
    ${stat('acc',n,'Aday')}
    ${stat('acc',totalQ,'Toplam Kadro')}
    ${stat(placed===n?'ok':'warn',placed,'Yerleşen')}
    ${stat(n-placed>0?'bad':'ok',n-placed,'Açıkta Kalan')}
    ${stat(noPref>0?'warn':'ok',noPref,'Hiç tercih girmemiş')}
    ${stat(invalid>0?'warn':'ok',invalid,'Geçersiz tercihi olan')}
  `;
}
function stat(cls,n,l){return `<div class="stat ${cls}"><div class="n">${n}</div><div class="l">${l}</div></div>`;}
function sumQuota(){return Object.values(STATE.quota).reduce((a,b)=>a+(Number(b)||0),0);}

/* ---- Kadrolar ---- */
let quotaSearchTerm='';
document.getElementById('quotaSearch').addEventListener('input',e=>{quotaSearchTerm=e.target.value;renderQuota();});
function renderQuota(){
  const {first,total}=demandMaps();
  const tot=sumQuota(), nc=STATE.candidates.length;
  document.getElementById('totalQuota').textContent=tot;
  document.getElementById('totalCandQ').textContent=nc;
  const tq=document.getElementById('totalQuota');
  tq.className='heat '+(tot<nc?'over':(tot===nc?'full':'free'));
  const bm=document.getElementById('balanceMsg');
  if(nc===0) bm.textContent='';
  else if(tot<nc) bm.innerHTML=`<span style="color:#fca5a5">⚠ ${nc-tot} kişi açıkta kalır (kadro yetersiz)</span>`;
  else if(tot===nc) bm.innerHTML=`<span style="color:#fcd34d">Kadro = aday (tam denge)</span>`;
  else bm.innerHTML=`<span style="color:#86efac">${tot-nc} kadro boş kalabilir</span>`;

  const body=document.getElementById('quotaBody');
  const names=[...new Set([...PROVINCES.filter(p=>STATE.quota[p]!=null), ...Object.keys(STATE.quota)])]
    .filter(p=>p.toLocaleLowerCase('tr-TR').includes(quotaSearchTerm.toLocaleLowerCase('tr-TR')))
    .sort((a,b)=>a.localeCompare(b,'tr'));
  body.innerHTML = names.map(p=>{
    const q=Number(STATE.quota[p])||0, f=first[p]||0, t=total[p]||0;
    let st,cls;
    if(f>q){st='ÇAKIŞMA';cls='bad';}
    else if(f===q && q>0){st='Tam dolu';cls='warn';}
    else {st='Uygun';cls='ok';}
    return `<tr class="qrow">
      <td><b>${p}</b></td>
      <td><input type="number" min="0" value="${q}" data-p="${p}" class="qinput"/></td>
      <td>${f}</td><td>${t}</td>
      <td><span class="pill ${cls}">${st}</span></td>
      <td><button class="btn sm ghost delprov" data-p="${p}">sil</button></td>
    </tr>`;
  }).join('');
  body.querySelectorAll('.qinput').forEach(inp=>inp.addEventListener('change',e=>{
    const p=e.target.dataset.p; const v=Math.max(0,Number(e.target.value)||0);
    STATE.quota[p]=v; runPlacement(); renderAll();
  }));
  body.querySelectorAll('.delprov').forEach(b=>b.addEventListener('click',e=>{
    delete STATE.quota[e.target.dataset.p]; runPlacement(); renderAll();
  }));
}
document.getElementById('addProvBtn').addEventListener('click',()=>{
  const name=prompt('Eklenecek il adı (örn. Konya):'); if(!name) return;
  const canon=resolveProvince(name)|| name.trim();
  const n=Number(prompt('Kadro sayısı:','1'))||1;
  STATE.quota[canon]=n; runPlacement(); renderAll();
});

/* ---- Sonuçlar ---- */
let resSearch='', resFilter='all';
document.getElementById('resultSearch').addEventListener('input',e=>{resSearch=e.target.value;renderResult();});
document.getElementById('resultFilter').addEventListener('change',e=>{resFilter=e.target.value;renderResult();});
function renderResult(){
  if(!STATE.result){document.getElementById('resultBody').innerHTML='';return;}
  const ps=STATE.result.placements;
  const n=ps.length, placed=ps.filter(p=>p.placedProvince).length;
  const p1=ps.filter(p=>p.prefRank===1).length;
  const notp1=placed-p1;
  document.getElementById('resultStats').innerHTML=`
    ${stat('acc',n,'Toplam Aday')}
    ${stat(placed===n?'ok':'warn',placed,'Yerleşen')}
    ${stat(n-placed>0?'bad':'ok',n-placed,'Açıkta Kalan')}
    ${stat('ok',p1,'1. Tercihine Yerleşen')}
    ${stat('warn',notp1,'Alt Tercihine Yerleşen')}
    ${stat('acc', placed?((p1/placed*100)|0)+'%':'-','1. Tercih Memnuniyeti')}
  `;
  const term=resSearch.toLocaleLowerCase('tr-TR');
  let list=ps.filter(p=>{
    const c=p.cand;
    const hay=(c.ad+' '+c.soyad+' '+(p.placedProvince||'')+' '+c.il).toLocaleLowerCase('tr-TR');
    if(term && !hay.includes(term)) return false;
    if(resFilter==='placed') return !!p.placedProvince;
    if(resFilter==='unplaced') return !p.placedProvince;
    if(resFilter==='p1') return p.prefRank===1;
    if(resFilter==='notp1') return p.placedProvince && p.prefRank!==1;
    return true;
  }).sort((a,b)=>a.cand.sira-b.cand.sira);

  document.getElementById('resultBody').innerHTML = list.map(p=>{
    const c=p.cand;
    const prefsHtml=c.prefs.map((pr,i)=>{
      let cl='pref', tip=(i+1)+'. tercih';
      if(!pr.valid){cl='pref invalid';tip='tanınmayan il';}
      else if(p.placedProvince===pr.canon) cl='pref win';
      else if(!isOpenKadro(pr.canon)){cl='pref nokadro';tip='açık kadrosu yok';}
      return `<span class="${cl}" title="${tip}">${i+1}.${pr.canon||pr.raw}</span>`;
    }).join(' ') || '<span class="muted small">— tercih yok —</span>';
    const placedCell = p.placedProvince
      ? `<span class="pill ${p.prefRank===1?'p1':'ok'}">${p.placedProvince}</span>`
      : `<span class="pill bad">AÇIKTA</span>`;
    const rankCell = p.placedProvince ? `${p.prefRank}. tercih` : '—';
    return `<tr>
      <td>${c.sira}</td>
      <td><b>${(c.ad||c.soyad)? (c.ad+' '+c.soyad).trim() : '<span class="muted">(isim girilmemiş)</span>'}</b></td>
      <td class="muted">${c.il||'-'}</td>
      <td>${placedCell}</td>
      <td>${rankCell}</td>
      <td>${prefsHtml}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="empty">Kayıt yok</td></tr>';
}

/* ---- Çakışmalar ---- */
function isOpenKadro(p){ return STATE.quota[p]!=null; }  // açık kadro listesinde mi
function conflictProvinces(){
  const {first}=demandMaps();
  return Object.keys(first)
    .filter(p=> isOpenKadro(p) && first[p] > (Number(STATE.quota[p])||0))   // sadece açık kadrolu iller
    .sort((a,b)=> (first[b]-(STATE.quota[b]||0)) - (first[a]-(STATE.quota[a]||0)));
}
function renderConflict(){
  const el=document.getElementById('conflictList');
  if(!STATE.result){el.innerHTML='<div class="empty">Önce veri yükleyin.</div>';return;}
  const provs=conflictProvinces();
  if(!provs.length){el.innerHTML='<div class="empty">🎉 1. tercih bazında çakışma yok.</div>';return;}
  // her aday nereye yerleşti haritası
  const placedMap=new Map(STATE.result.placements.map(p=>[p.cand,p]));
  el.innerHTML = provs.map(prov=>{
    const q=Number(STATE.quota[prov])||0;
    // bu ili 1. tercih yapan adaylar, sıra numarasına göre
    const seekers=STATE.candidates
      .filter(c=>c.prefs[0] && c.prefs[0].valid && c.prefs[0].canon===prov)
      .sort((a,b)=>a.sira-b.sira);
    const rows=seekers.map((c,idx)=>{
      const pl=placedMap.get(c);
      const won = pl.placedProvince===prov;
      let dest;
      if(won) dest=`<span class="pill ok">${prov}'e yerleşti</span>`;
      else if(pl.placedProvince) dest=`<span class="pill warn">${pl.placedProvince} (${pl.prefRank}. tercih)</span>`;
      else dest=`<span class="pill bad">AÇIKTA KALDI</span>`;
      return `<tr>
        <td>${idx+1}</td><td>${c.sira}</td><td><b>${c.ad} ${c.soyad}</b></td>
        <td>${dest}</td>
        <td>${c.prefs.map((pr,i)=>{
          let k='pref';
          if(!pr.valid) k='pref invalid';
          else if(pl.placedProvince===pr.canon) k='pref win';
          else if(!isOpenKadro(pr.canon)) k='pref nokadro';
          return `<span class="${k}">${i+1}.${pr.canon||pr.raw}</span>`;
        }).join(' ')}</td>
      </tr>`;
    }).join('');
    return `<details open>
      <summary>${prov} — kadro <b>${q}</b>, talep <b style="color:#fca5a5">${seekers.length}</b> (${seekers.length-q} fazla)</summary>
      <div class="tablewrap" style="max-height:none;margin-top:10px">
      <table><thead><tr><th>#</th><th>Sıra No</th><th>Aday</th><th>Sonuç</th><th>Tercihleri</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    </details>`;
  }).join('');
}

/* ---- Uyarılar ---- */
function warnItems(){
  const items=[];
  const noData=STATE.candidates.filter(c=>!c.ad && !c.soyad);
  if(noData.length) items.push({t:`Adı/verisi hiç girilmemiş ${noData.length} aday (sadece sıra no var)`,d:noData.map(c=>`#${c.sira}`)});
  const noPref=STATE.candidates.filter(c=>(c.ad||c.soyad) && c.prefs.length===0);
  if(noPref.length) items.push({t:`Hiç tercih girmemiş ${noPref.length} aday`,d:noPref.map(c=>`#${c.sira} ${c.ad} ${c.soyad}`)});
  const few=STATE.candidates.filter(c=>c.prefs.length>0 && c.prefs.length<15);
  if(few.length) items.push({t:`15'ten az tercih girmiş ${few.length} aday (açıkta kalma riski)`,d:few.map(c=>`#${c.sira} ${c.ad} ${c.soyad} (${c.prefs.length} tercih)`)});
  const inv=[], nokadro=[];
  STATE.candidates.forEach(c=>c.prefs.forEach((p,i)=>{
    if(!p.valid) inv.push(`#${c.sira} ${c.ad} ${c.soyad}: "${p.raw}" (tanınmayan il adı)`);
    else if(!isOpenKadro(p.canon)) nokadro.push(`#${c.sira} ${c.ad} ${c.soyad}: ${p.canon} (${i+1}. tercih) — açık kadrosu yok`);
  }));
  if(inv.length) items.push({t:`Tanınmayan il adı içeren ${inv.length} tercih`,d:inv});
  if(nokadro.length) items.push({t:`Açık kadrosu olmayan ile yapılmış ${nokadro.length} tercih (yerleşemez)`,d:nokadro});
  if(STATE.result){
    const un=STATE.result.unplaced;
    if(un.length) items.push({t:`Açıkta kalan ${un.length} aday`,d:un.map(c=>`#${c.sira} ${c.ad} ${c.soyad}`)});
  }
  // mevcut ile kadro yokluğu bilgilendirme
  return items;
}
function warnCount(){return warnItems().reduce((a,b)=>a+1,0);}
function renderWarn(){
  const el=document.getElementById('warnList');
  const items=warnItems();
  if(!items.length){el.innerHTML='<div class="empty">✅ Sorun bulunmadı.</div>';return;}
  el.innerHTML=items.map(it=>`<details><summary><span class="pill warn">${it.d.length}</span> &nbsp;${it.t}</summary>
    <ul class="small muted" style="margin:8px 0 0;columns:2">${it.d.map(x=>`<li>${x}</li>`).join('')}</ul></details>`).join('');
}

/* ---- Export ---- */
document.getElementById('exportResultBtn').addEventListener('click',()=>{
  if(!STATE.result){alert('Önce veri yükleyin.');return;}
  const data=STATE.result.placements.sort((a,b)=>a.cand.sira-b.cand.sira).map(p=>({
    'Sıra':p.cand.sira,'Ad':p.cand.ad,'Soyad':p.cand.soyad,'Mevcut İl':p.cand.il,
    'Yerleştiği İl':p.placedProvince||'AÇIKTA','Kaçıncı Tercih':p.placedProvince?p.prefRank:'',
    'Tercihler':p.cand.prefs.map((x,i)=>`${i+1}.${x.canon||x.raw}`).join(' | ')
  }));
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Yerlestirme');
  XLSX.writeFile(wb,'yerlestirme_sonuclari.xlsx');
});

/* lejant yardımcıları: zemin rengi (satır) ve metin/nokta rengi */
function legBg(color,label){return `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:16px"><i style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${color};border:1px solid #bbb"></i>${label}</span>`;}
function legDot(color,label){return `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:16px"><i style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${color}"></i><b style="color:${color}">${label}</b></span>`;}
function legendBox(itemsHtml){return `<div style="margin:0 0 12px;padding:8px 12px;background:#f4f6f8;border:1px solid #e2e6ea;border-radius:8px;font-size:11px;line-height:1.9"><b style="color:#555">Açıklama:</b> ${itemsHtml}</div>`;}

/* ---- Ortak PDF (yazdırılabilir, stilli) ---- */
function printReport(title, subtitle, bodyHtml, landscape, legendHtml){
  const now=new Date().toLocaleString('tr-TR');
  const size = landscape===false ? 'A4' : 'A4 landscape';
  const html=`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>${title}</title>
  <style>
    @page{size:${size};margin:14mm}
    html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    *{font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}
    body{color:#111;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    h1{font-size:18px;margin:0 0 2px} h2{font-size:14px;margin:16px 0 6px;color:#0c4a6e}
    .sub{color:#555;font-size:12px;margin-bottom:12px}
    .stats{display:flex;gap:16px;flex-wrap:wrap;margin:0 0 12px;font-size:13px}
    .stats b{font-size:16px;display:block} .stats .box{border:1px solid #ddd;border-radius:8px;padding:8px 14px;min-width:90px}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:6px}
    th,td{border:1px solid #ccc;padding:6px 8px;vertical-align:top}
    th{background:#0c4a6e;color:#fff;text-align:left;font-size:11px;text-transform:uppercase}
    td.t{color:#444;font-size:11px}
    tr:nth-child(even) td{background:rgba(0,0,0,.02)}
    .ok{color:#0a7a2f;font-weight:bold} .bad{color:#c0392b;font-weight:bold} .warn{color:#b9770e;font-weight:bold}
    .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;align-items:start}
    .foot{margin-top:14px;font-size:11px;color:#666}
    @media print{.noprint{display:none}}
  </style></head><body>
  <h1>${title}</h1>
  <div class="sub">Görevde Yükselme / Ünvan Değişikliği · ${now}${subtitle?' · '+subtitle:''}</div>
  ${legendHtml||''}
  ${bodyHtml}
  <div class="foot">Sıra numarasına göre otomatik yerleştirme. Bu çıktı bilgilendirme amaçlıdır.</div>
  <p class="noprint"><button onclick="window.print()" style="padding:10px 18px;font-size:14px;cursor:pointer">Yazdır / PDF Kaydet</button></p>
  </body></html>`;
  const w=window.open('','_blank'); w.document.write(html); w.document.close(); w.focus();
}

/* ---- Yerleştirme PDF ---- */
document.getElementById('pdfResultBtn').addEventListener('click',()=>{
  if(!STATE.result){alert('Önce veri yükleyin.');return;}
  const ps=STATE.result.placements;
  const term=(resSearch||'').toLocaleLowerCase('tr-TR');
  const filterLabel={all:'Tümü',placed:'Yerleşenler',unplaced:'Açıkta kalanlar',p1:'1. tercihine yerleşenler',notp1:'İlk tercihi dışına yerleşenler'}[resFilter]||'Tümü';
  const list=ps.filter(p=>{
    const c=p.cand;
    const hay=(c.ad+' '+c.soyad+' '+(p.placedProvince||'')+' '+c.il).toLocaleLowerCase('tr-TR');
    if(term && !hay.includes(term)) return false;
    if(resFilter==='placed') return !!p.placedProvince;
    if(resFilter==='unplaced') return !p.placedProvince;
    if(resFilter==='p1') return p.prefRank===1;
    if(resFilter==='notp1') return p.placedProvince && p.prefRank!==1;
    return true;
  }).sort((a,b)=>a.cand.sira-b.cand.sira);
  const n=ps.length, placed=ps.filter(p=>p.placedProvince).length, p1=ps.filter(p=>p.prefRank===1).length;
  const memnun = placed?Math.round(p1/placed*100):0;
  const rows=list.map(p=>{
    const c=p.cand;
    const yer = p.placedProvince?`<span class="ok">${p.placedProvince}</span>`:`<span class="bad">AÇIKTA</span>`;
    const rank = p.placedProvince ? `${p.prefRank}.` : '—';
    const trcs = c.prefs.map((x,i)=>`${i+1}.${x.canon||x.raw}`).join(', ');
    const rowbg = p.placedProvince ? (p.prefRank===1?'background:#eafaf0':'') : 'background:#fdecea';
    return `<tr style="${rowbg}"><td style="text-align:center">${c.sira}</td><td>${((c.ad||'')+' '+(c.soyad||'')).trim()||'-'}</td>
      <td>${c.il||'-'}</td><td>${yer}</td><td style="text-align:center">${rank}</td><td class="t">${trcs||'—'}</td></tr>`;
  }).join('');
  const body=`<div class="stats">
      <div class="box"><b>${n}</b>Toplam Aday</div>
      <div class="box"><b class="ok">${placed}</b>Yerleşen</div>
      <div class="box"><b class="bad">${n-placed}</b>Açıkta</div>
      <div class="box"><b>${p1}</b>1. Tercih</div>
      <div class="box"><b>${memnun}%</b>1. Tercih Oranı</div></div>
    <table><thead><tr><th style="width:42px;text-align:center">Sıra</th><th>Ad Soyad</th><th style="width:90px">Mevcut İl</th>
      <th style="width:110px">Yerleştiği İl</th><th style="width:60px;text-align:center">Tercih</th><th>Tüm Tercihleri</th></tr></thead>
      <tbody>${rows||'<tr><td colspan="6" style="text-align:center;color:#888">Kayıt yok</td></tr>'}</tbody></table>`;
  const legend=legendBox(
    legBg('#eafaf0','1. tercihine yerleşti')+
    legBg('#ffffff','Alt tercihine yerleşti')+
    legBg('#fdecea','Açıkta kaldı')+
    ' &nbsp;|&nbsp; '+legDot('#0a7a2f','Yerleştiği il')+legDot('#c0392b','AÇIKTA'));
  printReport('AFAD Şube Müdürü — Yerleştirme Sonuçları', `Filtre: <b>${filterLabel}</b>${term?` · Arama: "${term}"`:''} · ${list.length} kayıt`, body, true, legend);
});

/* ---- Çakışma PDF ---- */
document.getElementById('pdfConflictBtn').addEventListener('click',()=>{
  if(!STATE.result){alert('Önce veri yükleyin.');return;}
  const provs=conflictProvinces();
  const placedMap=new Map(STATE.result.placements.map(p=>[p.cand,p]));
  let body;
  if(!provs.length){ body='<p>🎉 1. tercih bazında kontenjan aşımı (çakışma) yok.</p>'; }
  else body=provs.map(prov=>{
    const q=Number(STATE.quota[prov])||0;
    const seekers=STATE.candidates.filter(c=>c.prefs[0] && c.prefs[0].valid && c.prefs[0].canon===prov).sort((a,b)=>a.sira-b.sira);
    const rows=seekers.map((c,i)=>{
      const pl=placedMap.get(c);
      const dest = pl.placedProvince===prov ? `<span class="ok">${prov}'e yerleşti</span>`
        : pl.placedProvince ? `<span class="warn">${pl.placedProvince} (${pl.prefRank}. tercih)</span>`
        : `<span class="bad">AÇIKTA KALDI</span>`;
      const trcs=c.prefs.map((x,j)=>`${j+1}.${x.canon||x.raw}`).join(', ');
      return `<tr><td style="text-align:center">${i+1}</td><td style="text-align:center">${c.sira}</td><td>${((c.ad||'')+' '+(c.soyad||'')).trim()||'-'}</td><td>${dest}</td><td class="t">${trcs}</td></tr>`;
    }).join('');
    return `<h2>${prov} — kadro ${q}, talep <span class="bad">${seekers.length}</span> (${seekers.length-q} fazla)</h2>
      <table><thead><tr><th style="width:34px">#</th><th style="width:70px">Sıra No</th><th>Aday</th><th style="width:200px">Sonuç</th><th>Tercihleri</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  }).join('');
  const legendC=legendBox(
    legDot('#0a7a2f','İlk tercihine yerleşti')+
    legDot('#b9770e','Alt tercihine düştü')+
    legDot('#c0392b','Açıkta kaldı'));
  printReport('AFAD Şube Müdürü — Çakışma Analizi', `${provs.length} ilde kontenjan aşımı`, body, false, legendC);
});

/* ---- Dashboard / Risk PDF ---- */
document.getElementById('pdfDashBtn').addEventListener('click',()=>{
  if(!STATE.result){alert('Önce veri yükleyin.');return;}
  const placedMap=placedByProvince(); const {first}=demandMaps();
  const provs=Object.keys(STATE.quota);
  const n=STATE.candidates.length, placed=STATE.result.placements.filter(p=>p.placedProvince).length;
  const empty=provs.map(p=>({p,free:(Number(STATE.quota[p])||0)-(placedMap[p]||[]).length})).filter(x=>x.free>0).sort((a,b)=>b.free-a.free);
  const emptyTotal=empty.reduce((s,x)=>s+x.free,0);
  const comp=provs.map(p=>({p,d:first[p]||0,q:Number(STATE.quota[p])||0})).filter(x=>x.d>x.q).sort((a,b)=>(b.d-b.q)-(a.d-a.q));
  const risk=(STATE.result.unplaced||[]).map(c=>{
    let reason='tüm tercihleri doldu';
    if(c.prefs.length===0) reason='tercih girmemiş';
    else if(!c.prefs.some(p=>p.valid && isOpenKadro(p.canon))) reason='geçersiz/kadrosuz tercih';
    return {c,reason};
  }).sort((a,b)=>a.c.sira-b.c.sira);
  const t=(head,rows)=>`<table><thead><tr>${head}</tr></thead><tbody>${rows||'<tr><td colspan="3" style="color:#888">—</td></tr>'}</tbody></table>`;
  const body=`<div class="stats">
      <div class="box"><b>${n}</b>Toplam Aday</div>
      <div class="box"><b class="ok">${placed}</b>Yerleşen</div>
      <div class="box"><b class="bad">${n-placed}</b>Açıkta</div>
      <div class="box"><b class="bad">${comp.length}</b>Çakışan İl</div>
      <div class="box"><b class="ok">${emptyTotal}</b>Boş Kadro (${empty.length} il)</div></div>
    <div class="grid3">
      <div><h2 style="color:#0a7a2f">🟢 Boş / rahat iller</h2>${t('<th>İl</th><th style="text-align:right">Boş</th>',empty.map(x=>`<tr><td>${x.p}</td><td style="text-align:right" class="ok">${x.free}</td></tr>`).join(''))}</div>
      <div><h2 style="color:#c0392b">🔴 En çok rekabet</h2>${t('<th>İl</th><th style="text-align:right">Talep/Kadro</th>',comp.map(x=>`<tr><td>${x.p}</td><td style="text-align:right" class="bad">${x.d}/${x.q}</td></tr>`).join(''))}</div>
      <div><h2 style="color:#b9770e">⚠️ Açıkta kalma riski</h2>${t('<th>Aday</th><th>Sebep</th>',risk.map(x=>`<tr><td>#${x.c.sira} ${((x.c.ad||'')+' '+(x.c.soyad||'')).trim()||'(isim yok)'}</td><td class="warn">${x.reason}</td></tr>`).join(''))}</div>
    </div>`;
  const legendD=legendBox(
    legDot('#0a7a2f','Boş kadro var (rahat)')+
    legDot('#c0392b','Talep > kadro (rekabet)')+
    legDot('#b9770e','Açıkta kalma riski'));
  printReport('AFAD Şube Müdürü — Süreç Özeti & Riskler',
    `${placed}/${n} yerleşti · ${comp.length} çakışma · ${empty.length} ilde ${emptyTotal} boş kadro`, body, false, legendD);
});
document.getElementById('exportQuotaBtn').addEventListener('click',()=>{
  const data=Object.entries(STATE.quota).sort((a,b)=>a[0].localeCompare(b[0],'tr')).map(([il,k])=>({'İl':il,'Kadro':k}));
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Kadrolar');
  XLSX.writeFile(wb,'kadrolar.xlsx');
});
document.getElementById('demoBtn').addEventListener('click',()=>{
  const head=['f','İL','Ad','Soyad','1. TERCİH','2. TERCİH','3. TERCİH','...(15. TERCİH e kadar)'];
  const ex=[head,[1,'RİZE','FARUK','TAŞER','HATAY','MERSİN','OSMANİYE',''],[2,'KİLİS','AHMET','ALANCI','KİLİS','','','']];
  const ws=XLSX.utils.aoa_to_sheet(ex);
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Sayfa1');
  XLSX.writeFile(wb,'ornek_format.xlsx');
});

/* ---- Tabs ---- */
document.getElementById('tabs').addEventListener('click',e=>{
  const t=e.target.closest('.tab'); if(!t) return;
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  document.getElementById('v-'+t.dataset.v).classList.add('active');
});

/* ============ Supabase (v2: hesaplı sistem) ============ */
(function(){ const inp=document.getElementById('sheetUrl'); inp.value = window.SHEET_URL || DEFAULT_SHEET_URL || ''; })();

let SB=null;
(function initSB(){
  const st=document.getElementById('sbState');
  if(!window.SUPABASE_URL||!window.SUPABASE_ANON_KEY){ st.innerHTML='<span style="color:#fca5a5">yapılandırılmamış (config.js boş)</span>'; return; }
  SB=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
  st.innerHTML='<span style="color:#86efac">bağlı</span>';
  const ak=localStorage.getItem('afad_admin_key'); if(ak) document.getElementById('adminKey').value=ak;
})();
function adminKey(){const k=document.getElementById('adminKey').value.trim();localStorage.setItem('afad_admin_key',k);return k;}

async function fetchSheetToState(url){
  const r=await fetch(sheetCsvUrl(url));
  if(!r.ok) throw new Error('HTTP '+r.status);
  const csv=await r.text();
  if(/<html/i.test(csv)) throw new Error('Sayfa herkese açık değil (giriş istiyor).');
  parseWorkbook(XLSX.read(csv,{type:'string'}));
}

// admin_export satırlarını STATE.candidates'a çevir
function loadFromRows(rows){
  STATE.candidates = rows.map(r=>{
    const prefsArr = Array.isArray(r.prefs)? r.prefs : (r.prefs? JSON.parse(r.prefs):[]);
    const prefs = prefsArr.map(name=>{const canon=resolveProvince(name);return {raw:name,canon,valid:!!canon};});
    return {sira:Number(r.sira), il:r.il||'', ad:r.ad||'', soyad:r.soyad||'', prefs};
  }).sort((a,b)=>a.sira-b.sira);
  runPlacement(); renderAll();
  document.getElementById('loadSummary').style.display='block';
}

async function pullFromSupabase(silent){
  if(!SB){ if(!silent) alert('Supabase yapılandırılmamış (config.js).'); return false; }
  const {data,error}=await SB.rpc('admin_export',{p_key:adminKey()});
  if(error){ if(!silent) alert('Hata: '+error.message); return false; }
  if(!data || data.length===0){ if(!silent) alert('Veri gelmedi. İki olası sebep:\n1) Henüz tohumlama yapılmadı → önce yeşil "🌱 İlk Kurulum: Sheet\'ten Tohumla" butonuna basın.\n2) Yönetici anahtarı yanlış → app_settings\'teki admin_key ile aynı olmalı.'); return false; }
  loadFromRows(data);
  document.getElementById('loadStatus').textContent=`Supabase'ten ${data.length} aday yüklendi (${new Date().toLocaleTimeString('tr-TR')}).`;
  return true;
}
document.getElementById('sbPull').addEventListener('click',()=>pullFromSupabase(false));
// açılışta: yönetici anahtarı kayıtlıysa otomatik Supabase'ten yükle
window.addEventListener('load', ()=>{ if(SB && localStorage.getItem('afad_admin_key')) pullFromSupabase(true); });

// İLK KURULUM: Sheet'ten tohumla (adaylar+şifre+mevcut tercih) — tek sefer
document.getElementById('seedBtn').addEventListener('click',async()=>{
  if(!SB){alert('Supabase yapılandırılmamış.');return;}
  if(!adminKey()){alert('Önce yönetici anahtarını girin.');return;}
  const url=document.getElementById('sheetUrl').value.trim();
  if(!url){alert('Tohumlama kaynağı (Google Sheets) bağlantısını girin.');return;}
  if(!confirm('İLK KURULUM: Sheet\'ten adaylar içe aktarılacak. Yeni adaylara varsayılan şifre üretilip indirilecek. Mevcut adayların şifreleri korunur. Devam?')) return;
  const am=document.getElementById('adminMsg'); am.textContent='Sheet çekiliyor…';
  try{ await fetchSheetToState(url); }catch(e){ am.textContent=''; alert('Sheet çekilemedi: '+e.message); return; }
  am.textContent='Adaylar yazılıyor…';
  const candRows=STATE.candidates.map(c=>({sira:c.sira,ad:c.ad,soyad:c.soyad,il:c.il}));
  const {data:seeded,error:e1}=await SB.rpc('admin_seed',{p_key:adminKey(),p_rows:candRows});
  if(e1){am.textContent='';alert('Hata: '+e1.message);return;}
  if(!seeded || seeded.length===0){am.textContent='';
    alert('Yetkisiz: yönetici anahtarı YANLIŞ — hiçbir kayıt yazılmadı.\n\nGirdiğiniz anahtar, Supabase\'te SUPABASE_KURULUM.sql ile yazdığınız admin_key ile birebir aynı olmalı.\nKontrol: Supabase SQL Editor → select value from app_settings where key=\'admin_key\';');
    return;}
  const prefRows=STATE.candidates.map(c=>({sira:c.sira,prefs:c.prefs.filter(p=>p.valid&&isOpenKadro(p.canon)).map(p=>p.canon)})).filter(r=>r.prefs.length);
  await SB.rpc('admin_seed_prefs',{p_key:adminKey(),p_rows:prefRows});
  const newPw=seeded.filter(r=>r.password && r.password!=='(mevcut)');
  if(newPw.length){
    const ws=XLSX.utils.json_to_sheet(newPw.map(r=>({'Sıra':r.sira,'Ad':r.ad,'Soyad':r.soyad,'İl':r.il,'Varsayılan Şifre':String(r.password)})));
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Sifreler'); XLSX.writeFile(wb,'aday_varsayilan_sifreler.xlsx');
  }
  am.textContent=`✓ ${seeded.length} aday işlendi · ${newPw.length} yeni şifre üretildi (indirildi).`;
  await pullFromSupabase(true);
});

// Şifre sıfırla (tek aday)
document.getElementById('rstBtn').addEventListener('click',async()=>{
  if(!SB){alert('Supabase yapılandırılmamış.');return;}
  const s=Number(document.getElementById('rstSira').value.trim());
  if(!s){alert('Sıra no girin.');return;}
  if(!confirm(`#${s} adayının şifresi sıfırlanacak ve yeni varsayılan üretilecek. Devam?`)) return;
  const {data,error}=await SB.rpc('admin_reset_password',{p_key:adminKey(),p_sira:s});
  if(error){alert('Hata: '+error.message);return;}
  if(!data){alert('Yetkisiz ya da aday bulunamadı.');return;}
  document.getElementById('adminMsg').textContent=`#${s} yeni şifre: ${data}`;
  alert(`#${s} için yeni varsayılan şifre: ${data}\n(Adaya iletin; ilk girişte değiştirecek.)`);
});

async function setLock(state){
  if(!SB){alert('Supabase yapılandırılmamış.');return;}
  if(!confirm(state?'Tüm tercihler KİLİTLENECEK; adaylar değiştiremeyecek. Devam?':'Tercih değişikliği yeniden AÇILACAK. Devam?')) return;
  const {data,error}=await SB.rpc('admin_set_lock',{p_key:adminKey(),p_locked:state});
  if(error){alert('Hata: '+error.message);return;}
  if(data<0){alert('Yetkisiz: yönetici anahtarını kontrol edin.');return;}
  alert((state?'Kilitlendi':'Açıldı')+`: ${data} aday.`);
}
document.getElementById('sbLock').addEventListener('click',()=>setLock(true));
document.getElementById('sbUnlock').addEventListener('click',()=>setLock(false));

/* Dashboard: Supabase'ten canlı yenile + otomatik yenileme */
async function dashRefresh(){
  if(!SB){alert('Supabase yapılandırılmamış (config.js).');return false;}
  const {data,error}=await SB.rpc('admin_export',{p_key:adminKey()});
  if(error){alert('Hata: '+error.message);return false;}
  if(!data||!data.length){alert('Yetkisiz ya da kayıt yok.');return false;}
  loadFromRows(data);
  document.getElementById('dashRefAt').textContent='son güncelleme: '+new Date().toLocaleTimeString('tr-TR');
  return true;
}
let _autoTimer=null;
document.getElementById('dashRefresh').addEventListener('click',dashRefresh);
document.getElementById('dashAuto').addEventListener('change',e=>{
  if(e.target.checked){ _autoTimer=setInterval(dashRefresh,15000); dashRefresh(); }
  else { clearInterval(_autoTimer); _autoTimer=null; }
});

document.getElementById('dashSearch').addEventListener('input',e=>{dashSearchTerm=e.target.value;renderDash();});

/* ilk açılış: kadro tablosunu + dashboard'u doldur */
renderQuota();
renderDash();
