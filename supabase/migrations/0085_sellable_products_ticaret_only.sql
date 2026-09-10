-- =============================================================================
-- Sunar Tarımsal CRM - Satışta yalnızca TİCARET adına alınan mallar
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: "satış kısmında sadece ticaret adına alınabilir malları
-- göster" — şirketin birden fazla tüzel kişiliği (principals: ELİTA, SUNAR
-- MISIR, SUNAR UN YEM, TİCARET) adına sözleşme açılabiliyor, ama satış
-- faturası yalnızca TİCARET adına kesilebiliyor. sellable_products (0079)
-- artık yalnızca herhangi bir depoda stoğu olan DEĞİL, aynı zamanda TİCARET
-- adına açılmış ve kalan (satılmamış) tonajı olan en az bir sözleşmesi
-- bulunan ürünleri listeliyor.
--
-- Yalnızca ürün listesini kısıtlamak yetmez: fn_sales_order_autofill_contract
-- (0048) satış oluşturulunca ürüne göre uygun sözleşmeyi OTOMATİK seçiyor —
-- bu da aynı kısıtla güncellenmezse, listede "satılabilir" görünen bir ürün
-- yine de en yakın ETA'lı BAŞKA bir tüzel kişiliğin sözleşmesine sessizce
-- düşebilirdi. İkisi birlikte tutarlı.
-- =============================================================================

create or replace view public.sellable_products
with (security_invoker = true) as
select p.*
from public.products p
where p.is_active = true
and exists (
  select 1 from public.inventory i
  where i.product_id = p.id and i.available_qty > 0.001
)
and exists (
  select 1 from public.purchase_contracts pc
  where pc.product_id = p.id
    and pc.status <> 'cancelled'
    and pc.principal_id = (select id from public.principals where name = 'TİCARET')
    and pc.quantity - coalesce((
      select sum(so.quantity)
      from public.sales_orders so
      where so.contract_id = pc.id and so.status <> 'cancelled'
    ), 0) > 0.001
);

create or replace function public.fn_sales_order_autofill_contract()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_contract_id uuid;
begin
  if new.contract_id is not null then
    return new;
  end if;
  if new.product_id is null then
    raise exception 'Ürün seçilmeden satış için uygun bağlantı bulunamaz';
  end if;
  if new.quantity is null or new.quantity <= 0 then
    raise exception 'Geçerli bir miktar girilmeden bağlantı atanamaz';
  end if;

  select pc.id into v_contract_id
  from public.purchase_contracts pc
  where pc.product_id = new.product_id
    and pc.status <> 'cancelled'
    and pc.principal_id = (select id from public.principals where name = 'TİCARET')
    and pc.quantity - coalesce((
      select sum(so.quantity)
      from public.sales_orders so
      where so.contract_id = pc.id
        and so.status <> 'cancelled'
        and so.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ), 0) >= new.quantity
  order by pc.eta asc nulls last
  limit 1;

  if v_contract_id is null then
    raise exception 'Bu ürün için % ton karşılayacak, TİCARET adına açılmış yeterli kalan tonajı olan bir bağlantı (gemi) yok. Miktarı azaltın ya da satışı bölün.', new.quantity;
  end if;

  new.contract_id := v_contract_id;
  return new;
end;
$function$;
