@AGENTS.md

# Sunar Tarımsal CRM — proje notları

Hammadde (yağlı tohum) satın alma → operasyon → satış + CRM sistemi.
Stack: Next.js 16 (App Router) + Supabase (Postgres + Auth + RLS) + Tailwind v4, Vercel'de yayınlanır.

## Mimari ilkeler
- **Config-driven CRUD:** Ekranlar `src/lib/resources.ts` içindeki `ResourceConfig`
  tanımlarından üretilir. Yeni alan = `fields` dizisine bir satır + DB kolonu.
  Genel motor: `src/components/resource-manager.tsx`.
- **Rol izolasyonu iki katmanlı:** UI'da `src/lib/nav.ts` (menü), veritabanında
  `supabase/migrations/0002_policies.sql` (RLS). Güvenlik asıl olarak RLS'tedir.
- **Roller:** admin, purchasing, operations, sales, pending (rol bekleyen).
- **Auth:** `@supabase/ssr`, oturum tazeleme `src/proxy.ts` (Next 16 proxy convention).

## Geliştirme kuralları
- Kodu basit tut; mümkünse yeni özelliği config'e ekleyerek çöz.
- Yeni tablo eklerken **mutlaka RLS politikası** yaz (admin + ilgili rol).
- DB değişikliklerini `supabase/migrations/` altına sıralı SQL olarak ekle.
- Değişiklikten sonra `npm run build` ile tip kontrolü yap.
- Gizli anahtarları (`SUPABASE_SERVICE_ROLE_KEY`) repoya yazma; sadece Vercel env.

## Önemli
- Bu Next.js sürümü eğitim verisinden farklı olabilir; `node_modules/next/dist/docs/`
  içindeki güncel rehbere bak ve deprecation uyarılarını dikkate al.
