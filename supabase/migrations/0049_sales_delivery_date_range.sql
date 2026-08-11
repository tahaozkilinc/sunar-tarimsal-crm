-- Sunar Tarımsal CRM - Satışta teslim tarihi ARALIK olsun
-- ----------------------------------------------------------------------------
-- delivery_date artık pencerenin başlangıcı; delivery_date_to (opsiyonel)
-- bitişi. Yalnızca tek gün teslimse delivery_date_to boş kalabilir.

alter table public.sales_orders
  add column if not exists delivery_date_to date;

comment on column public.sales_orders.delivery_date is
  'Teslim penceresi başlangıcı (tek gün teslimse tek başına yeterli).';
comment on column public.sales_orders.delivery_date_to is
  'Teslim penceresi bitişi (opsiyonel) — doluysa delivery_date ile birlikte bir aralık oluşturur.';

alter table public.sales_orders
  add constraint sales_orders_delivery_range_check
  check (delivery_date_to is null or delivery_date is null or delivery_date_to >= delivery_date);
