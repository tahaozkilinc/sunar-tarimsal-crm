-- Sunar Tarımsal CRM - Broker ikiye ayrılıyor: Hammadde Broker + Deniz Broker (yalnızca enum değeri)
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: mevcut "Broker" firma türü artık "Hammadde Broker" olarak
-- kalıyor (değer aynı: 'broker' — mevcut kayıtlar/bağlantılar hiç dokunulmadan
-- Hammadde Broker sayılır), yanına yeni bir "Deniz Broker" türü açılıyor.
-- Kullanımı (CRM sekmesi, RLS) bir SONRAKİ migration'da (0071) — aynı transaction
-- içinde yeni enum değeri kullanılamıyor (bkz. 0058'deki aynı gerekçe).

alter type public.company_type add value if not exists 'broker_sea';
