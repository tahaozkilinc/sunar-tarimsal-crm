-- =============================================================================
-- Sunar Tarımsal CRM - Satışta ödeme vadesi (purchase_contracts ile simetrik)
-- ----------------------------------------------------------------------------
-- purchase_contracts.payment_due_date (bize ne zaman ödeneceği / ödeyeceğimiz)
-- ile AYNI desen, satış tarafında müşterinin ödeyeceği vade için. Finans ->
-- Tahsilatlar (collections-view.tsx) tablosunda gösterilir.
-- =============================================================================

alter table public.sales_orders
  add column if not exists payment_due_date date;

comment on column public.sales_orders.payment_due_date is
  'Müşterinin ödemesi beklenen vade tarihi.';
