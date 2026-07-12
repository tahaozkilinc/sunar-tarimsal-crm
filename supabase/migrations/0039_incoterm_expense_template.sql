-- =============================================================================
-- Sunar Tarımsal CRM - Incoterm'e göre otomatik masraf şablonu
-- Sıra: 39 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- Her yeni bağlantı (purchase_contract) açıldığında, teslim şekline göre
-- ALICIYA (bize) düşen beklenen masraf kalemleri OTOMATİK oluşturulur:
--   FOB / FCA : Navlun + Sigorta + Gözetim + Liman + Gümrük
--   EXW       : + Yükleme (hepsi bizde)
--   CFR       : Sigorta + Gözetim + Liman + Gümrük (navlun satıcıda)
--   CIF / DAP : Gözetim + Liman + Gümrük (navlun+sigorta satıcıda)
-- Kalemler tutar=0 ve is_auto=true ile açılır: "tutar girilmesi bekleniyor".
-- Kur alanları bağlantının TCMB kurundan kopyalanır (USD çevrimi hazır olsun).
--
-- Incoterm sonradan değişirse: yeni şablonda olmayan, TUTARI HÂLÂ 0 olan
-- otomatik kalemler silinir; elle girilmiş veya tutarı yazılmış kalemlere
-- DOKUNULMAZ. Şablon, aynı türde kayıt zaten varsa ikinci kez açılmaz.
--
-- SECURITY DEFINER: bağlantıyı satın alma açar ama masraf yazma RLS'i
-- (we_write) satın almada yoktur; şablon sistem adına yazılır.
-- =============================================================================

alter table public.warehouse_expenses
  add column if not exists is_auto boolean not null default false;

create or replace function public.fn_pc_expense_template()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_types text[];
  t text;
begin
  if new.incoterm is null then
    return new;
  end if;

  v_types := case new.incoterm
    when 'FOB' then array['freight','insurance','survey','port','customs']
    when 'FCA' then array['freight','insurance','survey','port','customs']
    when 'EXW' then array['freight','insurance','loading','survey','port','customs']
    when 'CFR' then array['insurance','survey','port','customs']
    when 'CIF' then array['survey','port','customs']
    when 'DAP' then array['survey','port','customs']
    else array['survey','port','customs']
  end;

  -- Incoterm değişimi: eski şablondan kalan ve hâlâ tutarsız (0) otomatik
  -- kalemlerden yeni şablonda yeri olmayanları temizle.
  if tg_op = 'UPDATE' then
    delete from public.warehouse_expenses
    where contract_id = new.id
      and is_auto = true
      and amount = 0
      and expense_type <> all (v_types);
  end if;

  foreach t in array v_types loop
    if not exists (
      select 1 from public.warehouse_expenses
      where contract_id = new.id and expense_type = t
    ) then
      insert into public.warehouse_expenses
        (contract_id, expense_type, amount, currency, usd_try, eur_try, fx_date,
         expense_date, is_auto, notes)
      values
        (new.id, t, 0, coalesce(new.currency, 'USD'),
         new.usd_try, new.eur_try, new.fx_date,
         coalesce(new.eta, current_date), true,
         'Otomatik (' || new.incoterm || ' şablonu) — tutar girilmesi bekleniyor');
    end if;
  end loop;

  return new;
end $$;
revoke execute on function public.fn_pc_expense_template() from anon, authenticated, public;

drop trigger if exists trg_pc_expense_template on public.purchase_contracts;
create trigger trg_pc_expense_template
  after insert or update of incoterm on public.purchase_contracts
  for each row execute function public.fn_pc_expense_template();
