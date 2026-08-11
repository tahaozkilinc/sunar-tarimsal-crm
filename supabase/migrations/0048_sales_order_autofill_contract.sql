-- Sunar Tarımsal CRM - Satışta bağlantı (gemi) otomatik ataması
-- ----------------------------------------------------------------------------
-- Satış artık "gemi adı seçerek" değil, ÜRÜN + MİKTAR ile yapılıyor (formda
-- contract_id gizlendi, product_id zorunlu görünür alan oldu). "Bağlantısız
-- satış olmaz" kuralı (0045) AYNEN korunuyor — yalnızca KİM seçtiği değişti:
-- kullanıcı yerine bu trigger, o ürün için yeterli kalan tonajı olan, ETA'sı
-- en yakın (en erken) bağlantıyı otomatik atıyor. Tek bir bağlantı miktarı
-- karşılamıyorsa (aynı üründe birden çok gemi var ama hiçbiri tek başına
-- yetmiyorsa) satış reddedilir — kullanıcı miktarı azaltmalı ya da satışı
-- bölmeli (otomatik bölme yok, basit ve öngörülebilir kalsın diye).
--
-- contract_id zaten doluysa (ör. ileride admin elle atarsa) dokunulmaz.

create or replace function public.fn_sales_order_autofill_contract()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
    raise exception 'Bu ürün için % ton karşılayacak, tek başına yeterli kalan tonajı olan bir bağlantı (gemi) yok. Miktarı azaltın ya da satışı bölün.', new.quantity;
  end if;

  new.contract_id := v_contract_id;
  return new;
end;
$$;

drop trigger if exists trg_sales_order_autofill_contract on public.sales_orders;
create trigger trg_sales_order_autofill_contract
  before insert on public.sales_orders
  for each row execute function public.fn_sales_order_autofill_contract();

-- Yalnızca trigger olarak çalışması yeterli; doğrudan RPC çağrısına açık
-- olmasına gerek yok (trigger tetiklenmesi bu grant'lardan etkilenmez).
revoke execute on function public.fn_sales_order_autofill_contract() from anon, authenticated, public;
