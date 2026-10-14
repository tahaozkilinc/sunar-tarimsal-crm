-- =============================================================================
-- Sunar Tarımsal CRM - Firmalar artık BİRDEN FAZLA tür etiketi taşıyabiliyor
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: "bir firma aynı anda hem alıcı hem satıcı olabilir, yani
-- CRM'de birden fazla etiket yazabilme yetkisi ver" — gerçek çok-seçimli
-- etiket sistemi istendi (sabit birkaç kombinasyon değil). companies.type
-- (tek enum değeri) yerine companies.types (enum DİZİSİ) kullanılıyor.
--
-- Eski 'both' (alıcı+satıcı) özel değeri artık gereksiz — gerçek çok-seçim
-- varken ['supplier','customer'] yazmak yeterli. Backfill'de 'both' olan
-- satırlar bu ikiliye genişletildi; 'both' değeri COMPANY_TYPE_OPTIONS'tan
-- (frontend) kaldırıldı ama enum'dan SİLİNMEDİ (Postgres'te enum değeri
-- silmek güvenli değil/karmaşık) — tıpkı daha önce kalan kullanılmayan
-- 'broker_sea' değeri gibi, zararsız şekilde kullanılmadan duruyor.
--
-- BİLİNEN TEKNİK BORÇ: eski companies.type kolonu bu oturumda silinemedi —
-- ortam ALTER TABLE ... DROP COLUMN'u (ve genel olarak DROP içeren DDL'leri)
-- tekrar tekrar zaman aşımına uğrattı (ALTER POLICY gibi DROP içermeyen
-- ifadeler sorunsuz çalıştı — bu oturumda keşfedilen desen). Kolon artık
-- hiçbir RLS politikası/fonksiyon/frontend kodu tarafından okunmuyor/
-- yazılmıyor, zararsız şekilde duruyor; bağlantı stabilize olunca ayrı bir
-- migration'la (`alter table companies drop column type;`) tamamlanabilir.
-- =============================================================================

alter table public.companies add column types company_type[];

update public.companies
set types = case when type = 'both' then array['supplier','customer']::company_type[] else array[type] end
where types is null;

alter table public.companies alter column types set not null;
-- DİKKAT: array_length(arr,1) BOŞ dizi için NULL döner (0 değil!) — bir CHECK'te
-- NULL "geçti" sayılır, yani array_length ile yazılan bir boş-dizi kontrolü
-- SESSİZCE İŞE YARAMAZ (canlıda test edilip yakalandı). cardinality() boş
-- dizi için 0 döner, doğru olan bu.
alter table public.companies add constraint ck_companies_types_nonempty check (cardinality(types) > 0);

-- can_see_company: tek değer eşitliği yerine dizi KESİŞİMİ (overlap) —
-- bir firma birden fazla türe sahipse, rolün ilgilendiği türlerden HERHANGİ
-- biri yeterli (ör. hem liman hem müşteri ise, operasyon liman'dan dolayı görür).
create or replace function public.can_see_company(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then true
    when cid is null then public.auth_base_role() in ('purchasing','operations','sales','finans')
    else exists (
      select 1 from public.companies c
      where c.id = cid and (
        (public.auth_base_role() in ('purchasing','operations') and c.types && array['supplier']::company_type[]) or
        (public.auth_base_role() in ('sales','sales_ops','finans') and c.types && array['customer']::company_type[]) or
        (public.auth_base_role() = 'operations' and c.types && array['surveyor','port','carrier','agent','ship_broker','customs_broker']::company_type[]) or
        (public.auth_base_role() = 'purchasing' and c.types && array['broker']::company_type[])
      )
    )
  end;
$$;

-- companies_insert: ALTER POLICY (DROP+CREATE değil — DROP bu oturumda
-- zaman aşımına uğruyordu). Yazma tarafında overlap YETMEZ — subset (<@)
-- + "en az kendi ana türü" kontrolü gerekiyor; aksi halde purchasing
-- yalnızca 'customer' (sales'in alanı) etiketiyle firma açabilirdi.
alter policy companies_insert on public.companies
  with check (
    public.is_admin()
    or (public.auth_role() = 'purchasing'
        and types <@ array['supplier','customer','broker']::company_type[]
        and types && array['supplier','broker']::company_type[])
    or (public.auth_role() = 'sales'
        and types <@ array['customer','supplier']::company_type[]
        and types && array['customer']::company_type[])
    or (public.auth_role() = 'operations'
        and types <@ array['surveyor','port','carrier','agent','ship_broker','customs_broker']::company_type[])
  );
