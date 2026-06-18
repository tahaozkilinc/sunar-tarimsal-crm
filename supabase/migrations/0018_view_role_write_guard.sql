-- =============================================================================
-- Sunar Tarımsal CRM - Güvenlik düzeltmesi: "_view" rolleri yazabiliyordu
-- Sıra: 18 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- SORUN: 0015, can_see_company()'yi auth_base_role() kullanacak şekilde
--   değiştirdi (purchasing_view gibi rollerin companies/contacts'ı OKUYABİLMESİ
--   için). Ama companies_update / companies_delete / contacts_write politikaları
--   (0002'den beri) yetki kontrolünü AYNI fonksiyona dayandırıyor. Sonuç:
--   purchasing_view / operations_view / sales_view rolleri -- ki amaçları
--   salt-okunur olmaktır (bkz. nav.ts: "RLS ve writeRoles _view'i içermez") --
--   taban rolünün görebildiği companies satırlarını GÜNCELLEYEBİLİYOR/
--   SİLEBİLİYOR, ve o firmalara ait contacts'ı tamamen (ekle/güncelle/sil)
--   YÖNETEBİLİYORDU. UI bu butonları gizliyor (resources.ts writeRoles), ama
--   gerçek yetki kontrolü RLS'de olduğundan, doğrudan API çağrısıyla bypass
--   edilebiliyordu.
--
-- ÇÖZÜM: Yazma politikalarına "_view" rolünü açıkça reddeden bir koşul ekle.
--   Okuma tarafı (can_see_company, companies_select, contacts_select)
--   DEĞİŞMİYOR -> "_view" rolleri okumaya devam eder, sadece yazamaz.
-- =============================================================================

create or replace function public.is_view_role()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select right(role::text, 5) = '_view' from public.profiles where id = auth.uid()),
    false
  );
$$;

drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies for update to authenticated
  using (public.can_see_company(id) and not public.is_view_role())
  with check (public.can_see_company(id) and not public.is_view_role());

drop policy if exists companies_delete on public.companies;
create policy companies_delete on public.companies for delete to authenticated
  using (public.is_admin() or (public.can_see_company(id) and not public.is_view_role()));

drop policy if exists contacts_write on public.contacts;
create policy contacts_write on public.contacts for all to authenticated
  using (public.can_see_company(company_id) and not public.is_view_role())
  with check (public.can_see_company(company_id) and not public.is_view_role());
