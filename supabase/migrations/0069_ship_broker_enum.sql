-- Sunar Tarımsal CRM - Broker ikiye ayrılıyor: Hammadde Brokeri / Gemi Brokeri
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: mevcut "Broker" tek bir kovaydı (satın alma tarafı,
-- purchase_contracts.broker_id). Aslında iki farklı rol var: sözleşmeyi
-- (hammadde alım-satımını) aracılık eden Hammadde Brokeri — bu ZATEN mevcut
-- 'broker' değeri, yalnızca etiketi netleştiriliyor — ve gemiyi/navlunu
-- ayarlayan Gemi Brokeri — YENİ 'ship_broker' değeri. Yeni sözleşme açılışında
-- seçilen broker Hammadde Brokeri olmaya devam eder; Gemi Brokeri, tıpkı
-- gözetim/liman/nakliyeci/acente gibi, gemi netleştikçe ship-ops sayfasından
-- ("Operasyon Tarafları") sonradan atanır (bkz. 0070).
--
-- enum değeri eklemek ayrı bir transaction'da olmalı (aynı transaction'da
-- kullanılamaz) — bu yüzden 0058'deki gibi tek başına bir migration.

alter type company_type add value if not exists 'ship_broker';
