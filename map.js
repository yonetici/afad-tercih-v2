/* ============ Türkiye haritası (hafif, bağımlılıksız SVG projeksiyon) ============
   GeoJSON: alpers/Turkey-Maps-GeoJSON (81 il, name + plaka).
   resolveProvince (data.js) ile kanonik il adına eşlenir. */
const TR_GEOJSON_URL = "https://cdn.jsdelivr.net/gh/alpers/Turkey-Maps-GeoJSON@master/tr-cities.json";
let _mapPromise = null;

function loadTurkeyPaths(){
  if(_mapPromise) return _mapPromise;
  _mapPromise = fetch(TR_GEOJSON_URL).then(r=>r.json()).then(gj=>{
    const polysOf = g => g.type==='Polygon' ? [g.coordinates] : g.coordinates;
    let minLon=Infinity,maxLon=-Infinity,minLat=Infinity,maxLat=-Infinity;
    gj.features.forEach(f=>polysOf(f.geometry).forEach(poly=>poly.forEach(ring=>ring.forEach(([lon,lat])=>{
      if(lon<minLon)minLon=lon; if(lon>maxLon)maxLon=lon;
      if(lat<minLat)minLat=lat; if(lat>maxLat)maxLat=lat;
    }))));
    const k = Math.cos((minLat+maxLat)/2*Math.PI/180);  // enlem düzeltmesi
    const W = 1000;
    const H = (maxLat-minLat)/((maxLon-minLon)*k) * W;
    const px = lon => (lon-minLon)*k/((maxLon-minLon)*k) * W;
    const py = lat => (maxLat-lat)/(maxLat-minLat) * H;
    const provPath={}, provCentroid={};
    gj.features.forEach(f=>{
      const canon = resolveProvince(f.properties.name) || f.properties.name;
      let d='', cx=0, cy=0, cn=0, best=0;
      polysOf(f.geometry).forEach(poly=>{
        // en büyük halkayı centroid için kullan
        poly.forEach((ring,ri)=>{
          ring.forEach(([lon,lat],i)=>{ const x=px(lon),y=py(lat); d+=(i===0?'M':'L')+x.toFixed(1)+' '+y.toFixed(1); });
          d+='Z';
          if(ri===0 && ring.length>best){ best=ring.length; cx=0;cy=0;cn=0;
            ring.forEach(([lon,lat])=>{cx+=px(lon);cy+=py(lat);cn++;}); }
        });
      });
      provPath[canon]=(provPath[canon]||'')+d;
      provCentroid[canon]={x:cx/Math.max(cn,1), y:cy/Math.max(cn,1)};
    });
    return {provPath, provCentroid, W, H};
  });
  return _mapPromise;
}

/* container: DOM elemanı
   opts.fill(prov)   -> renk (zorunlu)
   opts.onClick(prov)-> tıklama (opsiyonel)
   opts.title(prov)  -> tooltip metni (opsiyonel)
   opts.label(prov)  -> il üzerinde küçük etiket/rozet metni (opsiyonel) */
async function renderTurkeyMap(container, opts){
  const {provPath, provCentroid, W, H} = await loadTurkeyPaths();
  const fill = opts.fill || (()=> '#334155');
  const paths = Object.entries(provPath).map(([prov,d])=>
    `<path d="${d}" data-prov="${prov}" fill="${fill(prov)}" stroke="#0f172a" stroke-width="0.8"
      style="cursor:${opts.onClick?'pointer':'default'};transition:fill .15s">
      <title>${opts.title? opts.title(prov): prov}</title></path>`).join('');
  let labels='';
  if(opts.label){
    const fs = opts.labelSize || 13;
    labels = Object.entries(provCentroid).map(([prov,c])=>{
      const t = opts.label(prov);
      if(!t) return '';
      return `<text x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" text-anchor="middle"
        dominant-baseline="central" font-size="${fs}" font-weight="700" fill="#0b1220"
        style="pointer-events:none">${t}</text>`;
    }).join('');
  }
  container.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block">
       ${paths}${labels}
     </svg>`;
  container.querySelectorAll('path').forEach(p=>{
    if(opts.onClick) p.addEventListener('click',()=>opts.onClick(p.dataset.prov));
    // not: path'i öne taşımıyoruz (appendChild yok) — yoksa etiketleri örter ve mouseleave bozulur
    p.addEventListener('mouseenter',()=>{
      p.setAttribute('stroke','#e2e8f0'); p.setAttribute('stroke-width','2.2');
      if(opts.onHover) opts.onHover(p.dataset.prov);
    });
    p.addEventListener('mouseleave',()=>{
      p.setAttribute('stroke','#0f172a'); p.setAttribute('stroke-width','0.8');
      if(opts.onHover) opts.onHover(null);
    });
  });
}
