/* ============ Ortak veri & yardımcılar (hem admin hem aday sayfası kullanır) ============ */

/* Türkiye 81 il (kanonik isimler) */
const PROVINCES = ["Adana","Adıyaman","Afyonkarahisar","Ağrı","Amasya","Ankara","Antalya","Artvin","Aydın","Balıkesir","Bilecik","Bingöl","Bitlis","Bolu","Burdur","Bursa","Çanakkale","Çankırı","Çorum","Denizli","Diyarbakır","Edirne","Elazığ","Erzincan","Erzurum","Eskişehir","Gaziantep","Giresun","Gümüşhane","Hakkari","Hatay","Isparta","Mersin","İstanbul","İzmir","Kars","Kastamonu","Kayseri","Kırklareli","Kırşehir","Kocaeli","Konya","Kütahya","Malatya","Manisa","Kahramanmaraş","Mardin","Muğla","Muş","Nevşehir","Niğde","Ordu","Rize","Sakarya","Samsun","Siirt","Sinop","Sivas","Tekirdağ","Tokat","Trabzon","Tunceli","Şanlıurfa","Uşak","Van","Yozgat","Zonguldak","Aksaray","Bayburt","Karaman","Kırıkkale","Batman","Şırnak","Bartın","Ardahan","Iğdır","Yalova","Karabük","Kilis","Osmaniye","Düzce"];

/* yaygın varyant -> kanonik */
const ALIASES = {"ICEL":"Mersin","KMARAS":"Kahramanmaraş","KAHRAMANMARAS":"Kahramanmaraş","SANLIURFA":"Şanlıurfa","URFA":"Şanlıurfa","AFYON":"Afyonkarahisar"};

function normKey(s){
  if(s===null||s===undefined) return "";
  return String(s).toLocaleUpperCase('tr-TR')
    .replace(/İ/g,'I').replace(/I/g,'I').replace(/Ş/g,'S').replace(/Ç/g,'C')
    .replace(/Ö/g,'O').replace(/Ü/g,'U').replace(/Ğ/g,'G')
    .replace(/[^A-Z]/g,'');   // boşluk/işaret at -> "ŞANLI URFA"==="ŞANLIURFA"
}
const KEY2CANON = {};
PROVINCES.forEach(p=>KEY2CANON[normKey(p)]=p);
Object.entries(ALIASES).forEach(([k,v])=>KEY2CANON[normKey(k)]=v);
function resolveProvince(raw){
  const k = normKey(raw);
  if(!k) return null;
  return KEY2CANON[k] || null;
}

/* Kadrolar — EK-1 Münhal Kadrolar PDF, ŞUBE MÜDÜRÜ "Sayısı" sütunu (63 il, toplam 109) */
const DEFAULT_QUOTA = {
"Adana":3,"Adıyaman":2,"Ağrı":3,"Aksaray":2,"Amasya":2,"Antalya":3,"Ardahan":1,"Artvin":2,"Aydın":2,"Balıkesir":2,
"Bartın":2,"Bayburt":1,"Bilecik":1,"Bitlis":1,"Bolu":2,"Burdur":1,"Çanakkale":1,"Denizli":2,"Diyarbakır":1,"Düzce":1,
"Edirne":2,"Elazığ":3,"Erzincan":1,"Giresun":3,"Hakkari":2,"Hatay":4,"Iğdır":1,"Isparta":1,"İstanbul":1,"İzmir":1,
"Karabük":1,"Karaman":2,"Kars":2,"Kastamonu":2,"Kayseri":2,"Kırıkkale":1,"Kırklareli":1,"Kilis":1,"Kocaeli":2,"Kütahya":1,
"Malatya":3,"Manisa":1,"Mardin":1,"Mersin":4,"Muğla":1,"Nevşehir":1,"Niğde":1,"Ordu":2,"Osmaniye":2,"Rize":2,
"Sakarya":1,"Siirt":2,"Sinop":1,"Şanlıurfa":2,"Şırnak":2,"Tekirdağ":2,"Trabzon":2,"Tunceli":1,"Uşak":2,"Van":1,
"Yalova":2,"Yozgat":1,"Zonguldak":3
};

/* açık kadrolu illerin alfabetik listesi (aday tercih ekranı bunları gösterir) */
const OPEN_PROVINCES = Object.keys(DEFAULT_QUOTA).sort((a,b)=>a.localeCompare(b,'tr'));

/* Aday verisinin tutulduğu herkese açık Google Sheet (her iki sayfa buradan canlı okur) */
const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/1BsbjhWloHdhdYGqFWhuK68rYaiiaOzTevPRw1MTw6fQ/edit";
function sheetCsvUrl(input){
  input=String(input||'').trim();
  let id=input, gid='0';
  const m=input.match(/\/d\/([a-zA-Z0-9_-]+)/); if(m) id=m[1];
  const g=input.match(/[?&#]gid=(\d+)/); if(g) gid=g[1];
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

/* 2B satır dizisini (header dahil) aday nesnelerine çevirir — index.html ve tercih.html paylaşır */
function parseCandidateRows(rows){
  let headerIdx=0;
  for(let i=0;i<Math.min(rows.length,5);i++){
    const r=(rows[i]||[]).map(x=>String(x||'').toLocaleUpperCase('tr-TR'));
    if(r.some(c=>c.includes('İL')||c.includes('IL')) && r.some(c=>c.includes('AD'))){headerIdx=i;break;}
  }
  const cands=[];
  for(let i=headerIdx+1;i<rows.length;i++){
    const r=rows[i]||[];
    const sira=r[0], il=r[1], ad=r[2], soyad=r[3];
    const hasSira=sira!=null&&String(sira).trim()!==''&&!isNaN(Number(sira));
    const hasName=(ad&&String(ad).trim())||(soyad&&String(soyad).trim())||(il&&String(il).trim());
    if(!hasSira&&!hasName) continue;
    const prefsRaw=[];
    for(let c=4;c<r.length;c++){
      const v=r[c];
      if(v===null||String(v).trim()==='') continue;
      String(v).split(/[\/\\;\n]+/).forEach(part=>{const t=part.trim(); if(t) prefsRaw.push(t);});
    }
    const seen=new Set(), prefs=[];
    for(const x of prefsRaw){const k=normKey(x); if(k&&!seen.has(k)){seen.add(k); const canon=resolveProvince(x); prefs.push({raw:x,canon,valid:!!canon});}}
    cands.push({
      sira: hasSira?Number(sira):(cands.length+1),
      il: il?String(il).trim():'', ad: ad?String(ad).trim():'', soyad: soyad?String(soyad).trim():'',
      prefs: prefs.slice(0,15)
    });
  }
  return cands;
}

/* Kalan kadro (sıra numarasına göre): sira < beforeSira olan adaylar yerleştirildikten sonra il başına kalan */
function simulateRemaining(candidates, beforeSira){
  const rem={}; for(const [p,n] of Object.entries(DEFAULT_QUOTA)) rem[p]=n;
  candidates.filter(c=>c.sira<beforeSira).sort((a,b)=>a.sira-b.sira).forEach(c=>{
    for(const pr of c.prefs){ if(pr.valid && rem[pr.canon]>0){ rem[pr.canon]--; break; } }
  });
  return rem;
}
