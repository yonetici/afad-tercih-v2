-- ============================================================
-- AFAD Tercih v2 — Hesaplı (şifreli) sistem — Supabase kurulum SQL'i
-- YENİ/AYRI bir Supabase projesinde SQL Editor'a yapıştırıp Run.
-- ============================================================

create extension if not exists pgcrypto;   -- bcrypt (crypt/gen_salt) için

-- 1) TABLOLAR -------------------------------------------------
create table if not exists candidates (
  sira        int primary key,        -- sıra no (başarı sırası; küçük = yüksek öncelik)
  ad          text,
  soyad       text,
  il          text,                    -- mevcut görev yeri (giriş için)
  pass_hash   text,                    -- bcrypt; null = henüz şifre yok
  must_change boolean not null default true,  -- ilk girişte şifre değiştir
  locked      boolean not null default false  -- admin tercihleri kilitleyebilir
);

create table if not exists preferences (
  sira       int primary key references candidates(sira) on delete cascade,
  prefs      jsonb not null default '[]'::jsonb,   -- ["Hatay","Mersin",...] sıralı
  updated_at timestamptz not null default now()
);

create table if not exists app_settings (key text primary key, value text);

-- açık kadrolar (EK-1 PDF, Şube Müdürü Sayısı — 63 il / 109)
create table if not exists quota (il text primary key, sayi int not null);
insert into quota(il,sayi) values
 ('Adana',3),('Adıyaman',2),('Ağrı',3),('Aksaray',2),('Amasya',2),('Antalya',3),('Ardahan',1),('Artvin',2),('Aydın',2),('Balıkesir',2),
 ('Bartın',2),('Bayburt',1),('Bilecik',1),('Bitlis',1),('Bolu',2),('Burdur',1),('Çanakkale',1),('Denizli',2),('Diyarbakır',1),('Düzce',1),
 ('Edirne',2),('Elazığ',3),('Erzincan',1),('Giresun',3),('Hakkari',2),('Hatay',4),('Iğdır',1),('Isparta',1),('İstanbul',1),('İzmir',1),
 ('Karabük',1),('Karaman',2),('Kars',2),('Kastamonu',2),('Kayseri',2),('Kırıkkale',1),('Kırklareli',1),('Kilis',1),('Kocaeli',2),('Kütahya',1),
 ('Malatya',3),('Manisa',1),('Mardin',1),('Mersin',4),('Muğla',1),('Nevşehir',1),('Niğde',1),('Ordu',2),('Osmaniye',2),('Rize',2),
 ('Sakarya',1),('Siirt',2),('Sinop',1),('Şanlıurfa',2),('Şırnak',2),('Tekirdağ',2),('Trabzon',2),('Tunceli',1),('Uşak',2),('Van',1),
 ('Yalova',2),('Yozgat',1),('Zonguldak',3)
on conflict (il) do nothing;

-- 2) YÖNETİCİ ANAHTARI — MUTLAKA DEĞİŞTİRİN
-- NOT: Aşağıdaki değeri SQL Editor'da çalıştırmadan ÖNCE kendi GİZLİ anahtarınızla değiştirin.
-- Bu dosya public repoda olduğu için buraya gerçek anahtar YAZMAYIN.
insert into app_settings(key,value) values ('admin_key','BUNU-DEGISTIRIN-gizli-bir-anahtar')
on conflict (key) do nothing;

-- 3) RLS: doğrudan erişim kapalı (her şey fonksiyon üzerinden)
alter table candidates   enable row level security;
alter table preferences  enable row level security;
alter table app_settings enable row level security;
alter table quota        enable row level security;

-- 4) YARDIMCILAR ---------------------------------------------
create or replace function _is_admin(p_key text) returns boolean
language sql security definer stable as $$
  select exists(select 1 from app_settings where key='admin_key' and value=p_key);
$$;

create or replace function _norm(t text) returns text language sql immutable as $$
  select btrim(upper(regexp_replace(translate(coalesce(t,''),'çÇğĞıİöÖşŞüÜ','cCgGiIoOsSuU'),'\s+',' ','g')));
$$;

-- 5) ADAY: GİRİŞ — sıra + il + şifre
create or replace function login(p_sira int, p_il text, p_password text)
returns jsonb language plpgsql security definer as $$
declare c candidates; pr jsonb;
begin
  select * into c from candidates where sira=p_sira;
  if not found then return jsonb_build_object('ok',false,'err','NOTFOUND'); end if;
  if _norm(c.il)<>_norm(p_il) then return jsonb_build_object('ok',false,'err','BADIL'); end if;
  if c.pass_hash is null or crypt(p_password,c.pass_hash)<>c.pass_hash then
    return jsonb_build_object('ok',false,'err','BADPASS'); end if;
  select prefs into pr from preferences where sira=p_sira;
  return jsonb_build_object('ok',true,'must_change',c.must_change,'locked',c.locked,
                            'ad',c.ad,'soyad',c.soyad,'prefs',coalesce(pr,'[]'::jsonb));
end; $$;

-- ADAY: şifre değiştir (ilk giriş / sonradan)
create or replace function change_password(p_sira int, p_il text, p_old text, p_new text)
returns text language plpgsql security definer as $$
declare c candidates;
begin
  select * into c from candidates where sira=p_sira;
  if not found then return 'NOTFOUND'; end if;
  if _norm(c.il)<>_norm(p_il) then return 'BADIL'; end if;
  if c.pass_hash is null or crypt(p_old,c.pass_hash)<>c.pass_hash then return 'BADPASS'; end if;
  if length(coalesce(p_new,''))<4 then return 'SHORT'; end if;
  update candidates set pass_hash=crypt(p_new,gen_salt('bf')), must_change=false where sira=p_sira;
  return 'OK';
end; $$;

-- ADAY: tercih kaydet (kimlik + şifre doğrulamalı)
create or replace function save_preferences(p_sira int, p_il text, p_password text, p_prefs jsonb)
returns text language plpgsql security definer as $$
declare c candidates;
begin
  select * into c from candidates where sira=p_sira;
  if not found then return 'NOTFOUND'; end if;
  if _norm(c.il)<>_norm(p_il) then return 'BADIL'; end if;
  if c.pass_hash is null or crypt(p_password,c.pass_hash)<>c.pass_hash then return 'BADPASS'; end if;
  if c.must_change then return 'MUSTCHANGE'; end if;
  if c.locked then return 'LOCKED'; end if;
  insert into preferences(sira,prefs,updated_at) values (p_sira,p_prefs,now())
    on conflict (sira) do update set prefs=excluded.prefs, updated_at=now();
  return 'OK';
end; $$;

-- LİYAKAT-DUYARLI KALAN KADRO: sira < p_sira adaylar yerleştikten sonra il başına kalan
create or replace function available_quota(p_sira int)
returns table(il text, kalan int) language plpgsql security definer stable as $$
declare rem jsonb; c record; arr jsonb; i int; pr text;
begin
  select jsonb_object_agg(q.il,q.sayi) into rem from quota q;
  for c in select cand.sira, p.prefs from candidates cand join preferences p on p.sira=cand.sira
           where cand.sira<p_sira order by cand.sira asc loop
    arr:=c.prefs;
    for i in 0..coalesce(jsonb_array_length(arr),0)-1 loop
      pr:=arr->>i;
      if (rem ? pr) and (rem->>pr)::int>0 then rem:=jsonb_set(rem,array[pr],to_jsonb((rem->>pr)::int-1)); exit; end if;
    end loop;
  end loop;
  return query select key, value::int from jsonb_each_text(rem);
end; $$;

-- 6) ADMIN -----------------------------------------------------
-- Tek seferlik tohumlama: yeni adaylara 6 haneli varsayılan şifre üretir (düz metni döndürür).
-- Mevcut adayda: ad/soyad/il güncellenir, şifre KORUNUR (password='(mevcut)').
create or replace function admin_seed(p_key text, p_rows jsonb)
returns table(sira int, ad text, soyad text, il text, password text)
language plpgsql security definer as $$
declare r jsonb; pw text; ex boolean;
begin
  if not _is_admin(p_key) then return; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    ex := exists(select 1 from candidates c where c.sira=(r->>'sira')::int);
    if ex then
      update candidates set ad=r->>'ad', soyad=r->>'soyad', il=r->>'il' where candidates.sira=(r->>'sira')::int;
      sira:=(r->>'sira')::int; ad:=r->>'ad'; soyad:=r->>'soyad'; il:=r->>'il'; password:='(mevcut)'; return next;
    else
      pw := lpad((floor(random()*1000000))::int::text,6,'0');
      insert into candidates(sira,ad,soyad,il,pass_hash,must_change)
        values ((r->>'sira')::int, r->>'ad', r->>'soyad', r->>'il', crypt(pw,gen_salt('bf')), true);
      sira:=(r->>'sira')::int; ad:=r->>'ad'; soyad:=r->>'soyad'; il:=r->>'il'; password:=pw; return next;
    end if;
  end loop;
end; $$;

-- ADMIN: mevcut tercihleri toplu yükle (ilk kurulumda Sheet'teki tercihleri içe aktarmak için)
create or replace function admin_seed_prefs(p_key text, p_rows jsonb)
returns int language plpgsql security definer as $$
declare r jsonb; n int := 0;
begin
  if not _is_admin(p_key) then return -1; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into preferences(sira,prefs,updated_at) values ((r->>'sira')::int, coalesce(r->'prefs','[]'::jsonb), now())
    on conflict (sira) do update set prefs=excluded.prefs, updated_at=now();
    n := n+1;
  end loop;
  return n;
end; $$;

-- ADMIN: tek aday şifresini sıfırla (yeni varsayılan üretir, döndürür)
create or replace function admin_reset_password(p_key text, p_sira int)
returns text language plpgsql security definer as $$
declare pw text;
begin
  if not _is_admin(p_key) then return null; end if;
  pw := lpad((floor(random()*1000000))::int::text,6,'0');
  update candidates set pass_hash=crypt(pw,gen_salt('bf')), must_change=true where sira=p_sira;
  if not found then return null; end if;
  return pw;
end; $$;

-- ADMIN: tüm veriyi çek (yerleştirme/analiz için)
create or replace function admin_export(p_key text)
returns table(sira int, ad text, soyad text, il text, prefs jsonb, must_change boolean, locked boolean)
language plpgsql security definer as $$
begin
  if not _is_admin(p_key) then return; end if;
  return query select c.sira,c.ad,c.soyad,c.il,coalesce(p.prefs,'[]'::jsonb),c.must_change,c.locked
    from candidates c left join preferences p on p.sira=c.sira order by c.sira;
end; $$;

-- ADMIN: tüm tercihleri kilitle/aç
create or replace function admin_set_lock(p_key text, p_locked boolean)
returns int language plpgsql security definer as $$
declare n int;
begin
  if not _is_admin(p_key) then return -1; end if;
  update candidates set locked=p_locked where true;
  get diagnostics n=row_count; return n;
end; $$;

-- 7) anon yetkileri
grant execute on function login(int,text,text)                      to anon;
grant execute on function change_password(int,text,text,text)       to anon;
grant execute on function save_preferences(int,text,text,jsonb)     to anon;
grant execute on function available_quota(int)                      to anon;
grant execute on function admin_seed(text,jsonb)                    to anon;
grant execute on function admin_seed_prefs(text,jsonb)              to anon;
grant execute on function admin_reset_password(text,int)            to anon;
grant execute on function admin_export(text)                        to anon;
grant execute on function admin_set_lock(text,boolean)              to anon;

-- BİTTİ. Kurulum sonrası: admin.html'den "İlk Kurulum: Sheet'ten içe aktar" ile bir kez tohumlayın.
