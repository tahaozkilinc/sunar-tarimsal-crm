-- =============================================================================
-- Sunar Tarımsal CRM - Satışta müşteri ZORUNLU (stok bir müşteriye gider)
-- Sıra: 45 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- Gerekçe: her satış fiilen bir müşteriye yapılıyor ve stok o müşteriye
-- gidiyor; "müşteri belirtilmemiş" satış olmamalı. UI'daki required:true
-- atlatılabilir (API'ye doğrudan istek) — asıl kilit burada, DB'de.
--
-- sales_orders boş (0 satır) olduğundan geriye dönük veri sorunu yok.
-- FK'yi de on delete set null yerine restrict yapıyoruz: aksi halde bir
-- müşteri silindiğinde customer_id NULL'a düşer ki bu artık NOT NULL'u
-- ihlal eder (belirsiz bir hata yerine net "önce satışları taşı" hatası).
-- =============================================================================

alter table public.sales_orders
  alter column customer_id set not null;

alter table public.sales_orders
  drop constraint if exists sales_orders_customer_id_fkey;
alter table public.sales_orders
  add constraint sales_orders_customer_id_fkey
    foreign key (customer_id) references public.companies(id) on delete restrict;
