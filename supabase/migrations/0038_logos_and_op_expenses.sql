-- =============================================================================
-- Sunar Tarımsal CRM - Firma logoları + operasyon masrafları genellemesi
-- Sıra: 38 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- 1) Firma logosu: companies.logo_url + private 'company-logos' kovası.
--    Yükleme/silme: firma yazabilen roller (companies_write ile aynı küme).
--    Okuma: kayıtla bağlantılı (0024 derinlemesine-savunma deseni) — yol ancak
--    bir companies.logo_url'de kayıtlıysa okunur; görseller imzalı URL ile açılır.
--
-- 2) Operasyon masrafları: warehouse_expenses.warehouse_id NULLABLE olur.
--    Demuraj/gözetim ücreti/navlun/sigorta gibi masraflar DEPOYA değil GEMİYE
--    aittir; şimdiye kadar depo zorunlu olduğundan girilemiyordu. Kural:
--    depo VEYA bağlantıdan en az biri seçilmeli (ikisi de boş olamaz).
-- =============================================================================

-- 1) Logo kolonu + kova
alter table public.companies
  add column if not exists logo_url text;

insert into storage.buckets (id, name, public)
values ('company-logos', 'company-logos', false)
on conflict (id) do nothing;

drop policy if exists company_logos_read on storage.objects;
create policy company_logos_read on storage.objects for select to authenticated
  using (
    bucket_id = 'company-logos'
    and exists (
      select 1 from public.companies c
      where c.logo_url = storage.objects.name
    )
  );

drop policy if exists company_logos_insert on storage.objects;
create policy company_logos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'company-logos'
    and public.auth_role() in ('admin','purchasing','sales','operations')
  );

drop policy if exists company_logos_delete on storage.objects;
create policy company_logos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'company-logos'
    and public.auth_role() in ('admin','purchasing','sales','operations')
  );

-- 2) Masraf: depo opsiyonel, ama depo VEYA bağlantı zorunlu
alter table public.warehouse_expenses
  alter column warehouse_id drop not null;

alter table public.warehouse_expenses drop constraint if exists ck_we_target;
alter table public.warehouse_expenses add constraint ck_we_target
  check (warehouse_id is not null or contract_id is not null);
