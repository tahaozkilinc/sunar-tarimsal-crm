-- Sunar Tarımsal CRM - "Sembol" alanı kaldırıldı
-- ----------------------------------------------------------------------------
-- Kullanıcı isteği: companies.symbol boş yere duruyordu, kullanılmıyordu —
-- tamamen kaldırıldı. Kolonu düşürmek, üzerindeki CHECK kısıtını
-- (companies_symbol_length_check, 0056) ve kolon yorumunu da otomatik
-- kaldırır, ayrıca bir şey gerekmez.
--
-- Not: Bu değişiklik canlı veritabanında bu migration'dan BAĞIMSIZ bir
-- şekilde zaten uygulanmıştı (muhtemelen aynı anda çalışan başka bir oturum
-- tarafından, doğrudan canlıya) — idempotent olduğundan burada tekrar
-- çalıştırmak güvenli/no-op, yalnızca repo'daki migration geçmişini gerçek
-- şemayla senkron tutmak için ekleniyor.

alter table public.companies drop column if exists symbol;
