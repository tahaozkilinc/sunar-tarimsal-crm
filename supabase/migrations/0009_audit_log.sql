-- =============================================================================
-- Sunar Tarımsal CRM - Denetim Kaydı (audit log)
-- Sıra: 9 -> Supabase SQL Editor'de çalıştırın. (Idempotent.)
--
-- Kim, ne zaman, hangi tabloda, hangi kaydı ekledi/güncelledi/sildi izlenir.
-- Yazma yalnızca SECURITY DEFINER trigger ile yapılır; istemci doğrudan
-- yazamaz. Okuma sadece admin'e açıktır.
-- =============================================================================

create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  table_name  text not null,
  record_id   uuid,
  action      text not null,            -- INSERT / UPDATE / DELETE
  actor       uuid,                     -- auth.uid()
  actor_email text,
  changed_at  timestamptz not null default now(),
  old_data    jsonb,
  new_data    jsonb
);
create index if not exists idx_audit_changed_at on public.audit_log(changed_at desc);
create index if not exists idx_audit_table on public.audit_log(table_name);
create index if not exists idx_audit_record on public.audit_log(record_id);

alter table public.audit_log enable row level security;

-- Sadece admin okuyabilir. (insert/update/delete politikası YOK -> istemci yazamaz.)
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
  using (public.is_admin());

-- Değişiklikleri yakalayan ortak trigger fonksiyonu.
create or replace function public.fn_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_email text;
begin
  select email into v_email from public.profiles where id = v_actor;
  if (tg_op = 'DELETE') then
    insert into public.audit_log(table_name, record_id, action, actor, actor_email, old_data)
    values (tg_table_name, old.id, tg_op, v_actor, v_email, to_jsonb(old));
    return old;
  elsif (tg_op = 'UPDATE') then
    insert into public.audit_log(table_name, record_id, action, actor, actor_email, old_data, new_data)
    values (tg_table_name, new.id, tg_op, v_actor, v_email, to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.audit_log(table_name, record_id, action, actor, actor_email, new_data)
    values (tg_table_name, new.id, tg_op, v_actor, v_email, to_jsonb(new));
    return new;
  end if;
end $$;

-- Ana iş tablolarına trigger'ı bağla.
do $$
declare t text;
begin
  foreach t in array array[
    'companies','contacts','products','warehouses',
    'purchase_contracts','stock_movements','sales_orders',
    'crm_activities','principals'
  ] loop
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format(
      'create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.fn_audit()',
      t
    );
  end loop;
end $$;
