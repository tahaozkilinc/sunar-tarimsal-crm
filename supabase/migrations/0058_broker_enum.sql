-- Sunar Tarımsal CRM - "Broker" firma türü + kendi CRM aktivite kovası (yalnızca enum değerleri)
-- ----------------------------------------------------------------------------
-- Bu değerleri KULLANAN kod (kolon, RLS, CRM sekmesi) bir SONRAKİ migration'dadır
-- (0059). Aynı transaction içinde yeni eklenen bir enum değerini kullanmak
-- Postgres'te güvenli değildir ("unsafe use of new value of enum type" hatası);
-- bu proje zaten aynı ayrımı 'agent' için yapmıştı (bkz. 0031 -> 0032). Aynı desen.
--
-- crm_module'e de 'broker' eklenir: surveyor/port/carrier/agent gibi mevcut
-- 'purchasing' kovasına (Tedarikçiler sekmesi) KARIŞTIRILMADAN kendi izole
-- aktivite kovasına sahip olsun — 'operations' değerinin 0019'da neden ayrı
-- eklendiğiyle aynı gerekçe (zaten çalışan Tedarikçiler sekmesine dokunmadan).

alter type public.company_type add value if not exists 'broker';
alter type public.crm_module   add value if not exists 'broker';
