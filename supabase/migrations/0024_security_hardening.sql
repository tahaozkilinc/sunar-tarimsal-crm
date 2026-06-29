-- =============================================================================
-- Sunar Tarımsal CRM - Güvenlik sertleştirmesi
-- Sıra: 24 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- 1) handle_new_user: yeni kullanıcının rolü ARTIK istemci metadata'sından
--    ALINMAZ. Aksi halde public signup açıkken biri anon anahtarla
--    auth.signUp({ data:{ role:'admin' }}) çağırıp kendini admin yapabilirdi.
--    Roller yalnızca admin tarafından (service-key ile, admin API üzerinden)
--    atanır. Tek istisna: kurucu admin e-postası. (Ayrıca Supabase Auth'ta
--    public signup'ı kapatmanız önerilir — bu iki katmanlı korumadır.)
--
-- 2) Storage okuma: contracts / movement-photos / contract-photos kovalarında
--    okuma artık "tüm girişli kullanıcılar" değil; ilgili kaydı (RLS gereği)
--    görebilen kullanıcıyla sınırlı. Dosya yolları zaten rastgele UUID'di, ama
--    bu, derinlemesine savunmayı tamamlar (yol sızsa bile yetkisiz okuyamaz).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Güvenli kullanıcı oluşturma trigger'ı
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  desired_role public.user_role := 'pending';
begin
  -- Rol ASLA new.raw_user_meta_data'dan okunmaz (yetki yükseltmeyi önler).
  -- Kurucu admin e-postası tek istisnadır; diğer roller admin tarafından atanır.
  if new.email = 'taha.ozkilinc@sunaryatirim.com.tr' then
    desired_role := 'admin';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    desired_role
  )
  on conflict (id) do update set email = excluded.email;

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Storage okuma politikalarını kayıt görünürlüğüne bağla
--    (insert/update/delete politikaları değişmez; sadece SELECT daraltılır.)
-- ---------------------------------------------------------------------------
drop policy if exists contracts_read on storage.objects;
create policy contracts_read on storage.objects for select to authenticated
  using (
    bucket_id = 'contracts'
    and exists (
      select 1 from public.purchase_contracts pc
      where pc.contract_file_url = storage.objects.name
    )
  );

drop policy if exists movement_photos_read on storage.objects;
create policy movement_photos_read on storage.objects for select to authenticated
  using (
    bucket_id = 'movement-photos'
    and exists (
      select 1 from public.movement_photos mp
      where mp.path = storage.objects.name
    )
  );

drop policy if exists contract_photos_read on storage.objects;
create policy contract_photos_read on storage.objects for select to authenticated
  using (
    bucket_id = 'contract-photos'
    and exists (
      select 1 from public.contract_photos cp
      where cp.path = storage.objects.name
    )
  );
