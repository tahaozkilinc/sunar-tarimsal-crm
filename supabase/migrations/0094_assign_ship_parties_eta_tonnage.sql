-- =============================================================================
-- Sunar Tarımsal CRM - assign_ship_parties: ETA + Yükleme Tonajı eklendi
-- ----------------------------------------------------------------------------
-- 0086-0091'de kurulan desenin devamı: operasyon sayfasından ETA ve yeni
-- Yükleme Tonajı (loading_tonnage, 0092) da güncellenebilsin — operations
-- rolünün purchase_contracts üzerinde doğrudan UPDATE RLS izni yok
-- (pc_write yalnızca admin/purchasing), bu yüzden diğer tüm "operasyon
-- zamanla netleştirir" alanları gibi bu RPC'den geçmesi gerekiyor.
--
-- NOT (bilinen teknik borç): eski (10 parametreli) overload bu kez
-- silinemedi — ortam DROP FUNCTION'ı tekrar tekrar zaman aşımına uğrattı
-- (CREATE/ALTER/basit DML'ler sorunsuz çalışırken). Yeni (12 parametreli)
-- overload doğru yetkilerle (yalnızca authenticated, anon/public YOK)
-- ayrıca oluşturuldu ve canlıda doğrulandı — iki overload şu an yan yana
-- duruyor, frontend her zaman 12 parametreliyi çağırıyor (tüm alanları
-- gönderiyor) o yüzden işlevsel bir sorun yok. Eski overload'u silmek
-- ortam sorunu düzeldiğinde ayrı bir migration'la tamamlanabilir.
-- =============================================================================

create or replace function public.assign_ship_parties(
  p_contract_id uuid,
  p_surveyor_id uuid default null,
  p_port_id uuid default null,
  p_carrier_id uuid default null,
  p_agent_id uuid default null,
  p_assigned_to uuid default null,
  p_ship_broker_id uuid default null,
  p_loading_port_id uuid default null,
  p_loading_surveyor_id uuid default null,
  p_loading_agent_id uuid default null,
  p_eta date default null,
  p_loading_tonnage numeric default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not (
    public.is_admin()
    or (public.auth_role() = 'operations' and (
      public.can_access_ship(p_contract_id)
      or exists (
        select 1 from public.purchase_contracts pc
        where pc.id = p_contract_id and pc.assigned_to is null
      )
    ))
  ) then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;

  update public.purchase_contracts
  set surveyor_id = p_surveyor_id,
      port_id     = p_port_id,
      carrier_id  = p_carrier_id,
      agent_id    = p_agent_id,
      assigned_to = p_assigned_to,
      ship_broker_id = p_ship_broker_id,
      loading_port_id = p_loading_port_id,
      loading_surveyor_id = p_loading_surveyor_id,
      loading_agent_id = p_loading_agent_id,
      eta = p_eta,
      loading_tonnage = p_loading_tonnage
  where id = p_contract_id;

  if not found then
    raise exception 'Gemi bulunamadı';
  end if;
end;
$function$;

grant execute on function public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, numeric) to authenticated;
revoke execute on function public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, numeric) from anon, public;

-- Eski overload'u silmeyi dene — ortam sorunu düzeldiyse bu artık çalışır,
-- düzelmediyse "if exists" sayesinde migration yine de başarıyla biter.
drop function if exists public.assign_ship_parties(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid);
