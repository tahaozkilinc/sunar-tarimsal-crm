-- =============================================================================
-- Sunar Tarımsal CRM - Gemiye gözetim/liman/nakliyeci atama
-- Sıra: 20 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- purchase_contracts'a üç firma referansı eklenir (companies tablosundaki
-- surveyor/port/carrier türleri). Operasyon ekibi bir gemiye gözetim şirketi,
-- liman ve nakliyeci atayabilir.
--
-- Yazma yetkisi: pc_write yalnızca admin+purchasing'e açık (operasyon satın alma
-- sözleşmesinin fiyatını vb. değiştirememeli). Bu yüzden atama, sadece bu üç
-- kolonu güncelleyen bir SECURITY DEFINER fonksiyonla yapılır (finans'ın
-- set_contract_paid deseniyle aynı). Operasyon yalnızca erişebildiği gemilere
-- atama yapabilir; _view rolleri yazamaz.
-- =============================================================================

alter table public.purchase_contracts
  add column if not exists surveyor_id uuid references public.companies(id) on delete set null,
  add column if not exists port_id     uuid references public.companies(id) on delete set null,
  add column if not exists carrier_id  uuid references public.companies(id) on delete set null;

create index if not exists idx_pc_surveyor on public.purchase_contracts(surveyor_id);
create index if not exists idx_pc_port     on public.purchase_contracts(port_id);
create index if not exists idx_pc_carrier  on public.purchase_contracts(carrier_id);

create or replace function public.assign_ship_parties(
  p_contract_id uuid,
  p_surveyor_id uuid default null,
  p_port_id     uuid default null,
  p_carrier_id  uuid default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- admin her gemiye; operasyon yalnızca erişebildiği gemiye (can_access_ship).
  -- auth_role() (auth_base_role değil) -> operations_view gibi _view rolleri hariç.
  if not (
    public.is_admin()
    or (public.auth_role() = 'operations' and public.can_access_ship(p_contract_id))
  ) then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;

  update public.purchase_contracts
  set surveyor_id = p_surveyor_id,
      port_id     = p_port_id,
      carrier_id  = p_carrier_id
  where id = p_contract_id;

  if not found then
    raise exception 'Gemi bulunamadı';
  end if;
end $$;

grant execute on function public.assign_ship_parties(uuid, uuid, uuid, uuid) to authenticated;
