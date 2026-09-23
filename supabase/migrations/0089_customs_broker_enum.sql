-- =============================================================================
-- Sunar Tarımsal CRM - CRM'e Gümrükçü (customs broker) firma türü
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: "CRM'in içerisinde gümrükçü kısmı ekleyebilir misin?
-- gümrükle alakalı olarak ilgili gümrükçülerin bilgilerini ekleyelim" —
-- gözetim/liman/nakliyeci/acente/Gemi Brokeri ile AYNI desende yeni bir
-- CRM firma türü. Şimdilik yalnızca firma kataloğu (iletişim bilgileri,
-- kişiler, aktiviteler) — purchase_contracts'ta ship-ops'tan atanan bir
-- kolonu (surveyor_id/port_id/carrier_id/agent_id/ship_broker_id gibi) YOK;
-- istenirse ayrı bir istek olarak sonradan eklenebilir.
--
-- enum değeri eklemek ayrı bir transaction'da olmalı (aynı transaction'da
-- kullanılamaz) — bu yüzden 0058/0069'daki gibi tek başına bir migration.
-- =============================================================================

alter type company_type add value if not exists 'customs_broker';
