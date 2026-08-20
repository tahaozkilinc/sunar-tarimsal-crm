// Minimal, hedefli çeviri yardımcısı — genel bir i18n çerçevesi DEĞİL.
// Kullanıcının Profilim sayfasından seçtiği dile (profiles.language, bkz.
// migration 0072) göre, tek tek metin için kullanılır: L(isEn, "Türkçe", "English").
// Kasıtlı olarak basit: tüm sistemi çevirmiyor — yalnızca bugüne kadar L()
// ile işaretlenmiş ekranlarda (kabuk/nav, panel, profil, yurtdışı yükleme)
// Türkçe metnin yerine İngilizcesini koyar. Diğer ekranlar (CRM, Bağlantı,
// Stok, Satış, Finans, Maliyet, Yönetim, resource-manager motoru) henüz
// yalnızca Türkçe — kapsamı genişletmek için ilgili ekrana L() eklenmeli.
export function L(isEnglish: boolean, tr: string, en: string): string {
  return isEnglish ? en : tr;
}
