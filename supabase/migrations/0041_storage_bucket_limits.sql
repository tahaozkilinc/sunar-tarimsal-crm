-- =============================================================================
-- Sunar Tarımsal CRM - Depolama kovalarına dosya türü + boyut sınırı
-- Sıra: 41 -> önceki migration'lardan SONRA çalıştırın. (Idempotent.)
--
-- BULGU: contracts / contract-photos / movement-photos / company-logos
-- kovalarının hiçbirinde allowed_mime_types / file_size_limit yoktu.
-- İstemci tarafı sıkıştırma (src/lib/image.ts) yalnızca bir KOLAYLIKTIR —
-- görsel olmayan veya hatalı dosyada ORİJİNALİ OLDUĞU GİBİ yükler; API'ye
-- doğrudan istek atan biri bu kod yoluna hiç uğramaz. Tek gerçek zorlama
-- noktası, Supabase Storage'ın kova düzeyindeki kısıtlarıdır.
-- =============================================================================

update storage.buckets set
  file_size_limit = 20971520, -- 20 MB
  allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp']
where id = 'contracts';

update storage.buckets set
  file_size_limit = 15728640, -- 15 MB (telefon fotoğrafı, HEIC dahil)
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif']
where id in ('contract-photos','movement-photos');

update storage.buckets set
  file_size_limit = 5242880, -- 5 MB
  allowed_mime_types = array['image/png','image/jpeg','image/webp','image/svg+xml']
where id = 'company-logos';
