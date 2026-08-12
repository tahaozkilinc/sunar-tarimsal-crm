// Minimal, hedefli çeviri yardımcısı — genel bir i18n çerçevesi DEĞİL.
// Yalnızca yabancı uyruklu kullanıcıların (şu an: acente rolü) gördüğü
// ekranlarda, tek tek metin için kullanılır: L(isEn, "Türkçe", "English").
// Kasıtlı olarak basit: dil seçici yok, tüm sistemi çevirmiyor — yalnızca
// o rolün ekranında Türkçe metnin yerine İngilizcesini koyar.
export function L(isEnglish: boolean, tr: string, en: string): string {
  return isEnglish ? en : tr;
}
