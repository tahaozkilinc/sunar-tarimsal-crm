-- Sunar Tarımsal CRM - Broker: purchase_contracts.broker_id + CRM erişimi
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: bağlantı (purchase_contracts) AÇILIRKEN broker seçilebilsin
-- (agent/assigned_to'nun aksine — onlar artık sözleşme açılışında zorunlu
-- değil, sonradan ship-ops'tan atanıyor; broker ise tedarikçi gibi sözleşme
-- imzalanırken belli olan ticari bir taraf, o yüzden formda GÖRÜNÜR kalır,
-- bkz. resources.ts).
--
-- CRM tarafı 0055'teki acente deseniyle birebir aynı: can_see_company +
-- companies_insert genişletilir, contacts otomatik kapsanır (can_see_company
-- üzerinden), ayrı bir contacts politikası GEREKMEZ.
--
-- Broker, tedarikçi/bağlantı ile ilişkili olduğundan (surveyor/port/carrier/
-- agent'ın aksine — onlar "operations"a) CRM'de "purchasing" rolüne açılır.
-- Aktiviteler (crm_activities) 0058'de eklenen kendi module='broker' kovasını
-- kullanır (crm-tabs.tsx: activitiesModule="broker") — mevcut 'purchasing'
-- kovasına (Tedarikçiler sekmesi) hiç karışmaz, ayrı bir company_id filtresi
-- de GEREKMEZ (surveyor/port/carrier/agent'ın 'operations' kovasını paylaşıp
-- company_id ile ayrılmasının aksine, broker kendi izole kovasında tek başına).

alter table public.purchase_contracts
  add column if not exists broker_id uuid references public.companies(id) on delete set null;

create index if not exists idx_pc_broker on public.purchase_contracts(broker_id);

create or replace function public.can_see_company(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then true
    when cid is null then public.auth_base_role() in ('purchasing','operations','sales','finans')
    else exists (
      select 1 from public.companies c
      where c.id = cid and (
        (public.auth_base_role() in ('purchasing','operations') and c.type in ('supplier','both')) or
        (public.auth_base_role() in ('sales','sales_ops','finans') and c.type in ('customer','both')) or
        (public.auth_base_role() = 'operations' and c.type in ('surveyor','port','carrier','agent')) or
        (public.auth_base_role() = 'purchasing' and c.type = 'broker')
      )
    )
  end;
$$;

drop policy if exists companies_insert on public.companies;
create policy companies_insert on public.companies for insert to authenticated
  with check (
    public.is_admin()
    or (public.auth_role() = 'purchasing' and type in ('supplier','both','broker'))
    or (public.auth_role() = 'sales' and type in ('customer','both'))
    or (public.auth_role() = 'operations' and type in ('surveyor','port','carrier','agent'))
  );
