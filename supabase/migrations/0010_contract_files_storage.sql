-- =============================================================================
-- Sunar Tarımsal CRM - Sözleşme dosyaları için Storage kovası
-- Sıra: 10 -> Supabase SQL Editor'de çalıştırın. (Idempotent.)
--
-- purchase_contracts.contract_file_url kolonu zaten şemada mevcut (0001).
-- Burada dosyaların yükleneceği özel (private) "contracts" kovasını ve
-- erişim politikalarını tanımlıyoruz. Dosyalar imzalı URL ile açılır.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', false)
on conflict (id) do nothing;

-- Okuma: giriş yapmış tüm kullanıcılar (bağlantıyı görenler dosyayı da görür).
drop policy if exists contracts_read on storage.objects;
create policy contracts_read on storage.objects for select to authenticated
  using (bucket_id = 'contracts');

-- Yükleme/güncelleme/silme: bağlantıyı yöneten roller (admin + purchasing).
drop policy if exists contracts_insert on storage.objects;
create policy contracts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'contracts' and public.auth_role() in ('admin','purchasing'));

drop policy if exists contracts_update on storage.objects;
create policy contracts_update on storage.objects for update to authenticated
  using (bucket_id = 'contracts' and public.auth_role() in ('admin','purchasing'))
  with check (bucket_id = 'contracts' and public.auth_role() in ('admin','purchasing'));

drop policy if exists contracts_delete on storage.objects;
create policy contracts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'contracts' and public.auth_role() in ('admin','purchasing'));
