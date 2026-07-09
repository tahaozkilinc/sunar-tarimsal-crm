// Türkiye il merkezleri (yaklaşık) — depo/fabrika şehrini haritada konumlandırmak için.
// Anahtarlar Türkçe küçük harfe normalize edilmiş il adlarıdır. Koordinat [enlem, boylam].
// Depo 'city' alanı bu illerden biriyle eşleşirse haritada o noktaya işaretlenir.

export const TURKEY_CENTER: [number, number] = [39.0, 35.2];

export const CITY_COORDS: Record<string, [number, number]> = {
  adana: [37.0, 35.32],
  adiyaman: [37.76, 38.28],
  afyonkarahisar: [38.76, 30.54],
  agri: [39.72, 43.05],
  amasya: [40.65, 35.83],
  ankara: [39.93, 32.85],
  antalya: [36.9, 30.7],
  artvin: [41.18, 41.82],
  aydin: [37.85, 27.84],
  balikesir: [39.65, 27.88],
  bilecik: [40.15, 29.98],
  bingol: [38.88, 40.5],
  bitlis: [38.4, 42.11],
  bolu: [40.74, 31.61],
  burdur: [37.72, 30.29],
  bursa: [40.19, 29.06],
  canakkale: [40.15, 26.41],
  cankiri: [40.6, 33.62],
  corum: [40.55, 34.95],
  denizli: [37.78, 29.09],
  diyarbakir: [37.91, 40.24],
  edirne: [41.68, 26.56],
  elazig: [38.68, 39.22],
  erzincan: [39.75, 39.49],
  erzurum: [39.9, 41.27],
  eskisehir: [39.78, 30.52],
  gaziantep: [37.07, 37.38],
  giresun: [40.91, 38.39],
  gumushane: [40.46, 39.48],
  hakkari: [37.57, 43.74],
  hatay: [36.2, 36.16],
  isparta: [37.76, 30.55],
  mersin: [36.81, 34.64],
  istanbul: [41.01, 28.98],
  izmir: [38.42, 27.14],
  kars: [40.6, 43.1],
  kastamonu: [41.39, 33.78],
  kayseri: [38.73, 35.49],
  kirklareli: [41.74, 27.22],
  kirsehir: [39.15, 34.16],
  kocaeli: [40.77, 29.92],
  konya: [37.87, 32.48],
  kutahya: [39.42, 29.98],
  malatya: [38.36, 38.31],
  manisa: [38.61, 27.43],
  kahramanmaras: [37.58, 36.93],
  mardin: [37.31, 40.74],
  mugla: [37.22, 28.36],
  mus: [38.74, 41.49],
  nevsehir: [38.62, 34.71],
  nigde: [37.97, 34.68],
  ordu: [40.98, 37.88],
  rize: [41.02, 40.52],
  sakarya: [40.77, 30.4],
  samsun: [41.29, 36.33],
  siirt: [37.93, 41.94],
  sinop: [42.03, 35.15],
  sivas: [39.75, 37.02],
  tekirdag: [40.98, 27.51],
  tokat: [40.31, 36.55],
  trabzon: [41.0, 39.72],
  tunceli: [39.11, 39.55],
  sanliurfa: [37.17, 38.79],
  usak: [38.68, 29.41],
  van: [38.49, 43.41],
  yozgat: [39.82, 34.81],
  zonguldak: [41.46, 31.79],
  aksaray: [38.37, 34.03],
  bayburt: [40.26, 40.22],
  karaman: [37.18, 33.22],
  kirikkale: [39.85, 33.52],
  batman: [37.88, 41.13],
  sirnak: [37.52, 42.46],
  bartin: [41.64, 32.34],
  ardahan: [41.11, 42.7],
  igdir: [39.92, 44.04],
  yalova: [40.65, 29.28],
  karabuk: [41.2, 32.63],
  kilis: [36.72, 37.12],
  osmaniye: [37.07, 36.25],
  duzce: [40.84, 31.16],
};

// Yaygın eski/alternatif adlar -> il anahtarı.
const ALIASES: Record<string, string> = {
  icel: "mersin",
  antakya: "hatay",
  izmit: "kocaeli",
  adapazari: "sakarya",
  maras: "kahramanmaras",
  urfa: "sanliurfa",
  afyon: "afyonkarahisar",
  gebze: "kocaeli",
  aliaga: "izmir",
  bandirma: "balikesir",
  iskenderun: "hatay",
  ceyhan: "adana",
  derince: "kocaeli",
  ambarli: "istanbul",
};

// Türkçe karakterleri sadeleştirip küçük harfe indir (ş->s, ı->i, İ->i, ç->c, vb.).
function normalize(s: string): string {
  return s
    .trim()
    .toLocaleLowerCase("tr")
    .replaceAll("ı", "i")
    .replaceAll("İ".toLocaleLowerCase("tr"), "i")
    .replaceAll("ş", "s")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replaceAll("â", "a")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Depo şehri metnini koordinata çevir. Doğrudan, alias ve içerik (substring)
// eşleşmesini sırayla dener; bulamazsa null döner (harita dışı listede gösterilir).
export function geocodeCity(city: string | null | undefined): [number, number] | null {
  if (!city) return null;
  const n = normalize(city);
  if (!n) return null;
  if (CITY_COORDS[n]) return CITY_COORDS[n];
  if (ALIASES[n]) return CITY_COORDS[ALIASES[n]] ?? null;
  // "izmir aliaga" gibi çok kelimeli girdilerde bilinen bir ad geçiyor mu?
  const words = n.split(" ");
  for (const w of words) {
    if (CITY_COORDS[w]) return CITY_COORDS[w];
    if (ALIASES[w]) return CITY_COORDS[ALIASES[w]] ?? null;
  }
  // Tüm metni bir il/alias içeriyor mu (bitişik yazımlar için)?
  for (const key of Object.keys(CITY_COORDS)) {
    if (n.includes(key)) return CITY_COORDS[key];
  }
  for (const [alias, key] of Object.entries(ALIASES)) {
    if (n.includes(alias)) return CITY_COORDS[key] ?? null;
  }
  return null;
}
