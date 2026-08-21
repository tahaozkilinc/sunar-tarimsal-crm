-- =============================================================================
-- Sunar Tarımsal CRM - Firmanın getirdiği ürünler (CRM'de arama/etiket)
-- ----------------------------------------------------------------------------
-- Bir tedarikçiyle bağlantı (purchase_contracts) açıldıkça, o firmanın hangi
-- ürünleri getirdiği companies.product_tags dizisinde OTOMATİK tutulur —
-- kullanıcı elle girmez, iptal olmayan sözleşmelerden türetilir. CRM'de
-- Firmalar listesinde etiket olarak gösterilir ve serbest metinle aranabilir
-- ("hızlıca arayayım" -> resource-manager.tsx'teki metin filtresi).
-- =============================================================================

alter table public.companies
  add column if not exists product_tags text[] not null default '{}';

create or replace function public.fn_refresh_company_product_tags(p_supplier_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_supplier_id is null then return; end if;
  update public.companies c
  set product_tags = coalesce((
    select array_agg(distinct p.name order by p.name)
    from public.purchase_contracts pc
    join public.products p on p.id = pc.product_id
    where pc.supplier_id = p_supplier_id and pc.status <> 'cancelled'
  ), '{}')
  where c.id = p_supplier_id;
end $$;

create or replace function public.trg_purchase_contracts_product_tags()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.fn_refresh_company_product_tags(old.supplier_id);
    return old;
  end if;
  perform public.fn_refresh_company_product_tags(new.supplier_id);
  if tg_op = 'UPDATE' and old.supplier_id is distinct from new.supplier_id then
    perform public.fn_refresh_company_product_tags(old.supplier_id);
  end if;
  return new;
end $$;

drop trigger if exists trg_pc_product_tags on public.purchase_contracts;
create trigger trg_pc_product_tags
after insert or update of supplier_id, product_id, status or delete on public.purchase_contracts
for each row execute function public.trg_purchase_contracts_product_tags();

-- Mevcut sözleşmelerden bir kerelik geriye dönük doldurma (tüm firmalar —
-- trigger da type'a bakmadan yalnızca supplier_id eşleşmesine göre çalışıyor).
update public.companies c
set product_tags = coalesce((
  select array_agg(distinct p.name order by p.name)
  from public.purchase_contracts pc
  join public.products p on p.id = pc.product_id
  where pc.supplier_id = c.id and pc.status <> 'cancelled'
), '{}');
