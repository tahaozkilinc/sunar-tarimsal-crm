-- =============================================================================
-- Sunar Tarımsal CRM - Yeni fonksiyonların EXECUTE sertleştirmesi
-- Sıra: 30 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- 0025 sertleştirmesinden SONRA eklenen SECURITY DEFINER fonksiyonlar (0027'de)
-- varsayılan olarak PUBLIC'e (dolayısıyla anon'a) EXECUTE veriyordu; REST rpc
-- (/rest/v1/rpc/...) üzerinden giriş yapmamış kullanıcılar çağırabiliyordu.
-- Mevcut eşdeğerleriyle (is_my_carrier_ship, assign_ship_parties) tutarlı olacak
-- şekilde: authenticated KORUNUR (RLS politikaları + uygulama kullanır),
-- anon + public KALDIRILIR. (İkisi de zaten yetki kontrolü yapar; bu derinlemesine
-- savunmadır — Supabase güvenlik advisor'ı bulgusunu kapatır.)
-- =============================================================================

grant execute on function public.is_my_surveyor_ship(uuid) to authenticated;
revoke execute on function public.is_my_surveyor_ship(uuid) from anon, public;

grant execute on function public.assign_combined_ship_parties(uuid, uuid, uuid, uuid) to authenticated;
revoke execute on function public.assign_combined_ship_parties(uuid, uuid, uuid, uuid) from anon, public;
