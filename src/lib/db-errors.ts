// Supabase/PostgREST bazı hatalarda HAM Postgres sistem mesajı döner (ör.
// 'new row for relation "purchase_contracts" violates check constraint
// "ck_pc_laycan"') — kullanıcı için anlamsızdır. DB'deki trigger'lar zaten
// Türkçe, anlamlı mesajlarla raise exception yapıyor (bkz. fn_sm_guard vb.)
// — onlara DOKUNMUYORUZ, olduğu gibi geçiyor. Yalnızca HAM sistem mesajını
// tanıyıp kısıt ADINDAN (veya kod/desenden) anlamlı bir Türkçe cümleye
// çeviriyoruz. Yeni bir CHECK/UNIQUE kısıtı eklerken buraya da bir satır
// eklemek yeterli — DB'de özel bir mesaj yazmaya gerek yok.

type DbErrorLike = { message?: string | null; code?: string | null } | string | null | undefined;

// Kısıt adı -> anlamlı mesaj (bkz. ilgili migration için kısıt tanımı).
const CONSTRAINT_MESSAGES: Record<string, string> = {
  // purchase_contracts (0035, 0068)
  ck_pc_qty_pos: "Miktar sıfırdan büyük olmalı.",
  ck_pc_price: "Birim fiyat negatif olamaz.",
  ck_pc_laycan: "Laycan Bitiş tarihi, Laycan Başlangıç tarihinden önce olamaz.",
  ck_pc_fx: "USD/TRY veya EUR/TRY kuru geçersiz görünüyor (0 ile 1000 arasında olmalı).",
  uq_pc_contract_no: "Bu sözleşme numarası zaten kullanılıyor.",

  // sales_orders (0035, 0038, 0049)
  ck_so_qty_pos: "Miktar sıfırdan büyük olmalı.",
  ck_so_price: "Birim fiyat negatif olamaz.",
  ck_so_fx: "USD/TRY veya EUR/TRY kuru geçersiz görünüyor (0 ile 1000 arasında olmalı).",
  sales_orders_delivery_range_check: "Teslim penceresi bitiş tarihi, başlangıç tarihinden önce olamaz.",
  uq_so_order_no: "Bu satış numarası zaten kullanılıyor.",

  // stock_movements (0035)
  ck_sm_qty: "Miktar sıfır olamaz, tek harekette 100.000 tonu aşamaz ve (düzeltme hariç) negatif olamaz.",

  // warehouse_expenses (0035, 0038)
  ck_we_fx: "USD/TRY veya EUR/TRY kuru geçersiz görünüyor (0 ile 1000 arasında olmalı).",
  ck_we_target: "Depo veya bağlantıdan en az biri seçilmeli.",

  // warehouses (0044, 0053)
  ck_wh_lat: "Enlem -90 ile 90 arasında olmalı.",
  ck_wh_lng: "Boylam -180 ile 180 arasında olmalı.",
  ck_wh_latlng_pair: "Haritadan konum seçerken enlem ve boylamın ikisi de girilmeli.",
  warehouses_parent_not_self: "Bir depo kendi kendisinin ana deposu (antrepo) olamaz.",
};

// Ham bir Postgres sistem mesajının "tipik" kalıpları — yalnızca bunlara
// uyanları çeviriyoruz; trigger'lardaki Türkçe raise exception mesajları bu
// kalıplara uymadığından olduğu gibi geçer.
const RAW_PATTERNS = [
  /violates check constraint/i,
  /violates unique constraint/i,
  /violates foreign key constraint/i,
  /violates not-null constraint/i,
  /duplicate key value/i,
  /invalid input syntax/i,
  /value too long/i,
];

function extract(pattern: RegExp, message: string): string | null {
  const m = message.match(pattern);
  return m ? m[1] : null;
}

export function translateDbError(error: DbErrorLike): string {
  const message = (typeof error === "string" ? error : error?.message)?.trim();
  if (!message) return "Bilinmeyen bir hata oluştu.";

  const looksRaw = RAW_PATTERNS.some((p) => p.test(message));
  if (!looksRaw) return message; // zaten anlamlı (Türkçe) bir mesaj — dokunma

  const constraint = extract(/constraint "([^"]+)"/, message);
  if (constraint && CONSTRAINT_MESSAGES[constraint]) return CONSTRAINT_MESSAGES[constraint];

  if (/violates unique constraint/i.test(message) || /duplicate key value/i.test(message)) {
    return "Bu kayıt zaten mevcut — tekil olması gereken bir alan tekrarlanmış.";
  }
  if (/violates foreign key constraint/i.test(message)) {
    return "Bu kayıt başka bir kayıtla ilişkili olduğundan işlem tamamlanamadı (silmeye/değiştirmeye çalıştığınız kayıt başka yerlerde kullanılıyor olabilir).";
  }
  if (/violates not-null constraint/i.test(message)) {
    const col = extract(/column "([^"]+)"/, message);
    return col ? `"${col}" alanı boş bırakılamaz.` : "Zorunlu bir alan boş bırakılmış.";
  }
  if (/violates check constraint/i.test(message)) {
    return "Girilen değerlerden biri kurallara uymuyor. Lütfen bilgileri kontrol edin.";
  }
  if (/invalid input syntax/i.test(message)) {
    return "Girilen değerlerden biri beklenen formatta değil (ör. sayı yerine metin girilmiş olabilir).";
  }
  if (/value too long/i.test(message)) {
    return "Girilen metin izin verilenden uzun.";
  }

  return message; // tanınmayan ham mesaj — son çare olarak olduğu gibi göster
}
