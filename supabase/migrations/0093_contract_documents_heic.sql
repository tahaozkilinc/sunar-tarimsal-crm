-- =============================================================================
-- Sunar Tarımsal CRM - contract-documents kovasına HEIC/HEIF desteği
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: "akreditifite evrak eklerken hata veriyor" — en olası
-- neden, telefonla fotoğraflanan bir evrakın (ör. akreditif) iPhone'da
-- varsayılan olarak HEIC formatında kaydedilmesi ve contract-documents
-- kovasının izinli mime türleri arasında HEIC/HEIF bulunmaması (storage
-- API ham, İngilizce "mime type ... is not supported" hatası döndürüyordu —
-- db-errors.ts'te ayrıca Türkçeye çevrildi). contract-photos/movement-photos
-- kovaları zaten HEIC/HEIF destekliyor (muhtemelen aynı sorun için daha önce
-- eklenmiş) — contract-documents'a da aynısı ekleniyor.
-- =============================================================================

update storage.buckets
set allowed_mime_types = array_append(allowed_mime_types, 'image/heic')
where id = 'contract-documents' and not ('image/heic' = any(allowed_mime_types));

update storage.buckets
set allowed_mime_types = array_append(allowed_mime_types, 'image/heif')
where id = 'contract-documents' and not ('image/heif' = any(allowed_mime_types));
