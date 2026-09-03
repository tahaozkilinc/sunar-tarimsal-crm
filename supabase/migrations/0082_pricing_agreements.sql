-- =============================================================================
-- Sunar Tarımsal CRM - Depo / Liman anlaşmalı fiyatları
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: depo ve liman için ayrı ayrı "anlaşmalı fiyat" kaydı —
-- fiyatlandırma şekli tektip değil: depo TON BAŞINA, YILLIK SABİT ya da
-- (kiralama gibi) tamamen SABİT olabilir; liman genelde tek bir sabit/ton
-- başına ücrettir ama aynı 3 seçenek liman için de açık bırakıldı (kısıtlamaya
-- gerek yok). warehouse_expenses'in AKSİNE bu, fiilen oluşan bir masraf değil,
-- STANDING bir anlaşma/tarife kaydıdır — zaman içinde değişebileceğinden
-- (yeni yıl, yeni kira) geçmişi kaybetmemek için var olanı güncellemek yerine
-- yeni bir satır eklenir (geçerlilik tarihleriyle).
-- =============================================================================

create table public.pricing_agreements (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('warehouse', 'port')),
  warehouse_id uuid references public.warehouses(id) on delete cascade,
  port_id uuid references public.companies(id) on delete cascade,
  pricing_model text not null check (pricing_model in ('per_ton', 'annual', 'flat')),
  price numeric not null check (price >= 0),
  currency text not null default 'USD',
  valid_from date,
  valid_to date,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  constraint ck_pa_target check (
    (target_type = 'warehouse' and warehouse_id is not null and port_id is null) or
    (target_type = 'port' and port_id is not null and warehouse_id is null)
  ),
  constraint ck_pa_valid_range check (valid_from is null or valid_to is null or valid_to >= valid_from)
);

comment on table public.pricing_agreements is
  'Depo/liman ile anlaşmalı fiyat (tarife) kayıtları — ton başına / yıllık sabit / sabit (kira).';
comment on column public.pricing_agreements.price is
  'pricing_model''e göre anlam değişir: per_ton -> $/ton, annual -> $/yıl, flat -> toplam sabit tutar.';

alter table public.pricing_agreements enable row level security;

-- Okuma: iç roller (warehouse_expenses ile aynı desen — dış roller göremez).
create policy pa_select on public.pricing_agreements for select to authenticated
  using (
    public.auth_base_role() in ('admin', 'purchasing', 'operations', 'maliyet', 'finans', 'viewer')
  );

-- Yazma: admin + operasyon + maliyet (_view rolleri hariç).
create policy pa_write on public.pricing_agreements for all to authenticated
  using (public.auth_role() in ('admin', 'operations', 'maliyet'))
  with check (public.auth_role() in ('admin', 'operations', 'maliyet'));

drop trigger if exists trg_audit on public.pricing_agreements;
create trigger trg_audit after insert or update or delete on public.pricing_agreements
  for each row execute function public.fn_audit();
