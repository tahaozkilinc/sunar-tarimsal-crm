-- =============================================================================
-- Sunar Tarımsal CRM - Dış rollerden fiyat/ödeme bilgisini gizle
-- Sıra: 37 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- KANITLANMIŞ AÇIK (rol simülasyonlu testle): nakliyeci/gozetim/acente,
-- pc_select arm'ları satırın TAMAMINI verdiğinden, atandıkları geminin alış
-- FİYATINI, kurunu ve ödeme durumunu REST API'den okuyabiliyordu (UI
-- göstermese de). Dış firma ticari koşulları görmemelidir.
--
-- ÇÖZÜM (0026'daki sellable_contracts deseni):
--   - external_contracts: SECURITY DEFINER görünüm; dış kullanıcının atandığı
--     bağlantıları YALNIZCA operasyonel kolonlarla verir. Hassas alanlar yok;
--     supplier_id null'lanır (kolon uyumluluğu için var, değer yok).
--   - pc_select'ten dış rol arm'ları KALDIRILIR: tabloyu artık yalnız iç
--     roller okur. Dış rollerin yazma akışı etkilenmez (sm_write, is_my_*
--     DEFINER fonksiyonlarına dayanır; tabloya SELECT gerektirmez).
-- =============================================================================

create or replace view public.external_contracts as
select
  pc.id,
  pc.contract_no,
  pc.vessel,
  pc.product_id,
  null::uuid as supplier_id,          -- tedarikçi dış firmadan gizli
  pc.quantity,
  pc.unit,
  pc.eta,
  pc.status,
  pc.origin_country,
  pc.loading_port,
  pc.surveyor_id,
  pc.port_id,
  pc.carrier_id,
  pc.agent_id,
  pc.combined_shipment_id,
  pc.assigned_to
from public.purchase_contracts pc
where public.is_my_carrier_ship(pc.id)
   or public.is_my_surveyor_ship(pc.id)
   or public.is_my_agent_ship(pc.id);

-- Definer görünüm erişimi: yalnız authenticated, salt SELECT (0026 deseni).
revoke all on public.external_contracts from anon, public;
revoke insert, update, delete, truncate, references, trigger
  on public.external_contracts from authenticated;
grant select on public.external_contracts to authenticated;

-- purchase_contracts: dış rol arm'ları kaldırıldı — tablo yalnız iç rollere.
drop policy if exists pc_select on public.purchase_contracts;
create policy pc_select on public.purchase_contracts for select to authenticated
  using (
    public.auth_base_role() in ('admin','purchasing','operations','maliyet','viewer')
  );
