-- =============================================================================
-- Sunar Tarımsal CRM - Bağlantı ödeme/alıcı alanları + Finans rolü
-- Sıra: 5 -> Supabase SQL Editor'de çalıştırın. (Idempotent.)
--
-- NOT: Eğer "ALTER TYPE ... ADD VALUE cannot run inside a transaction block"
--      hatası alırsan, aşağıdaki 2. adımdaki tek satırı önce TEK BAŞINA çalıştır,
--      sonra dosyanın tamamını tekrar çalıştır.
-- =============================================================================

-- 1) Bağlantıya yeni alanlar: öngörülen ödeme tarihi, alıcı, kimin adına
alter table public.purchase_contracts
  add column if not exists payment_due_date date,
  add column if not exists buyer text,
  add column if not exists on_behalf text;

-- 2) Finans rolü (yalnızca öngörülen ödeme tarihlerini görür)
alter type public.user_role add value if not exists 'finans';

-- 3) Finansın göreceği güvenli görünüm: SADECE ödeme tarihi bilgileri.
--    Definer view + auth_role() kontrolü => finans/admin dışında satır dönmez;
--    fiyat/tedarikçi/miktar gibi hassas alanlar bu görünümde HİÇ yer almaz.
drop view if exists public.payment_schedule cascade;
create view public.payment_schedule
with (security_invoker = off) as
  select id, contract_no, payment_due_date, eta, status
  from public.purchase_contracts
  where public.auth_role() in ('admin', 'finans')
    and payment_due_date is not null
    and status <> 'cancelled';

grant select on public.payment_schedule to authenticated;
