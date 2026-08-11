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
