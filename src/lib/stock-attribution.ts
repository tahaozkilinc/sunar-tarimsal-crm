// Depo bazında "giren stok hangi X'ten geldi" hesaplaması. X keyOf() ile
// verilir — aynı mantık hem "hangi gemiden" (contract_id) hem "milli mi
// yerli mi" (stock_status) kırılımı için kullanılır.
//
// inventory view'ındaki (0043) AYNI Giriş/Çıkış sınıflandırmasını kullanır:
//   Giriş : inbound / origin_in / adjustment
//   Çıkış : transfer / to_factory / outbound_sale
// Depoya girdikten sonra mal karışır — Çıkış hareketleri belirli bir X'e ait
// değildir (ör. satış sevkiyatı "hangi geminin malı" ayrımı yapmaz). Bu yüzden
// Çıkış toplamı, o depodaki X'lerin Giriş payına ORANTILI düşülür — kesin
// değil ama verinin izin verdiği en iyi tahmin (fire raporundaki ile aynı teknik).

export type AttributionMovement = {
  warehouse_id: string | null;
  movement_type: string;
  quantity: number | null;
};

const IN_TYPES = new Set(["inbound", "origin_in", "adjustment"]);
const OUT_TYPES = new Set(["transfer", "to_factory", "outbound_sale"]);

export const isInboundType = (t: string) => IN_TYPES.has(t);
export const isOutboundType = (t: string) => OUT_TYPES.has(t);

export const UNASSIGNED_KEY = "_unassigned_";

/** warehouse_id -> (keyOf değeri -> kalan tonaj). 0'a yakın/altı satırlar elenir. */
export function attributeByWarehouse<T extends AttributionMovement>(
  rows: T[],
  keyOf: (row: T) => string | null,
): Map<string, Map<string, number>> {
  const inByWh = new Map<string, Map<string, number>>();
  const outByWh = new Map<string, number>();

  rows.forEach((r) => {
    if (!r.warehouse_id) return;
    const q = Number(r.quantity) || 0;
    if (IN_TYPES.has(r.movement_type)) {
      const key = keyOf(r) || UNASSIGNED_KEY;
      const inner = inByWh.get(r.warehouse_id) || new Map<string, number>();
      inner.set(key, (inner.get(key) || 0) + q);
      inByWh.set(r.warehouse_id, inner);
    } else if (OUT_TYPES.has(r.movement_type)) {
      outByWh.set(r.warehouse_id, (outByWh.get(r.warehouse_id) || 0) + q);
    }
  });

  const result = new Map<string, Map<string, number>>();
  inByWh.forEach((inner, wh) => {
    const totalIn = Array.from(inner.values()).reduce((a, b) => a + b, 0);
    const totalOut = outByWh.get(wh) || 0;
    const outMap = new Map<string, number>();
    if (totalIn > 0) {
      inner.forEach((v, key) => {
        const remaining = v - totalOut * (v / totalIn);
        if (remaining > 0.01) outMap.set(key, remaining);
      });
    }
    result.set(wh, outMap);
  });
  return result;
}

// ----------------------------------------------------------------------------
// Depo bazlı Giriş / Çıkış GEÇMİŞİ — koşan (running) bakiye ile. Bir depoda
// birden fazla ürün olabileceğinden bakiye ÜRÜN BAZINDA tutulur (ör. buğday
// ve mısır bakiyeleri karışmaz). attributeByWarehouse'un aksine burada
// tahmini/orantılı bir dağıtım YOK — her satır kendi tarihiyle, doğrudan
// verideki gerçek hareket; yalnızca kronolojik sırayla biriktirilir.
// ----------------------------------------------------------------------------

export type LedgerMovement = {
  id: string;
  product_id: string | null;
  movement_type: string;
  quantity: number | null;
  movement_date: string;
  movement_time: string | null;
  created_at: string;
};

export type LedgerEntry<T> = T & {
  direction: "in" | "out" | "other";
  signedQuantity: number;
  runningBalance: number; // bu hareketten SONRA, bu ürün için depodaki bakiye
};

/** Eski -> yeni sıralar, ürün bazında koşan bakiye ekler. */
export function buildLedger<T extends LedgerMovement>(rows: T[]): LedgerEntry<T>[] {
  const sorted = [...rows].sort((a, b) => {
    const da = `${a.movement_date} ${a.movement_time || "00:00"}`;
    const db = `${b.movement_date} ${b.movement_time || "00:00"}`;
    if (da !== db) return da < db ? -1 : 1;
    return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
  });

  const balance = new Map<string, number>();
  return sorted.map((r) => {
    const q = Number(r.quantity) || 0;
    const key = r.product_id || UNASSIGNED_KEY;
    const direction: "in" | "out" | "other" = isInboundType(r.movement_type)
      ? "in"
      : isOutboundType(r.movement_type)
        ? "out"
        : "other";
    const signedQuantity = direction === "in" ? q : direction === "out" ? -q : 0;
    const runningBalance = (balance.get(key) || 0) + signedQuantity;
    balance.set(key, runningBalance);
    return { ...r, direction, signedQuantity, runningBalance };
  });
}
