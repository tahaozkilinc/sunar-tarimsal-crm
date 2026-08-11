-- Sunar Tarımsal CRM - Bir antrepo altında birden fazla depo/bölüm
-- ----------------------------------------------------------------------------
-- Tek antrepoda birden fazla depo/bölüm olabiliyor. parent_id doluysa bu
-- kayıt, işaret ettiği deponun ALTINDA bir bölümdür. Opsiyonel — yalnızca
-- gerektiğinde kullanılır, tek seviye yeterli (antrepo -> bölüm).

alter table public.warehouses
  add column if not exists parent_id uuid references public.warehouses(id) on delete set null;

alter table public.warehouses
  add constraint warehouses_parent_not_self check (parent_id is null or parent_id <> id);

create index if not exists idx_warehouses_parent on public.warehouses(parent_id);

comment on column public.warehouses.parent_id is
  'Bir antrepo altındaki bölüm/alt depo ise bağlı olduğu ana depo. Opsiyonel.';
