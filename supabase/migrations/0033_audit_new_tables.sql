-- =============================================================================
-- Sunar Tarımsal CRM - İşlem geçmişi (audit) yeni tablolara bağlanır
-- Sıra: 33 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- 0009'daki audit trigger'ı sabit bir tablo listesine bağlanmıştı; sonradan
-- eklenen tablolar loglanmıyordu. Özellikle warehouse_expenses (para) ve
-- combined_shipments (operasyon) izlenmelidir. tuik_monthly_imports de
-- tutarlılık için eklendi.
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'combined_shipments','tuik_monthly_imports','warehouse_expenses'
  ] loop
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format(
      'create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.fn_audit()',
      t
    );
  end loop;
end $$;
