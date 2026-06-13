# Sunar Tarımsal CRM

Hammadde (yağlı tohum) **satın alma → operasyon → satış** akışını ve hem satın
alma hem satış için **CRM**'i tek sistemde yöneten, mobil + masaüstü uyumlu web
uygulaması.

## Teknoloji

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** (responsive: telefon + bilgisayar)
- **Supabase** (PostgreSQL + Auth + satır bazlı güvenlik/RLS)
- **Vercel** (otomatik yayın)

Hızlı sayfa geçişleri için client-side yönlendirme + link prefetch kullanılır.

## Modüller

| Yol | Açıklama |
|---|---|
| `/` | Role göre özet panel |
| `/crm` | Firmalar, kişiler, aktiviteler (satın alma/satış'a göre ayrışır) |
| `/purchasing` | Satın alma sözleşmeleri (yağlı tohum, ETA, fiyat, sözleşme linki) |
| `/operations` | Stok hareketleri — hangi hammadde hangi depo/fabrikaya çekildi |
| `/inventory` | Depo/fabrika bazında kullanılabilir stok (giren − satılan) |
| `/sales` | Satış kayıtları |
| `/admin` | Kullanıcılar, ürünler, depolar |

Kurulum için **[SETUP.md](./SETUP.md)** dosyasına bakın.

## Yerel geliştirme

```bash
npm install
cp .env.example .env.local   # değerleri doldurun
npm run dev                  # http://localhost:3000
```

## Proje yapısı

```
src/
  app/
    (app)/            # giriş gerektiren sayfalar (AppShell ile sarılı)
      page.tsx        # panel
      crm/ purchasing/ operations/ inventory/ sales/ admin/
    login/            # giriş ekranı
    api/              # health + admin kullanıcı uçları
  components/         # UI parçaları (ui.tsx, resource-manager.tsx, ...)
  lib/
    resources.ts      # ** her veri tipinin alan tanımları (en sık dokunulan dosya) **
    nav.ts            # menü + rol erişimi
    supabase/         # istemci/sunucu/proxy bağlantıları
    auth.ts types.ts format.ts
supabase/migrations/  # veritabanı SQL'leri (sırayla çalıştırılır)
```

## Nasıl geliştirilir? (basit tutuldu)

Sistem "config-driven": ekranlar `src/lib/resources.ts` içindeki alan
tanımlarından otomatik üretilir.

**Yeni alan eklemek** (örn. sözleşmeye "vade" eklemek):

1. Veritabanına kolon ekle (Supabase SQL Editor):
   ```sql
   alter table public.purchase_contracts add column vade date;
   ```
2. `src/lib/resources.ts` içinde ilgili kaynağın `fields` dizisine ekle:
   ```ts
   { name: "vade", label: "Vade", type: "date" },
   ```
   Liste tablosunda da görünsün istersen `listFields` dizisine `"vade"` ekle.

Form, doğrulama, kaydetme, listeleme otomatik çalışır. Desteklenen alan tipleri:
`text, number, money, textarea, date, select, reference, boolean, email, tel, url`.

**Yeni modül eklemek:** `resources.ts`'e yeni bir `ResourceConfig` tanımla,
`src/app/(app)/<modul>/page.tsx` içinde `<ResourceManager>` ile render et,
`src/lib/nav.ts`'e menü öğesini (ve hangi rollerin göreceğini) ekle. Gerekirse
tabloyu ve RLS politikasını migration ile oluştur.

## Güvenlik

Rol bazlı erişim hem arayüzde hem de **veritabanı RLS politikalarıyla** zorunlu
kılınır. Her rol yalnızca kendi fonksiyonunu görür (bkz. `0002_policies.sql`).
