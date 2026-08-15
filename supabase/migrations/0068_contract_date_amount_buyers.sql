-- Sunar Tarımsal CRM - Sözleşme tarihi, sözleşme tutarı, yönetilebilir Alıcılar
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği (3 parça):
-- 1) Yeni sözleşme eklerken bir "Sözleşme Tarihi" girilebilsin — created_at
--    (sisteme KAYDEDİLDİĞİ an) ile KARIŞMASIN, bu yüzden ayrı bir kolon.
-- 2) "Sözleşme Tutarı" = Miktar × Birim Fiyat, otomatik hesaplanıp yazılsın
--    ama kullanıcı isterse elle revize edebilsin (bkz. resources.ts
--    FieldDef.multiplyOf + resource-manager.tsx — yalnızca YENİ kayıtta canlı
--    hesaplanır, mevcut kaydı düzenlerken dokunulmaz; DB'de GENERATED değil,
--    sıradan bir kolon, çünkü elle üzerine yazılabilmesi gerekiyor).
-- 3) "Alıcı" artık principals'taki ("Kimin Adına" — zaten Yönetim'den
--    düzenlenebilir bir liste, bkz. 0006) AYNI desende, yönetilebilir bir
--    tablo: sabit BUYER_OPTIONS dizisi yerine buyers tablosu + admin sekmesi.
--    purchase_contracts o an 0 satır olduğundan (operasyonel veri az önce
--    temizlendi) veri taşımaya gerek yok — buyer kolonu doğrudan kaldırılıyor.

create table if not exists public.buyers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.buyers (name)
select v.name from (values ('Sunar'), ('Mısır'), ('Elita Ticaret')) as v(name)
where not exists (select 1 from public.buyers b where b.name = v.name);

alter table public.buyers enable row level security;

drop policy if exists buyers_select on public.buyers;
create policy buyers_select on public.buyers for select to authenticated using (true);

drop policy if exists buyers_write on public.buyers;
create policy buyers_write on public.buyers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.purchase_contracts
  add column if not exists contract_date date,
  add column if not exists contract_amount numeric,
  add column if not exists buyer_id uuid references public.buyers(id) on delete set null;

alter table public.purchase_contracts drop column if exists buyer;
