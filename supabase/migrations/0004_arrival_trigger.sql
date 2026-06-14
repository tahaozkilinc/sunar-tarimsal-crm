-- =============================================================================
-- Sunar Tarımsal CRM - Operasyon → Bağlantı otomasyonu
-- Sıra: 4 -> önceki migration'lardan SONRA, Supabase SQL Editor'de çalıştırın.
-- (Idempotent'tir; tekrar çalıştırmak güvenlidir.)
--
-- Operasyon bir sözleşmeye 'inbound' (giriş / boşaltma) hareketi girdiğinde,
-- ilgili bağlantı (purchase_contract) otomatik 'arrived' (Geldi) olur.
-- SECURITY DEFINER olduğundan operasyon rolü de tetikleyebilir (RLS bypass).
-- Kısmi geliş olsa bile durum 'arrived' olur; miktar stok hareketine yazılır.
-- =============================================================================

create or replace function public.mark_contract_arrived()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.movement_type = 'inbound' and new.contract_id is not null then
    update public.purchase_contracts
       set status = 'arrived'
     where id = new.contract_id
       and status in ('draft', 'active', 'in_transit');
  end if;
  return new;
end $$;

drop trigger if exists trg_mark_contract_arrived on public.stock_movements;
create trigger trg_mark_contract_arrived
  after insert on public.stock_movements
  for each row execute function public.mark_contract_arrived();
