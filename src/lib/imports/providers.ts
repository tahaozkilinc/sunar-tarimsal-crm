// =============================================================================
// Dış ticaret ithalat verisi sağlayıcıları (sunucu tarafı).
// Bu modül yalnızca API route handler'ından (sunucu) import edilir; hiçbir
// zaman istemci paketine girmemelidir (COMTRADE_API_KEY sunucuda kalır).
//
// Amaç: bir GTİP kodu + yıl için Türkiye'nin aylık ithalatını (ton) çekmek.
// Sonuç tuik_monthly_imports tablosuna yazılır ve /imports sayfasında bizim
// bağlantı tonajımızla karşılaştırılır.
//
// NEDEN COMTRADE: TÜİK'in dış ticaret ekranı (bi.tuik.gov.tr) Qlik tabanlı bir
// uygulamadır; verisi belgelenmiş bir REST API'den değil, oturum-bağımlı bir
// WebSocket (Qlik Engine JSON-RPC) protokolünden gelir. Bunu körlemesine yazmak
// kırılgan olur. Buna karşılık Türkiye, aynı gümrük verisini BM Comtrade'e resmî
// olarak raporlar; Comtrade'in kararlı ve belgelenmiş bir JSON API'si vardır.
// Bu yüzden otomatik çekmenin BİRİNCİL kaynağı Comtrade'dir. TÜİK sağlayıcısı
// ileride (ağ erişimi açılıp Qlik protokolü canlı incelendiğinde) doldurulmak
// üzere stub olarak bırakılmıştır.
//
// ÖNEMLİ (granülerlik): Comtrade, Armonize Sistem'i en fazla 6 hane (HS6)
// düzeyinde verir. Kullanıcının 12 haneli GTİP'i (ör. 100590000019) HS6'ya
// (100590) indirgenir; dönen değer o 6 haneli başlığın TAMAMIDIR — yani 12
// haneli alt kırılımın ÜST KÜMESİ. Birebir TÜİK rakamı için elle giriş kullanılır.
// Bu ayrım sonucun meta.granularity alanında ve DB'deki source kolonunda tutulur.
//
// OPSİYONEL ANAHTAR: COMTRADE_API_KEY tanımlıysa kimlikli uç nokta kullanılır
// (yüksek limit). Tanımlı değilse anahtarsız "preview" uç noktası denenir
// (tek raportör + tek ürün + 12 ay = 12 satır; preview limitleri içinde).
// =============================================================================

export type MonthlyTon = { month: number; ton: number };
export type ProviderId = "comtrade" | "tuik";

export type ProviderResult = {
  data: MonthlyTon[];
  meta: {
    provider: ProviderId;
    granularity: "hs6" | "hs12";
    hsQueried: string;
    note: string;
    fetchedFrom: string;
  };
};

const TURKEY_M49 = "792"; // BM M49 ülke kodu: Türkiye
const FETCH_TIMEOUT_MS = 20_000;

// GTİP'i HS6'ya indir (rakam-dışı karakterleri at, ilk 6 hane).
function toHs6(hsCode: string): string {
  const digits = hsCode.replace(/\D/g, "");
  if (digits.length < 6) throw new Error(`Geçersiz GTİP kodu: "${hsCode}"`);
  return digits.slice(0, 6);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickNumber(row: Record<string, any>, keys: string[]): number {
  for (const k of keys) {
    const v = Number(row[k]);
    if (Number.isFinite(v)) return v;
  }
  return NaN;
}

async function fetchComtrade(hsCode: string, year: number): Promise<ProviderResult> {
  const hs6 = toHs6(hsCode);
  const periods = Array.from({ length: 12 }, (_, i) => `${year}${String(i + 1).padStart(2, "0")}`).join(",");
  const key = process.env.COMTRADE_API_KEY;
  const base = key
    ? "https://comtradeapi.un.org/data/v1/get/C/M/HS"
    : "https://comtradeapi.un.org/public/v1/preview/C/M/HS";
  // partnerCode=0 -> "Dünya" (tüm ortaklar toplamı) => Türkiye'nin toplam ithalatı.
  // flowCode=M -> ithalat.
  const url =
    `${base}?reporterCode=${TURKEY_M49}&period=${periods}&cmdCode=${hs6}` +
    `&flowCode=M&partnerCode=0&partner2Code=0&customsCode=C00&motCode=0`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: ctrl.signal,
      headers: key ? { "Ocp-Apim-Subscription-Key": key } : {},
    });
    if (!res.ok) {
      const hint = res.status === 403 || res.status === 401
        ? " (yetki/limit — COMTRADE_API_KEY tanımlamayı deneyin)"
        : "";
      throw new Error(`Comtrade HTTP ${res.status}${hint}`);
    }
    json = await res.json();
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("Comtrade zaman aşımına uğradı.");
    throw e;
  } finally {
    clearTimeout(timer);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: Record<string, any>[] = Array.isArray(json?.data) ? json.data : [];
  const byMonth = new Map<number, number>();
  for (const r of rows) {
    const flow = String(r.flowCode ?? r.aggrLevel ?? "M").toUpperCase();
    if (flow && flow !== "M") continue;
    // Ayı refMonth'tan; yoksa period (YYYYMM) son iki haneden çöz.
    let month = Number(r.refMonth);
    if (!(month >= 1 && month <= 12)) {
      const period = String(r.period ?? r.refPeriodId ?? "");
      month = Number(period.slice(4, 6));
    }
    if (!(month >= 1 && month <= 12)) continue;
    // Miktar: net ağırlık (kg). Bazı alan adı varyasyonlarına karşı toleranslı.
    const kg = pickNumber(r, ["netWgt", "NetWeight", "netweight", "qty", "Qty"]);
    if (!Number.isFinite(kg) || kg <= 0) continue;
    byMonth.set(month, (byMonth.get(month) || 0) + kg / 1000);
  }

  const data = Array.from(byMonth.entries())
    .map(([month, ton]) => ({ month, ton: Math.round(ton * 1000) / 1000 }))
    .sort((a, b) => a.month - b.month);

  return {
    data,
    meta: {
      provider: "comtrade",
      granularity: "hs6",
      hsQueried: hs6,
      note:
        `Kaynak: BM Comtrade — Türkiye (792) ithalatı, GTİP ${hs6} (6 haneli). ` +
        `12 haneli ${hsCode} için üst kümedir; net ağırlık (kg) tona çevrildi.`,
      fetchedFrom: base,
    },
  };
}

// TÜİK doğrudan çekme — henüz hazır değil (Qlik protokolü canlı incelenmeli).
async function fetchTuik(): Promise<ProviderResult> {
  throw new Error(
    "TÜİK doğrudan çekme henüz etkin değil: bi.tuik.gov.tr Qlik tabanlı bir uygulamadır ve " +
      "verisi oturum-bağımlı WebSocket protokolünden gelir; güvenilir bir entegrasyon için canlı " +
      "inceleme gerekir. Şimdilik 'comtrade' sağlayıcısını kullanın veya değerleri elle girin.",
  );
}

export async function fetchMonthlyImports(
  provider: ProviderId,
  hsCode: string,
  year: number,
): Promise<ProviderResult> {
  switch (provider) {
    case "comtrade":
      return fetchComtrade(hsCode, year);
    case "tuik":
      return fetchTuik();
    default:
      throw new Error(`Bilinmeyen sağlayıcı: ${provider}`);
  }
}
