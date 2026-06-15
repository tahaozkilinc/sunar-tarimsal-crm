-- =============================================================================
-- Sunar Tarımsal CRM - Yükleme limanı + "Kimin Adına" yönetilebilir liste
-- Sıra: 6 -> Supabase SQL Editor'de çalıştırın. (Idempotent.)
-- =============================================================================

-- 1) Bağlantıya yükleme limanı + "kimin adına" referansı
alter table public.purchase_contracts
  add column if not exists loading_port text,
  add column if not exists principal_id uuid;

-- 2) "Kimin Adına" firmaları (Yönetim'den düzenlenebilir liste)
create table if not exists public.principals (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- FK'yi ayrı ekle (principals sonradan oluştuğu için)
do $$ begin
  alter table public.purchase_contracts
    add constraint purchase_contracts_principal_id_fkey
    foreign key (principal_id) references public.principals(id) on delete set null;
exception when duplicate_object then null; end $$;

-- Başlangıç değerleri
insert into public.principals (name)
select v.name from (values
  ('ELİTA'), ('SUNAR MISIR'), ('SUNAR UN YEM'), ('TİCARET')
) as v(name)
where not exists (select 1 from public.principals p where p.name = v.name);

-- RLS: herkes okur, sadece admin düzenler
alter table public.principals enable row level security;
drop policy if exists principals_select on public.principals;
create policy principals_select on public.principals for select to authenticated using (true);
drop policy if exists principals_write on public.principals;
create policy principals_write on public.principals for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
