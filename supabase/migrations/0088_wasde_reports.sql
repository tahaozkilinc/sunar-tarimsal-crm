-- =============================================================================
-- Sunar Tarımsal CRM - WASDE (USDA) raporu takibi
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: USDA'nın aylık yayınladığı WASDE (World Agricultural
-- Supply and Demand Estimates) raporundaki kalemleri (ürün/bölge/kalem bazında
-- üretim, son stok, ihracat vb.) sisteme kaydedip zaman içinde takip etmek.
-- TÜİK dış ticaret verisinden TAMAMEN BAĞIMSIZ, ayrı bir rapor — GTİP kodu
-- İLE İLİŞKİLENDİRİLMEZ (WASDE zaten GTİP bazlı bir kaynak değil).
--
-- USDA'nın WASDE için genel API-key gerektirmeyen bir uç noktası olsa da
-- format zamanla değişebildiğinden (bkz. tuik_monthly_imports geçmişi, 0028/
-- 0061) veri şimdilik uygulamadan (Bağlantı -> WASDE sekmesi, admin+purchasing)
-- elle girilir; source kolonu ileride otomatik beslemeye de uygun.
-- =============================================================================

create table public.wasde_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  commodity text not null,
  region text,
  metric text not null,
  marketing_year text,
  value numeric not null,
  unit text not null,
  prev_value numeric,
  source_url text,
  source text not null default 'manual', -- manual | api (ileride)
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  unique (report_date, commodity, region, metric, marketing_year)
);

comment on table public.wasde_reports is
  'USDA WASDE raporu kalemleri (ürün/bölge/kalem bazında) — TÜİK verisinden bağımsız.';
comment on column public.wasde_reports.prev_value is
  'Bir önceki WASDE raporundaki aynı kalem — ay bazında karşılaştırma için.';

alter table public.wasde_reports enable row level security;

-- Okuma: iç roller (dış kullanıcılar — nakliyeci/gozetim/acente — hariç),
-- tuik_monthly_imports (kaldırılmış) ile aynı desen.
create policy wasde_select on public.wasde_reports for select to authenticated
  using (
    public.auth_base_role() in
      ('admin', 'purchasing', 'operations', 'sales', 'finans', 'maliyet', 'viewer')
  );

-- Yazma: admin + satın alma (_view rolleri hariç).
create policy wasde_write on public.wasde_reports for all to authenticated
  using (public.auth_role() in ('admin', 'purchasing'))
  with check (public.auth_role() in ('admin', 'purchasing'));

drop trigger if exists trg_audit on public.wasde_reports;
create trigger trg_audit after insert or update or delete on public.wasde_reports
  for each row execute function public.fn_audit();
