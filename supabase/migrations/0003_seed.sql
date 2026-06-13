-- =============================================================================
-- Sunar Tarımsal CRM - Başlangıç Verisi + Admin Hesabı
-- Sıra: 3/3 -> 0002_policies.sql'den SONRA çalıştırın.
--
-- Admin: taha.ozkilinc@sunaryatirim.com.tr / Sunar19*
-- (Bu blok idempotent'tir; tekrar çalıştırmak güvenlidir.)
-- =============================================================================

-- Örnek hammaddeler (yağlı tohumlar) -----------------------------------------
insert into public.products (name, code, category, unit)
select v.name, v.code, 'Yağlı Tohum', 'ton'
from (values
  ('Ayçiçeği Tohumu', 'AYC'),
  ('Soya Fasulyesi', 'SOY'),
  ('Kanola (Kolza)', 'KAN'),
  ('Aspir', 'ASP'),
  ('Pamuk Tohumu (Çiğit)', 'PAM'),
  ('Keten Tohumu', 'KET')
) as v(name, code)
where not exists (select 1 from public.products p where p.name = v.name);

-- Örnek depo / fabrika (sonradan Yönetim ekranından düzenlenebilir) -----------
insert into public.warehouses (name, type, city)
select v.name, v.type::public.location_type, v.city
from (values
  ('Merkez Depo', 'warehouse', 'İstanbul'),
  ('Liman Deposu', 'warehouse', 'İzmir'),
  ('Ezme Fabrikası', 'factory', 'Tekirdağ')
) as v(name, type, city)
where not exists (select 1 from public.warehouses w where w.name = v.name);

-- Admin kullanıcısı -----------------------------------------------------------
-- Not: Eğer bu blok ortamınızda hata verirse, kullanıcıyı Supabase panelinden
--      (Authentication -> Users -> Add user, "Auto Confirm User" işaretli)
--      oluşturun; trigger e-postayı görüp otomatik 'admin' rolü atayacaktır.
do $$
declare
  v_uid uuid;
  v_email text := 'taha.ozkilinc@sunaryatirim.com.tr';
begin
  select id into v_uid from auth.users where email = v_email;

  if v_uid is null then
    v_uid := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      v_email,
      extensions.crypt('Sunar19*', extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', 'Taha Özkılınç', 'role', 'admin'),
      '', '', '', ''
    );

    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      v_uid::text, v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
      'email', now(), now(), now()
    );
  end if;

  -- Profil satırını her durumda admin olarak garanti et.
  insert into public.profiles (id, email, full_name, role)
  values (v_uid, v_email, 'Taha Özkılınç', 'admin')
  on conflict (id) do update set role = 'admin', is_active = true;
end $$;
