/* ============================================================
   SUPABASE AYARLARI — BURAYI BİR KEZ DOLDURUN (yeni, AYRI proje)
   1) supabase.com'da YENİ bir ücretsiz proje açın (bu sürüm için ayrı).
   2) Project Settings > API: "Project URL" ve "anon public" anahtarı.
   3) SUPABASE_KURULUM.sql'i SQL Editor'da çalıştırın (admin_key'i değiştirin).
   ============================================================ */
window.SUPABASE_URL = "";        // örn: "https://xxxx.supabase.co"
window.SUPABASE_ANON_KEY = "";   // örn: "eyJhbGciOi...."

/* Aday başına en fazla tercih sayısı */
window.MAX_PREFS = 15;

/* (Yalnızca admin ilk kurulumda kullanır) aday verisinin çekileceği herkese açık Google Sheet.
   Tohumlama tek seferliktir; sonrasında sistemin Sheet ile bağı kalmaz. */
window.SHEET_URL = "https://docs.google.com/spreadsheets/d/1BsbjhWloHdhdYGqFWhuK68rYaiiaOzTevPRw1MTw6fQ/edit";
