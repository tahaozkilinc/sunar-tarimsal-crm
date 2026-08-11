-- Sunar Tarımsal CRM - Stok hareketlerine saat bilgisi
-- ----------------------------------------------------------------------------
-- movement_date yalnızca GÜN taşıyor (date tipi); "çıkan/giren aracın saati"
-- ayrı, opsiyonel bir time kolonunda tutulur. NOT NULL yapılmıyor: geçmiş
-- kayıtlarda saat yok ve bu bilgi bir iş kuralı değil, kayıt/denetim
-- kolaylığı — eksik olması hiçbir hesaplamayı bozmaz (tonaj/kalan/RLS bu
-- kolona bakmaz). Sadece ekleme (additive), veri taşıma gerekmiyor.

alter table public.stock_movements
  add column if not exists movement_time time;

comment on column public.stock_movements.movement_time is
  'Aracın fiilen hareket ettiği saat (opsiyonel). movement_date ile birlikte "ne zaman" sorusunu tamamlar; movement_date tek başına yalnızca gündür.';
