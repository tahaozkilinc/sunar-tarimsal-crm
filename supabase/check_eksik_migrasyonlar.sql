-- =============================================================================
-- Sunar Tarımsal CRM - Eksik migration teşhisi
-- Bunu CRM'in KENDİ Supabase projesinin SQL Editor'ünde çalıştır (0021/0022'yi
-- çalıştırdığın yer). Her satır, ilgili migration'ın anahtar nesnesinin var olup
-- olmadığını gösterir. "EKSİK" görünen satırların migration dosyasını çalıştır.
-- Salt-okunurdur; hiçbir şeyi değiştirmez.
-- =============================================================================

with checks(migration, beklenen_nesne, var) as (
  values
    ('0001', 'tablo: companies',
      exists(select 1 from information_schema.tables where table_schema='public' and table_name='companies')),
    ('0001', 'tablo: purchase_contracts',
      exists(select 1 from information_schema.tables where table_schema='public' and table_name='purchase_contracts')),
    ('0001', 'enum: user_role',
      exists(select 1 from pg_type where typname='user_role')),
    ('0004', 'fonksiyon: mark_contract_arrived',
      exists(select 1 from pg_proc where proname='mark_contract_arrived')),
    ('0006', 'tablo: principals',
      exists(select 1 from information_schema.tables where table_schema='public' and table_name='principals')),
    ('0007', 'enum user_role değeri: maliyet',
      exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='user_role' and e.enumlabel='maliyet')),
    ('0007', 'view: sellable_contracts',
      exists(select 1 from information_schema.views where table_schema='public' and table_name='sellable_contracts')),
    ('0009', 'tablo: audit_log',
      exists(select 1 from information_schema.tables where table_schema='public' and table_name='audit_log')),
    ('0010', 'storage kovası: contracts',
      exists(select 1 from storage.buckets where id='contracts')),
    ('0011', 'kolon: purchase_contracts.usd_try (TCMB kuru)',
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='purchase_contracts' and column_name='usd_try')),
    ('0011', 'kolon: sales_orders.usd_try (TCMB kuru)',
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='sales_orders' and column_name='usd_try')),
    ('0012', 'kolon: purchase_contracts.assigned_to',
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='purchase_contracts' and column_name='assigned_to')),
    ('0012', 'fonksiyon: can_access_ship',
      exists(select 1 from pg_proc where proname='can_access_ship')),
    ('0014', 'enum user_role değeri: viewer',
      exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='user_role' and e.enumlabel='viewer')),
    ('0015', 'enum user_role değeri: operations_view',
      exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='user_role' and e.enumlabel='operations_view')),
    ('0015', 'fonksiyon: auth_base_role',
      exists(select 1 from pg_proc where proname='auth_base_role')),
    ('0018', 'fonksiyon: is_view_role',
      exists(select 1 from pg_proc where proname='is_view_role')),
    ('0019', 'enum company_type değeri: carrier',
      exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='company_type' and e.enumlabel='carrier')),
    ('0019', 'enum crm_module değeri: operations',
      exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='crm_module' and e.enumlabel='operations')),
    ('0019', 'view: profile_names',
      exists(select 1 from information_schema.views where table_schema='public' and table_name='profile_names')),
    ('0020', 'kolon: purchase_contracts.carrier_id',
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='purchase_contracts' and column_name='carrier_id')),
    ('0020', 'fonksiyon: assign_ship_parties',
      exists(select 1 from pg_proc where proname='assign_ship_parties')),
    ('0021', 'tablo: movement_photos',
      exists(select 1 from information_schema.tables where table_schema='public' and table_name='movement_photos')),
    ('0021', 'storage kovası: movement-photos',
      exists(select 1 from storage.buckets where id='movement-photos')),
    ('0021', 'fonksiyon: can_write_movement',
      exists(select 1 from pg_proc where proname='can_write_movement')),
    ('0022', 'tablo: contract_photos',
      exists(select 1 from information_schema.tables where table_schema='public' and table_name='contract_photos')),
    ('0022', 'storage kovası: contract-photos',
      exists(select 1 from storage.buckets where id='contract-photos')),
    ('0022', 'fonksiyon: can_access_contract',
      exists(select 1 from pg_proc where proname='can_access_contract')),
    ('0023', 'enum user_role değeri: nakliyeci',
      exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='user_role' and e.enumlabel='nakliyeci')),
    ('0023', 'kolon: profiles.company_id',
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='company_id')),
    ('0023', 'fonksiyon: is_my_carrier_ship',
      exists(select 1 from pg_proc where proname='is_my_carrier_ship')),
    ('0024', 'güvenlik: storage contracts_read kayda bağlı',
      exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='contracts_read' and coalesce(qual,'') like '%purchase_contracts%')),
    ('0024', 'güvenlik: handle_new_user metadata role kullanmıyor',
      not exists(select 1 from pg_proc where proname='handle_new_user' and pg_get_functiondef(oid) ~ 'raw_user_meta_data\s*->>\s*''role'''))
)
select
  migration,
  beklenen_nesne,
  case when var then '✅ var' else '❌ EKSİK -> bu migration''ı çalıştır' end as durum
from checks
order by migration, beklenen_nesne;
