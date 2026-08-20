-- =============================================================================
-- Sunar Tarımsal CRM - Kullanıcı bazlı arayüz dili (tr/en)
-- ----------------------------------------------------------------------------
-- Önceden yalnızca "acente" rolü sabit olarak İngilizce görüyordu (bkz.
-- src/lib/i18n.ts — L() ile hedefli, tek tek). Artık HER kullanıcı kendi
-- dilini profilinden seçebiliyor; acente'nin varsayılanı geriye dönük uyumluluk
-- için 'en' olarak taşınıyor, dilerse Türkçe'ye geri alabilir.
-- =============================================================================

alter table public.profiles
  add column if not exists language text not null default 'tr' check (language in ('tr', 'en'));

update public.profiles set language = 'en' where role = 'acente' and language = 'tr';

-- Kendi dilini güncelleme (update_my_profile() ile aynı desen — yalnızca
-- kendi satırını, yalnızca bu alanı değiştirir).
create or replace function public.update_my_language(p_language text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_language not in ('tr', 'en') then
    raise exception 'Geçersiz dil: %', p_language;
  end if;
  update public.profiles set language = p_language where id = auth.uid();
end $$;
grant execute on function public.update_my_language(text) to authenticated;
revoke execute on function public.update_my_language(text) from anon, public;
