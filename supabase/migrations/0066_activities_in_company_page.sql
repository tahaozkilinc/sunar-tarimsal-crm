-- Sunar Tarımsal CRM - Aktiviteler artık firma sayfasının içinde
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: CRM'deki ayrı/ortak "Aktiviteler" sekmesi kaldırılıp,
-- her firmanın kendi detay sayfasının içine taşınıyor (bkz. crm-tabs.tsx,
-- company-detail-view.tsx). Bu taşıma sırasında, module='broker' için
-- act_select/act_write politikalarının HİÇ GÜNCELLENMEDİĞİ ortaya çıktı:
-- 0058/0059 Broker CRM'i eklerken crm_module enum'ına 'broker' değerini
-- ekledi ve crm-tabs.tsx zaten activitiesModule="broker" kullanıyordu, ama
-- 0019'daki act_select/act_write hâlâ yalnızca
-- (auth_role()='purchasing' and module='purchasing') kontrolü yapıyordu —
-- yani satın alma rolü broker aktivitelerini ne görebiliyor ne yazabiliyordu.
-- Firma sayfasına taşırken bu politikalar da düzeltiliyor: broker,
-- purchasing'in KENDİ kovası (ayrı bir rol yok, purchasing yönetiyor).

drop policy if exists act_select on public.crm_activities;
create policy act_select on public.crm_activities for select to authenticated
  using (
    public.is_admin()
    or public.auth_base_role() = 'viewer'
    or (public.auth_base_role() = 'purchasing' and module in ('purchasing','broker'))
    or (public.auth_base_role() = 'sales' and module = 'sales')
    or (public.auth_base_role() = 'operations' and module = 'operations')
  );

drop policy if exists act_write on public.crm_activities;
create policy act_write on public.crm_activities for all to authenticated
  using (
    public.is_admin()
    or (public.auth_role() = 'purchasing' and module in ('purchasing','broker'))
    or (public.auth_role() = 'sales' and module = 'sales')
    or (public.auth_role() = 'operations' and module = 'operations')
  )
  with check (
    public.is_admin()
    or (public.auth_role() = 'purchasing' and module in ('purchasing','broker'))
    or (public.auth_role() = 'sales' and module = 'sales')
    or (public.auth_role() = 'operations' and module = 'operations')
  );
