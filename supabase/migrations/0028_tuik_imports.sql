-- =============================================================================
-- Sunar Tarımsal CRM - TÜİK aylık ithalat karşılaştırması (ürün / GTİP bazlı)
-- Sıra: 28 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- Amaç: TÜİK dış ticaret istatistiklerindeki (GTİP/HS kodu bazlı) aylık Türkiye
-- ithalatını saklayıp, bizim bağlantı (purchase_contracts) tonajımızla ay ay
-- karşılaştırmak. İthalat sayfası hs_code'u dolu her ürün için çalışır.
--
-- Veri kaynağı: https://bi.tuik.gov.tr/extensions/tuik-mashup/index.html
-- TÜİK'in resmî/otomatik bir API'si olmadığından değerler şimdilik uygulamadan
-- (İthalat sayfası, admin+purchasing) elle girilir; tablo tasarımı ileride
-- otomatik beslemeye de uygundur (source kolonu).
-- =============================================================================

alter table public.products
  add column if not exists hs_code text;

-- ----------------------------------------------------------------------------
-- Ürün ↔ GTİP eşlemesi. Ürün yoksa eklenir; adı birebir eşleşen mevcut ürünün
-- boş hs_code'u doldurulur (dolu olan asla ezilmez). 'Ayçekirdeği' mevcut
-- 'Ayçiçeği Tohumu' ürünüyle aynı maldır; iki yazım da eşlenir.
-- ----------------------------------------------------------------------------
insert into public.products (name, code, category, unit, hs_code)
select
  v.name,
  -- kod çakışırsa kodsuz ekle (products.code unique)
  case when exists (select 1 from public.products p2 where p2.code = v.code)
       then null else v.code end,
  v.category, 'ton', v.hs_code
from (values
  ('Mısır',                   'MIS',  'Tahıl',          '100590000019'),
  ('Soya Fasulyesi',          'SOY',  'Yağlı Tohum',    '120190000000'),
  ('Ayçiçeği Tohumu',         'AYC',  'Yağlı Tohum',    '120600990019'),
  ('Buğday Kepeği',           'BKEP', 'Yem Hammaddesi', '230230100011'),
  ('Soya Fasulyesi Küspesi',  'SFK',  'Küspe',          '230400000000'),
  ('Ham Ayçiçek Yağı',        'HAY',  'Ham Yağ',        '151211910000'),
  ('Ayçiçeği Tohumu Küspesi', 'ATK',  'Küspe',          '230630000000'),
  ('Mısır Özü',               'MOZ',  'Yem Hammaddesi', '110430900011')
) as v(name, code, category, hs_code)
where not exists (select 1 from public.products p where lower(p.name) = lower(v.name));

update public.products p
set hs_code = v.hs_code
from (values
  ('mısır',                    '100590000019'),
  ('soya fasulyesi',           '120190000000'),
  ('soya fasülyesi',           '120190000000'),
  ('ayçiçeği tohumu',          '120600990019'),
  ('ayçekirdeği',              '120600990019'),
  ('ay çekirdeği',             '120600990019'),
  ('buğday kepeği',            '230230100011'),
  ('soya fasulyesi küspesi',   '230400000000'),
  ('soya fasülyesi küspesi',   '230400000000'),
  ('ham ayçiçek yağı',         '151211910000'),
  ('ham ayçiçeği yağı',        '151211910000'),
  ('ayçiçeği tohumu küspesi',  '230630000000'),
  ('mısır özü',                '110430900011')
) as v(lname, hs_code)
where lower(p.name) = v.lname
  and (p.hs_code is null or p.hs_code = '');

-- ----------------------------------------------------------------------------
-- tuik_monthly_imports : GTİP kodu bazlı aylık Türkiye ithalatı (ton)
-- ----------------------------------------------------------------------------
create table if not exists public.tuik_monthly_imports (
  id           uuid primary key default gen_random_uuid(),
  hs_code      text not null,
  year         int  not null check (year between 2000 and 2100),
  month        int  not null check (month between 1 and 12),
  quantity_ton numeric not null default 0 check (quantity_ton >= 0),
  value_usd    numeric,
  source       text not null default 'manual', -- manual | api (ileride)
  updated_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_at   timestamptz not null default now(),
  unique (hs_code, year, month)
);
create index if not exists idx_tuik_hs_year on public.tuik_monthly_imports(hs_code, year);

alter table public.tuik_monthly_imports enable row level security;

-- Okuma: iç roller (dış kullanıcılar — nakliyeci/gozetim — hariç).
drop policy if exists tuik_select on public.tuik_monthly_imports;
create policy tuik_select on public.tuik_monthly_imports for select to authenticated
  using (
    public.auth_base_role() in
      ('admin','purchasing','operations','sales','finans','maliyet','viewer')
  );

-- Yazma: admin + satın alma (bağlantıyı yöneten ekip). _view rolleri yazamaz.
drop policy if exists tuik_write on public.tuik_monthly_imports;
create policy tuik_write on public.tuik_monthly_imports for all to authenticated
  using  (public.auth_role() in ('admin','purchasing'))
  with check (public.auth_role() in ('admin','purchasing'));
