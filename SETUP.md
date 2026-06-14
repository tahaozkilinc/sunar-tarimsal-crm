# Kurulum Adımları (Sunar Tarımsal CRM)

Sistemi yayına almak için sırayla şu 4 adımı uygulayın. Toplam ~10 dakika.

---

## 1. Veritabanını oluştur (Supabase SQL Editor)

Supabase panelinde projeni aç → soldaki menüden **SQL Editor** → **New query**.
Aşağıdaki 3 dosyanın içeriğini **sırayla** yapıştırıp her birini **Run** ile çalıştır:

1. `supabase/migrations/0001_schema.sql`  → tablolar, enum'lar, trigger'lar
2. `supabase/migrations/0002_policies.sql` → güvenlik (RLS) politikaları
3. `supabase/migrations/0003_seed.sql`     → örnek ürünler/depolar + **admin hesabı**

> Not: 3. dosya admin kullanıcısını otomatik oluşturur. Eğer ortamında hata
> verirse, panelde **Authentication → Users → Add user** ile
> `taha.ozkilinc@sunaryatirim.com.tr` / `Sunar19*` kullanıcısını ("Auto Confirm
> User" işaretli) oluştur; sistem onu otomatik **admin** yapar.

---

## 2. Vercel ortam değişkenlerini gir

Vercel'de proje → **Settings → Environment Variables**. Şu 3 değişkeni ekle
(Production + Preview + Development hepsine):

| Değişken | Değer |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://arlwifbttpfpllgqriqa.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_Dya1kG2cZPFnN5ozXbG3-w_xILimILR` |
| `SUPABASE_SERVICE_ROLE_KEY` | *(Supabase → Settings → API → `sb_secret_...` anahtarı)* |

> `SUPABASE_SERVICE_ROLE_KEY` **gizlidir**, sadece admin panelinden kullanıcı
> oluşturmak için sunucu tarafında kullanılır. Asla repoya yazma. Bu değişken
> girilmezse sistem çalışır ama "Yeni Kullanıcı" oluşturma çalışmaz.

---

## 3. Repoyu Vercel'e bağla

Vercel → **Add New → Project** → GitHub'dan `tahaozkilinc/sunar-tarimsal-crm`
reposunu **Import** et. Framework otomatik **Next.js** algılanır, ek ayar gerekmez.
**Deploy** de. Bundan sonra her `git push`'ta otomatik yayına alınır.

> Üretim dalı (production branch) olarak `main` seçilebilir. Geliştirme dalı
> `claude/...` ise Vercel otomatik bir "Preview" linki üretir.

---

## 4. Giriş yap

Yayınlanan adrese git → **Giriş Yap**:

- **E-posta:** `taha.ozkilinc@sunaryatirim.com.tr`
- **Şifre:** `Sunar19*`

Admin olarak tüm modülleri görürsün. **Yönetim → Kullanıcılar**'dan ekibe
kullanıcı ekleyip rol atayabilirsin.

---

## Roller ve Erişim (fonksiyon izolasyonu)

| Rol | Görebildiği modüller |
|---|---|
| **Yönetici (admin)** | Her şey |
| **Satın Alma (purchasing)** | CRM (tedarikçiler), Satın Alma sözleşmeleri |
| **Operasyon (operations)** | Stok hareketleri, Stok durumu, Sözleşmeler (salt okunur) |
| **Satış (sales)** | CRM (müşteriler), Satışlar, Stok durumu |

Bu izolasyon hem arayüzde (menü gizleme) hem de veritabanında (RLS politikaları)
zorunlu kılınır — yani bir satışçı API üzerinden bile satın alma fiyatlarını göremez.

---

## API ile veri transferi

- **Otomatik REST API:** Supabase her tablo için otomatik REST uç noktası üretir.
  Örn: `GET https://arlwifbttpfpllgqriqa.supabase.co/rest/v1/purchase_contracts`
  (`apikey` başlığı + RLS kuralları geçerli). Detay: Supabase → API Docs.
- **Sağlık kontrolü:** `GET /api/health`
- **Kullanıcı yönetimi:** `POST /api/admin/users` (sadece admin oturumu).

Yeni özel uç noktalar için `src/app/api/` altına klasör eklemen yeterli.
