-- =============================================================================
-- Sunar Tarımsal CRM - Stok durumu serbest metin + gümrük beyanname no
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: "Milli" ve "Yerli" aynı şey, üçe indir: Milli / Antrepo /
-- Diğer (serbest metin) — sale_type ile AYNI desen (bkz. 0075), kapatan CHECK
-- kaldırıldı. Ayrıca: Milli seçilince IM'li, Antrepo seçilince AN'li gümrük
-- beyanname numarası istenir (ship-ops-page.tsx toplu girişte doğrulanır).
-- =============================================================================

alter table public.stock_movements
  drop constraint if exists stock_movements_stock_status_check;

alter table public.stock_movements
  add column if not exists customs_declaration_no text;

comment on column public.stock_movements.stock_status is
  'Girişteki malın durumu: Milli/Antrepo ya da "Diğer" ile serbest metin.';
comment on column public.stock_movements.customs_declaration_no is
  'Gümrük beyanname no — Milli için IM, Antrepo için AN ile başlar (opsiyonel, stok durumuna göre istenir).';
