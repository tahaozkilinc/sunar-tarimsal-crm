-- Sunar Tarımsal CRM - Sözleşmelere serbest, isimli, çoklu döküman ekleme
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: Bağlantı > Sözleşmeler'de her sözleşmeye BİRDEN FAZLA
-- döküman eklenebilsin, her dökümana kullanıcı bir İSİM versin, sürükle-bırak
-- ile yüklenebilsin.
--
-- Bununla karıştırılmaması gereken iki mevcut şey var:
--   - purchase_contracts.contract_file_url (0001): TEK dosyalık form alanı,
--     dokunulmuyor (geriye dönük uyumluluk için kalıyor).
--   - contract_photos (0022): operasyonun gemiye ait NUMUNE fotoğrafları için
--     ayrı bir kavram — yazma yetkisi operasyonda (can_access_ship ile gemiye
--     özel). Bu yenisi satın almanın yönettiği GENEL dökümanlar için
--     (purchase_contracts writeRoles ile aynı: admin+purchasing).
--
-- can_access_contract(uuid) fonksiyonu 0022'de zaten tanımlı (SECURITY
-- INVOKER, pc_select'i miras alır) — okuma politikası için AYNEN yeniden
-- kullanılıyor, yeni bir fonksiyon gerekmiyor.
--
-- Storage okuma politikası, 0024'teki "contracts" kovası sertleştirmesiyle
-- AYNI ilkeyle baştan kuruluyor: yol sızsa bile, tabloda karşılık gelen bir
-- satır yoksa okunamaz.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contract-documents', 'contract-documents', false, 20971520, -- 20 MB
  array[
    'application/pdf','image/jpeg','image/png','image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

create table if not exists public.contract_documents (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null references public.purchase_contracts(id) on delete cascade,
  path         text not null,
  label        text not null,
  created_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_cd_contract on public.contract_documents(contract_id);

alter table public.contract_documents enable row level security;

drop policy if exists cd_select on public.contract_documents;
create policy cd_select on public.contract_documents for select to authenticated
  using (public.can_access_contract(contract_id));

drop policy if exists cd_write on public.contract_documents;
create policy cd_write on public.contract_documents for all to authenticated
  using (public.auth_role() in ('admin','purchasing'))
  with check (public.auth_role() in ('admin','purchasing'));

drop policy if exists contract_documents_read on storage.objects;
create policy contract_documents_read on storage.objects for select to authenticated
  using (
    bucket_id = 'contract-documents'
    and exists (select 1 from public.contract_documents cd where cd.path = storage.objects.name)
  );

drop policy if exists contract_documents_insert on storage.objects;
create policy contract_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'contract-documents' and public.auth_role() in ('admin','purchasing'));

drop policy if exists contract_documents_delete on storage.objects;
create policy contract_documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'contract-documents' and public.auth_role() in ('admin','purchasing'));
