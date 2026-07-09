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
// TÜİK yeni veri portalı (veriportali.tuik.gov.tr) SDMX REST API'sinden çeker.
// Yapılandırma env ile yapılır (endpoint TÜİK'e özgü olduğundan koda gömülmez):
//   TUIK_API_KEY         : abonelik anahtarı (portaldan)
//   TUIK_SDMX_TEMPLATE   : tam sorgu URL şablonu; {hs} {start} {end} {year} yer
//                          tutucularını içerir. Portalın "API / SDMX / Paylaş"
//                          çıktısındaki URL'de somut GTİP/tarihleri bu yer
//                          tutucularla değiştirerek elde edilir. Örn:
//     https://veriportali.tuik.gov.tr/rest/data/TR1,DF_DIS_TICARET,1.0/{hs}.M.M....?startPeriod={start}&endPeriod={end}
//   TUIK_API_KEY_HEADER  : anahtar başlığı adı (varsayılan Ocp-Apim-Subscription-Key)
//   TUIK_QTY_DIVISOR     : miktar birimi düzeltmesi (kg dönerse 1000; varsayılan 1)
//
// Yanıt SDMX-JSON (2.x) beklenir; observation/series ve zaman boyutundan aylık
// miktar türetilir. Gerçek yanıt görüldüğünde ölçü/birim seçimi netleştirilebilir.
async function fetchTuik(hsCode: string, year: number): Promise<ProviderResult> {
  const key = process.env.TUIK_API_KEY;
  const template = process.env.TUIK_SDMX_TEMPLATE;
  const keyHeader = process.env.TUIK_API_KEY_HEADER || "Ocp-Apim-Subscription-Key";
  const divisor = Number(process.env.TUIK_QTY_DIVISOR || "1") || 1;
  if (!key || !template) {
    throw new Error(
      "TÜİK SDMX yapılandırılmadı. Vercel ortam değişkenlerine TUIK_API_KEY ve " +
        "TUIK_SDMX_TEMPLATE (sorgu URL şablonu, {hs}/{start}/{end} yer tutuculu) ekleyin.",
    );
  }
  const start = `${year}-01`;
  const end = `${year}-12`;
  const url = template
    .replaceAll("{hs}", encodeURIComponent(hsCode))
    .replaceAll("{start}", start)
    .replaceAll("{end}", end)
    .replaceAll("{year}", String(year));

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: ctrl.signal,
      headers: {
        [keyHeader]: key,
        Accept: "application/vnd.sdmx.data+json, application/json",
      },
    });
    if (!res.ok) throw new Error(`TÜİK SDMX HTTP ${res.status}`);
    json = await res.json();
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("TÜİK SDMX zaman aşımına uğradı.");
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const byMonth = parseSdmxMonthly(json, year);
  const data = Array.from(byMonth.entries())
    .map(([month, val]) => ({ month, ton: Math.round((val / divisor) * 1000) / 1000 }))
    .sort((a, b) => a.month - b.month);

  return {
    data,
    meta: {
      provider: "tuik",
      granularity: "hs12",
      hsQueried: hsCode,
      note: `Kaynak: TÜİK SDMX (veriportali.tuik.gov.tr), GTİP ${hsCode} (12 haneli — birebir).`,
      fetchedFrom: "tuik-sdmx",
    },
  };
}

// SDMX-JSON (2.x) yanıtından zaman boyutunu bulup ay -> değer toplar.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseSdmxMonthly(json: any, year: number): Map<number, number> {
  const byMonth = new Map<number, number>();
  const ds = json?.data?.dataSets?.[0] ?? json?.dataSets?.[0];
  const struct = json?.data?.structures?.[0] ?? json?.data?.structure ?? json?.structure;
  if (!ds || !struct) return byMonth;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obsDims: any[] = struct?.dimensions?.observation ?? struct?.dimensions?.series ?? [];
  const timeIdx = Math.max(
    0,
    obsDims.findIndex((d) => /TIME|PERIOD|DONEM|DÖNEM|AY|MONTH/i.test(d?.id || "")),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const periods: string[] = (obsDims[timeIdx]?.values ?? []).map((v: any) => v?.id ?? v?.name ?? "");

  const monthOf = (periodId: string): number | null => {
    const m = /(\d{4})[-_]?[MmAa]?(\d{1,2})/.exec(String(periodId));
    if (!m || Number(m[1]) !== year) return null;
    const mm = Number(m[2]);
    return mm >= 1 && mm <= 12 ? mm : null;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addObs = (obsKey: string, val: any) => {
    const idxs = obsKey.split(":").map(Number);
    const periodId = periods[idxs[timeIdx] ?? idxs[0]] ?? periods[0];
    const month = monthOf(periodId);
    if (month === null) return;
    const num = Array.isArray(val) ? Number(val[0]) : Number(val);
    if (Number.isFinite(num)) byMonth.set(month, (byMonth.get(month) || 0) + num);
  };

  if (ds.observations && typeof ds.observations === "object") {
    for (const [k, v] of Object.entries(ds.observations)) addObs(k, v);
  } else if (ds.series && typeof ds.series === "object") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of Object.values(ds.series) as any[]) {
      for (const [k, v] of Object.entries(s?.observations ?? {})) addObs(k, v);
    }
  }
  return byMonth;
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
      return fetchTuik(hsCode, year);
    default:
      throw new Error(`Bilinmeyen sağlayıcı: ${provider}`);
  }
}
