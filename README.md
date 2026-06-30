# AFAD Şube Müdürü — Tercih Sistemi (v2, hesaplı)

Adayların **sıra no + il + şifre** ile giriş yapıp tercihlerini **kaydedip düzenleyebildiği** sürüm.
İlk girişte şifre değiştirme zorunlu. Veri Supabase'te tutulur; Excel/Sheets ile sürekli bağ yoktur
(yalnızca **tek seferlik** içe aktarma için kullanılır).

## Dosyalar
| Dosya | Görev |
|---|---|
| `index.html` | **Aday**: giriş (sıra+il+şifre) → ilk girişte şifre değiştir → tercih ekle/sırala → **kaydet** + PDF özet. |
| `admin.html` | **Yönetici**: ilk kurulum (tohumlama), şifre yönetimi, yerleştirme/çakışma/risk + PDF, kilitleme. |
| `data.js`, `map.js` | Ortak il/kadro verisi + Türkiye haritası. |
| `config.js` | Supabase URL + anon anahtar + `MAX_PREFS` (15) + tohumlama için `SHEET_URL`. |
| `SUPABASE_KURULUM.sql` | Yeni Supabase projesinde bir kez çalıştırılır (pgcrypto, hesap/şifre fonksiyonları). |

## Kurulum (adım adım)
1. **Yeni** bir Supabase projesi aç (bu sürüm için ayrı; eski simülasyon projesinden bağımsız).
2. **SQL Editor** → `SUPABASE_KURULUM.sql` içeriğini yapıştır → Run. İçindeki `admin_key`'i değiştir.
3. **Project Settings > API** → `Project URL` ve `anon public` anahtarını `config.js`'e yaz.
4. (Değişiklik push'landıktan sonra) **GitHub Pages**'i aç → `main` / `(root)`.
5. **admin.html** → Yönetici anahtarını gir → **🌱 İlk Kurulum: Sheet'ten Tohumla**.
   - Adaylar (sıra/ad/soyad/il) + mevcut tercihleri **bir kez** içe aktarılır.
   - Yeni adaylara **6 haneli varsayılan şifre** üretilir ve **Excel olarak indirilir**.
6. İndirdiğin şifre listesini adaylara dağıt (her adaya kendi sıra+şifresi).
7. Adaylar **kök adresten** (`index.html`) sıra+il+şifre ile girer → ilk girişte şifresini değiştirir → tercihlerini kaydeder.
8. Yönetici **admin.html → Supabase'ten Çek** ile sonuçları/analizleri/PDF'leri görür.
   Süre bitince **🔒 Tercihleri Kilitle**.

## Giriş / şifre akışı
- **İlk giriş:** sıra + il + **varsayılan şifre** → sistem yeni şifre belirletir.
- **Sonraki girişler:** sıra + il + (kendi belirlediği) şifre.
- **Şifre unutulursa:** admin → **🔑 Şifre sıfırla** (sıra no) → yeni varsayılan üretir; adaya iletilir.

## Güvenlik
- Şifreler Supabase'te **bcrypt** (pgcrypto) ile saklanır; düz metin tutulmaz.
- Tüm tablo erişimi RLS ile kapalı; işlemler yalnızca doğrulayan fonksiyonlar üzerinden.
- `admin_key` hiçbir dosyada değildir; yalnızca yönetici panelinde girilir (tarayıcıda hatırlanır).
- `anon` anahtarı istemcide paylaşılır (tasarım gereği güvenli).

## Not
- Bu sürümün eski **simülasyon** sürümüyle (canlı Sheet okuyan) ilgisi yoktur; ayrı repo + ayrı Supabase projesi.
- Tohumlama tek seferliktir; sonrasında veriler adaylar tarafından güncellenir, Sheet'e dönülmez.
