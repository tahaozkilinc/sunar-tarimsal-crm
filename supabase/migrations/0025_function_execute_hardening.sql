-- =============================================================================
-- Sunar Tarımsal CRM - Fonksiyon EXECUTE yetkisi sertleştirmesi
-- Sıra: 25 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- Supabase güvenlik advisor'ı: SECURITY DEFINER fonksiyonlar REST rpc
-- (/rest/v1/rpc/...) üzerinden anon/authenticated tarafından çağrılabiliyordu.
--   - Yardımcı + uygulama RPC fonksiyonları: authenticated KORUNUR (RLS
--     politikaları bunları çağırır + uygulama supabase.rpc ile kullanır),
--     anon + public KALDIRILIR.
--   - Trigger / event-trigger fonksiyonları: hiçbir rol RPC ile çağırmamalı
--     (trigger mekanizması sahibi olarak çalışır), tüm rol erişimi KALDIRILIR.
-- Not: can_access_movement / can_access_contract SECURITY INVOKER olduğundan
-- (RLS'i miras alır) advisor'da işaretlenmez; dokunulmaz.
-- =============================================================================

-- Yardımcı fonksiyonlar (RLS politikalarında kullanılır)
grant execute on function public.auth_role() to authenticated;
revoke execute on function public.auth_role() from anon, public;

grant execute on function public.auth_base_role() to authenticated;
revoke execute on function public.auth_base_role() from anon, public;

grant execute on function public.is_admin() to authenticated;
revoke execute on function public.is_admin() from anon, public;

grant execute on function public.is_view_role() to authenticated;
revoke execute on function public.is_view_role() from anon, public;

grant execute on function public.my_company_id() to authenticated;
revoke execute on function public.my_company_id() from anon, public;

grant execute on function public.can_access_ship(uuid) to authenticated;
revoke execute on function public.can_access_ship(uuid) from anon, public;

grant execute on function public.can_see_company(uuid) to authenticated;
revoke execute on function public.can_see_company(uuid) from anon, public;

grant execute on function public.can_write_movement(uuid) to authenticated;
revoke execute on function public.can_write_movement(uuid) from anon, public;

grant execute on function public.is_my_carrier_ship(uuid) to authenticated;
revoke execute on function public.is_my_carrier_ship(uuid) from anon, public;

-- Uygulama RPC fonksiyonları (kendi içlerinde rol kontrolü var)
grant execute on function public.assign_ship_parties(uuid, uuid, uuid, uuid) to authenticated;
revoke execute on function public.assign_ship_parties(uuid, uuid, uuid, uuid) from anon, public;

grant execute on function public.set_contract_paid(uuid, boolean, text) to authenticated;
revoke execute on function public.set_contract_paid(uuid, boolean, text) from anon, public;

grant execute on function public.update_my_profile(text) to authenticated;
revoke execute on function public.update_my_profile(text) from anon, public;

-- Trigger / event-trigger fonksiyonları (yalnızca trigger mekanizması çağırır)
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.mark_contract_arrived() from anon, authenticated, public;
revoke execute on function public.fn_audit() from anon, authenticated, public;
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;

-- set_updated_at: değişebilir search_path uyarısını kapat + RPC erişimini kaldır
alter function public.set_updated_at() set search_path = public;
revoke execute on function public.set_updated_at() from anon, authenticated, public;
