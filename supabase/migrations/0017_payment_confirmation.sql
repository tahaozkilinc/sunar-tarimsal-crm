-- =============================================================================
-- Sunar Tarımsal CRM - Finans: ödeme onayı (ödendi işareti + ödeme ID)
-- Sıra: 17 -> 0016'dan SONRA çalıştırın. (Idempotent.)
--
-- finans rolüne, bağlantıyı "ödendi" işaretleme + ödemeye ait ID/referans
-- girme yetkisi verir. finans'ın purchase_contracts tablosunda genel UPDATE
-- yetkisi YOKTUR (fiyat/tedarikçi/miktar gibi alanları göremez/değiştiremez);
-- bu yüzden SADECE ödeme alanlarını güncelleyen bir SECURITY DEFINER fonksiyon
-- kullanılır (update_my_profile() ile aynı desen). Fonksiyon dışında finans'a
-- purchase_contracts üzerinde hiçbir write/select politikası açılmaz.
-- =============================================================================

alter table public.purchase_contracts
  add column if not exists is_paid     boolean not null default false,
  add column if not exists payment_ref text,
  add column if not exists paid_at     timestamptz;

create or replace function public.set_contract_paid(
  p_contract_id  uuid,
  p_paid         boolean,
  p_payment_ref  text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.auth_base_role() not in ('admin', 'finans') then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;

  if p_paid and (p_payment_ref is null or length(btrim(p_payment_ref)) = 0) then
    raise exception 'Ödeme ID girmeden ödendi işaretlenemez';
  end if;

  update public.purchase_contracts
  set is_paid     = p_paid,
      payment_ref = case when p_paid then btrim(p_payment_ref) else payment_ref end,
      paid_at     = case when p_paid then now() else null end
  where id = p_contract_id;

  if not found then
    raise exception 'Bağlantı bulunamadı';
  end if;
end $$;

grant execute on function public.set_contract_paid(uuid, boolean, text) to authenticated;

-- payment_schedule: ödeme durumu kolonları eklendi (kolon sırası nedeniyle drop+create).
drop view if exists public.payment_schedule cascade;
create view public.payment_schedule
with (security_invoker = off) as
  select
    pc.id,
    pc.contract_no,
    pc.vessel,
    pc.payment_due_date,
    pc.eta,
    pc.status,
    pc.quantity,
    pc.price,
    pc.currency,
    pc.usd_try,
    pc.eur_try,
    pc.is_paid,
    pc.payment_ref,
    pc.paid_at,
    co.name  as supplier_name,
    pr.name  as product_name
  from public.purchase_contracts pc
  left join public.companies co on co.id = pc.supplier_id
  left join public.products  pr on pr.id = pc.product_id
  where public.auth_base_role() in ('admin', 'finans', 'viewer')
    and pc.payment_due_date is not null
    and pc.status <> 'cancelled';

grant select on public.payment_schedule to authenticated;
