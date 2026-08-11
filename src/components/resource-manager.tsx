"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import "leaflet/dist/leaflet.css";
import { createClient } from "@/lib/supabase/client";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  SearchableSelect,
  Select,
  Spinner,
  Textarea,
} from "./ui";
import { formatDate, formatNumber } from "@/lib/format";
import { exportToExcel } from "@/lib/export";
import type { FieldDef, ResourceConfig, SelectOption } from "@/lib/resources";
import type { Role } from "@/lib/types";
import { Download, Eye, Filter, MapPin, Paperclip, Pencil, Plus, Trash2, X } from "lucide-react";

type Row = Record<string, unknown>;

// Formda ardışık alanları satırlara gruplar: inlineAfter=true olan bir alan,
// kendinden önceki alanla AYNI satırda (dar sütun) gösterilir — ör. "Miktar"
// yanında "Birim". Sırası config.fields dizisindeki sırayla birebir aynıdır.
function groupFieldRows(fields: FieldDef[]): FieldDef[][] {
  const rows: FieldDef[][] = [];
  fields.forEach((f) => {
    if (f.inlineAfter && rows.length > 0) rows[rows.length - 1].push(f);
    else rows.push([f]);
  });
  return rows;
}

// Sabit seçeneklerle bir "select"; listede olmayan bir değer (ya da kullanıcı
// "Diğer"i seçtiğinde) serbest metin kutusu açılır. Kayıt DB'de düz metin
// olarak tutulur — mevcut/eski veriler otomatik "Diğer" moduna düşer, veri
// kaybı olmaz. Bileşen kaydı değiştiğinde (Field key'i ile) yeniden kurulur;
// bu yüzden iç "otherMode" durumu yalnızca ilk değere göre kurulur.
function SelectOtherInput({
  value,
  options,
  onChange,
  disabled,
  uppercase,
}: {
  value: unknown;
  options: SelectOption[];
  onChange: (v: string) => void;
  disabled?: boolean;
  uppercase?: boolean;
}) {
  const strVal = (value as string) || "";
  const isKnown = options.some((o) => o.value === strVal);
  const [otherMode, setOtherMode] = useState(() => strVal !== "" && !isKnown);

  return (
    <div className="space-y-1.5">
      <Select
        value={otherMode ? "__other__" : strVal}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__other__") {
            setOtherMode(true);
            onChange("");
          } else {
            setOtherMode(false);
            onChange(v);
          }
        }}
        disabled={disabled}
      >
        <option value="">Seçiniz...</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        <option value="__other__">Diğer</option>
      </Select>
      {otherMode && (
        <Input
          type="text"
          value={strVal}
          onChange={(e) => onChange(uppercase ? e.target.value.toLocaleUpperCase("tr") : e.target.value)}
          placeholder="Yazın..."
          disabled={disabled}
        />
      )}
    </div>
  );
}

// Ham sayıyı Türkçe binlik ayraçlı görünüme çevirir (12340 -> "12.340").
function numberToInput(value: unknown): string {
  if (value === "" || value === null || value === undefined) return "";
  const n = Number(value);
  if (Number.isNaN(n)) return "";
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 20 });
}

// Türkçe binlik ayraçlı sayı girişi (ör. 12.340 / 1.000,5).
// Görünümde gruplar; dışarıya ham sayı (number) ya da "" verir.
function NumberInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: unknown;
  onChange: (v: number | "") => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const norm = (v: unknown): number | "" =>
    v === "" || v === null || v === undefined || Number.isNaN(Number(v))
      ? ""
      : Number(v);

  const [text, setText] = useState<string>(() => numberToInput(value));
  const lastRef = useRef<number | "">(norm(value));

  useEffect(() => {
    const incoming = norm(value);
    if (incoming !== lastRef.current) {
      lastRef.current = incoming;
      setText(numberToInput(value));
    }
  }, [value]);

  const handle = (raw: string) => {
    const negative = raw.trim().startsWith("-");
    const cleaned = raw.replace(/[^\d.,]/g, "");
    const [intRaw = "", ...rest] = cleaned.split(",");
    const intPart = intRaw.replace(/\./g, "");
    const hasDecimal = rest.length > 0;
    const decPart = rest.join("").replace(/\./g, "");
    const groupedInt = intPart === "" ? "" : Number(intPart).toLocaleString("tr-TR");
    const sign = negative ? "-" : "";

    const display =
      intPart === "" && !hasDecimal
        ? sign
        : `${sign}${hasDecimal ? `${groupedInt || "0"},${decPart}` : groupedInt}`;
    setText(display);

    let out: number | "" = "";
    if (intPart !== "" || decPart !== "") {
      const n = Number(`${sign}${intPart || "0"}.${decPart || "0"}`);
      out = Number.isNaN(n) ? "" : n;
    }
    lastRef.current = out;
    onChange(out);
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => handle(e.target.value)}
    />
  );
}

// Depodaki dosyayı imzalı (geçici) URL ile açan bağlantı.
function StorageFileLink({ bucket, path }: { bucket: string; path: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(false);
  const name = path.split("/").pop() || "Dosya";
  const open = async () => {
    setLoading(true);
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    setLoading(false);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  };
  return (
    <button
      type="button"
      onClick={open}
      className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
    >
      <Paperclip className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{loading ? "Açılıyor..." : name}</span>
    </button>
  );
}

// Dosya yükleme alanı: seçilen dosyayı Storage'a yükler, alan değerine yolu yazar.
function FileInput({
  value,
  onChange,
  bucket,
  disabled,
}: {
  value: unknown;
  onChange: (v: string) => void;
  bucket: string;
  disabled?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const path = (value as string) || "";

  const pick = async (file: File) => {
    setUploading(true);
    setErr(null);
    const safe = file.name.replace(/[^\w.\-]+/g, "_");
    const key = `${crypto.randomUUID()}-${safe}`;
    const { error } = await supabase.storage.from(bucket).upload(key, file, { upsert: false });
    setUploading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    onChange(key);
  };

  if (path)
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
        <StorageFileLink bucket={bucket} path={path} />
        {!disabled && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
            title="Dosyayı kaldır"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    );

  return (
    <div className="space-y-1">
      <input
        type="file"
        accept="application/pdf,image/*"
        disabled={disabled || uploading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pick(f);
        }}
        className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand"
      />
      {uploading && <div className="text-xs text-gray-500">Yükleniyor...</div>}
      {err && <div className="text-xs text-red-600">{err}</div>}
    </div>
  );
}

// Haritadan tıklayarak TAM konum (enlem/boylam) seçme widget'ı. Telefon
// kullanan sahadaki kişi "Konumumu Kullan" ile GPS'ten tam noktayı alabilir;
// masa başından çalışan kişi haritaya tıklayabilir ya da koordinatı elle
// (ör. Google Haritalar'dan kopyalanmış) girebilir. Üçü de aynı iki alanı
// (lat/lng) doldurur — hangisi kullanılırsa kullanılsın sonuç aynı hassasiyette.
function MapPointInput({
  lat,
  lng,
  onChangeLat,
  onChangeLng,
  disabled,
}: {
  lat: unknown;
  lng: unknown;
  onChangeLat: (v: number | null) => void;
  onChangeLng: (v: number | null) => void;
  disabled?: boolean;
}) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null);
  const [locating, setLocating] = useState(false);
  const [locErr, setLocErr] = useState<string | null>(null);

  const latNum = lat === "" || lat === null || lat === undefined ? null : Number(lat);
  const lngNum = lng === "" || lng === null || lng === undefined ? null : Number(lng);

  const place = useCallback((la: number, ln: number) => {
    onChangeLat(Math.round(la * 1e6) / 1e6);
    onChangeLng(Math.round(ln * 1e6) / 1e6);
  }, [onChangeLat, onChangeLng]);

  // Harita: bir kez kurulur; tıklama her zaman güncel place()'i çağırır (ref).
  const placeRef = useRef(place);
  useEffect(() => {
    placeRef.current = place;
  }, [place]);

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapDivRef.current) return;
      const start: [number, number] =
        latNum !== null && lngNum !== null ? [latNum, lngNum] : [39.0, 35.2];
      const map = L.map(mapDivRef.current, { scrollWheelZoom: true }).setView(start, latNum !== null ? 11 : 6);
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 18,
      }).addTo(map);
      if (latNum !== null && lngNum !== null) {
        markerRef.current = L.marker([latNum, lngNum]).addTo(map);
      }
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        if (disabled) return;
        placeRef.current(e.latlng.lat, e.latlng.lng);
      });
      setTimeout(() => map.invalidateSize(), 150);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
    // Harita yalnızca bir kez kurulur (yeniden kurulumu tıklama sırasında
    // titremeyi önler); işaretçi güncellemesi ayrı efektte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // lat/lng değişince (tıklama, GPS veya elle giriş) işaretçiyi taşı/oluştur.
  useEffect(() => {
    (async () => {
      if (!mapRef.current) return;
      const L = (await import("leaflet")).default;
      if (latNum === null || lngNum === null) {
        if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
        return;
      }
      if (markerRef.current) markerRef.current.setLatLng([latNum, lngNum]);
      else markerRef.current = L.marker([latNum, lngNum]).addTo(mapRef.current);
      mapRef.current.setView([latNum, lngNum], Math.max(mapRef.current.getZoom(), 11));
    })();
  }, [latNum, lngNum]);

  const useMyLocation = () => {
    if (!navigator.geolocation) { setLocErr("Bu cihazda konum desteklenmiyor."); return; }
    setLocating(true);
    setLocErr(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        place(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
      },
      (err) => {
        setLocErr(
          err.code === err.PERMISSION_DENIED
            ? "Konum izni verilmedi. Tarayıcı ayarlarından izin verin ya da haritaya tıklayın."
            : "Konum alınamadı. Haritaya tıklayarak da işaretleyebilirsiniz.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-border" style={{ height: 220 }}>
        <div ref={mapDivRef} className="h-full w-full" />
      </div>
      {!disabled && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            <MapPin className="h-3.5 w-3.5" />
            {locating ? "Konum alınıyor..." : "Konumumu Kullan"}
          </button>
          {latNum !== null && (
            <button
              type="button"
              onClick={() => { onChangeLat(null); onChangeLng(null); }}
              className="text-xs text-gray-400 hover:text-red-600"
            >
              Temizle
            </button>
          )}
          <span className="text-xs text-gray-400">veya haritaya tıklayın</span>
        </div>
      )}
      {locErr && <div className="text-xs text-amber-600">{locErr}</div>}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-0.5 block text-[11px] text-gray-500">Enlem</label>
          <Input
            type="text"
            inputMode="decimal"
            value={latNum ?? ""}
            onChange={(e) => {
              const n = e.target.value.trim();
              onChangeLat(n === "" ? null : Number(n.replace(",", ".")));
            }}
            placeholder="40.9876"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] text-gray-500">Boylam</label>
          <Input
            type="text"
            inputMode="decimal"
            value={lngNum ?? ""}
            onChange={(e) => {
              const n = e.target.value.trim();
              onChangeLng(n === "" ? null : Number(n.replace(",", ".")));
            }}
            placeholder="29.1234"
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}

export function ResourceManager({
  config,
  role,
  filter,
  defaultValues,
  title,
  detailExtra,
  hideTitle,
  hideFilters,
  rowHref,
}: {
  config: ResourceConfig;
  role: Role;
  filter?: Record<string, string | number | boolean | string[]>;
  defaultValues?: Record<string, unknown>;
  title?: string;
  detailExtra?: (row: Row) => React.ReactNode;
  hideTitle?: boolean;
  hideFilters?: boolean;
  rowHref?: (row: Row) => string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [refData, setRefData] = useState<Record<string, Row[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Row>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  // Filtre paneli: alan tipine göre otomatik 3 grup. filters: reference/
  // select/boolean (kesin eşleşme). textFilters: geri kalan metin benzeri
  // alanlar (alt dize arama). rangeFilters: date/number/money (min–maks /
  // başlangıç–bitiş). Panel varsayılan KAPALI — istenince "Filtrele" ile açılır.
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [textFilters, setTextFilters] = useState<Record<string, string>>({});
  const [rangeFilters, setRangeFilters] = useState<Record<string, { from: string; to: string }>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Kota bilgisi (ör. satışta seçili geminin toplam / satılan / kalan tonajı)
  const [quotaInfo, setQuotaInfo] = useState<{
    capacity: number;
    used: number;
    remaining: number;
  } | null>(null);

  const canWrite = config.writeRoles.includes(role);
  const filterKey = JSON.stringify({ ...(config.filter || {}), ...(filter || {}) });
  const defaults = useMemo(
    () => ({ ...(config.defaultValues || {}), ...(defaultValues || {}) }),
    [config.defaultValues, defaultValues],
  );

  const fieldByName = useMemo(() => {
    const map: Record<string, FieldDef> = {};
    config.fields.forEach((f) => (map[f.name] = f));
    return map;
  }, [config.fields]);

  // Referans (foreign key) seçeneklerini yükle
  const loadRefs = useCallback(async () => {
    const refFields = config.fields.filter((f) => f.type === "reference" && f.ref);
    const tables = Array.from(new Set(refFields.map((f) => f.ref!.table)));
    const result: Record<string, Row[]> = {};
    await Promise.all(
      tables.map(async (table) => {
        const cols = new Set<string>(["id"]);
        refFields
          .filter((f) => f.ref!.table === table)
          .forEach((f) => {
            cols.add(f.ref!.labelField);
            (f.ref!.labelFields || []).forEach((c) => cols.add(c));
            if (f.autofill) Object.values(f.autofill).forEach((src) => cols.add(src));
            if (f.ref!.filter) Object.keys(f.ref!.filter).forEach((c) => cols.add(c));
          });
        const { data } = await supabase
          .from(table)
          .select(Array.from(cols).join(","))
          .limit(2000);
        result[table] = (data as unknown as Row[]) || [];
      }),
    );
    setRefData(result);
  }, [config.fields, supabase]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    let query = supabase.from(config.table).select("*");
    const f = JSON.parse(filterKey) as Record<
      string,
      string | number | boolean | string[]
    >;
    for (const [k, v] of Object.entries(f))
      query = Array.isArray(v) ? query.in(k, v) : query.eq(k, v);
    if (config.orderBy)
      query = query.order(config.orderBy.column, {
        ascending: config.orderBy.ascending ?? false,
      });
    const { data, error } = await query;
    if (error) setError(error.message);
    setRows((data as Row[]) || []);
    setLoading(false);
  }, [supabase, config.table, config.orderBy, filterKey]);

  useEffect(() => {
    loadRefs();
  }, [loadRefs]);
  useEffect(() => {
    loadRows();
  }, [loadRows]);

  // Yeni kayıt açılırken o günün TCMB kurunu otomatik doldur (USD bazlı raporlama).
  useEffect(() => {
    if (!modalOpen || editing || !config.fxCapture) return;
    let on = true;
    (async () => {
      try {
        const res = await fetch("/api/fx");
        if (!res.ok) return;
        const j = await res.json();
        if (!on) return;
        setForm((prev) => ({
          ...prev,
          usd_try: prev.usd_try ?? j.usd_try,
          eur_try: prev.eur_try ?? j.eur_try,
          fx_date: prev.fx_date ?? j.date,
        }));
      } catch {
        /* TCMB erişilemezse sessizce geç; kullanıcı elle girebilir */
      }
    })();
    return () => {
      on = false;
    };
  }, [modalOpen, editing, config.fxCapture]);

  // Kota alanı (ör. satışta "Kaynak Bağlantı") değişince seçili kaynağın
  // toplam / kullanılan / kalan miktarını getir; formda gösterilir ve fazla
  // girişi canlı uyarır (kesin engel save() içindeki kota kontrolündedir).
  const quotaRefId = config.quota ? form[config.quota.field] : undefined;
  useEffect(() => {
    const q = config.quota;
    if (!modalOpen || !q || !quotaRefId) {
      setQuotaInfo(null);
      return;
    }
    let on = true;
    (async () => {
      const { data: capRow } = await supabase
        .from(q.capacityTable)
        .select(q.capacityField)
        .eq("id", quotaRefId)
        .maybeSingle();
      const capacity = Number((capRow as Row | null)?.[q.capacityField]) || 0;
      const statusCol = q.statusField ?? "status";
      let usedQ = supabase
        .from(config.table)
        .select(`${q.amountField},${statusCol}`)
        .eq(q.field, quotaRefId);
      if (editing?.id) usedQ = usedQ.neq("id", editing.id);
      const { data: usedRows } = await usedQ;
      const used = ((usedRows as Row[] | null) ?? []).reduce((sum, r) => {
        if (q.excludeStatus?.includes(String(r[statusCol] ?? ""))) return sum;
        return sum + (Number(r[q.amountField]) || 0);
      }, 0);
      if (!on) return;
      setQuotaInfo({ capacity, used, remaining: Math.max(capacity - used, 0) });
    })();
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, quotaRefId, editing?.id]);

  // --- yardımcılar ---
  // Referans satırından etiketi seçer: labelFields sırayla denenir (ilk dolu olan),
  // hiçbiri yoksa labelField, o da boşsa kısa id (#xxxx) gösterilir.
  const pickRefLabel = (
    ref: NonNullable<FieldDef["ref"]>,
    row: Row | undefined,
    id: unknown,
  ) => {
    const candidates = ref.labelFields?.length ? ref.labelFields : [ref.labelField];
    for (const col of candidates) {
      const v = row?.[col];
      if (v !== null && v !== undefined && String(v).trim() !== "") return String(v);
    }
    return `#${String(id).slice(0, 8)}`;
  };

  const refLabel = (field: FieldDef, value: unknown) => {
    if (!value || !field.ref) return "-";
    const row = (refData[field.ref.table] || []).find((r) => r.id === value);
    return pickRefLabel(field.ref, row, value);
  };

  const renderCell = (field: FieldDef, row: Row) => {
    const value = row[field.name];
    if (value === null || value === undefined || value === "") return <span className="text-gray-400">-</span>;
    switch (field.type) {
      case "reference":
        return refLabel(field, value);
      case "select": {
        const opt = field.options?.find((o) => o.value === value);
        if (opt?.color) return <Badge color={opt.color}>{opt.label}</Badge>;
        return opt?.label || String(value);
      }
      case "boolean":
        return value ? <Badge color="green">Evet</Badge> : <Badge color="gray">Hayır</Badge>;
      case "date":
        return formatDate(value as string);
      case "time":
        return String(value).slice(0, 5);
      case "number":
      case "money":
        return formatNumber(value as number);
      case "file":
        return <StorageFileLink bucket={field.bucket || "contracts"} path={value as string} />;
      case "map": {
        const lng = row[field.pairField!];
        if (lng === null || lng === undefined || lng === "") return <span className="text-gray-400">-</span>;
        return (
          <a
            href={`https://www.google.com/maps?q=${value},${lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
            title="Google Haritalar'da aç"
          >
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {Number(value).toFixed(4)}, {Number(lng).toFixed(4)}
          </a>
        );
      }
      default:
        return String(value);
    }
  };

  // renderCell'in düz-metin karşılığı: Excel dışa aktarımı için (JSX/Badge
  // değil, ham hücre metni). Aynı alan tipi kurallarını izler.
  const cellText = (field: FieldDef, row: Row): string | number => {
    const value = row[field.name];
    if (value === null || value === undefined || value === "") return "";
    switch (field.type) {
      case "reference":
        return refLabel(field, value);
      case "select":
      case "select_other":
        return field.options?.find((o) => o.value === value)?.label || String(value);
      case "boolean":
        return value ? "Evet" : "Hayır";
      case "date":
        return formatDate(value as string);
      case "time":
        return String(value).slice(0, 5);
      case "number":
      case "money":
        return Number(value);
      case "file":
        return String(value).split("/").pop() || "";
      case "map": {
        const lng = row[field.pairField!];
        return lng !== null && lng !== undefined && lng !== "" ? `${value}, ${lng}` : String(value);
      }
      default:
        return String(value);
    }
  };

  // --- filtre (istemci tarafı, anlık) ---
  const filtered = useMemo(() => {
    const activeExact = Object.entries(filters).filter(([, v]) => v !== "");
    const activeText = Object.entries(textFilters).filter(([, v]) => v.trim() !== "");
    const activeRange = Object.entries(rangeFilters).filter(([, r]) => r.from !== "" || r.to !== "");
    if (activeExact.length === 0 && activeText.length === 0 && activeRange.length === 0) return rows;
    // Alanın metinsel karşılığı (referans/seçim etikete çevrilir) — yalnızca alt dize filtresinde kullanılır.
    const textOf = (f: FieldDef, r: Row): string => {
      const v = r[f.name];
      if (v === null || v === undefined || v === "") return "";
      if (f.type === "reference" && f.ref) {
        const rr = (refData[f.ref.table] || []).find((x) => x.id === v);
        const cands = f.ref.labelFields?.length ? f.ref.labelFields : [f.ref.labelField];
        return cands.map((c) => String(rr?.[c] ?? "")).join(" ");
      }
      if (f.type === "select" || f.type === "select_other")
        return f.options?.find((o) => o.value === v)?.label || String(v);
      return String(v);
    };
    return rows.filter((r) => {
      for (const [k, v] of activeExact) {
        if (String(r[k] ?? "") !== v) return false;
      }
      for (const [k, v] of activeText) {
        const f = fieldByName[k];
        if (!f) continue;
        const hay = textOf(f, r).toLocaleLowerCase("tr");
        if (!hay.includes(v.trim().toLocaleLowerCase("tr"))) return false;
      }
      for (const [k, range] of activeRange) {
        const f = fieldByName[k];
        const raw = r[k];
        if (f?.type === "date") {
          const val = raw ? String(raw).slice(0, 10) : "";
          if (!val) return false;
          if (range.from && val < range.from) return false;
          if (range.to && val > range.to) return false;
        } else {
          const n = raw === null || raw === undefined || raw === "" ? null : Number(raw);
          if (n === null) return false;
          if (range.from !== "" && n < Number(range.from)) return false;
          if (range.to !== "" && n > Number(range.to)) return false;
        }
      }
      return true;
    });
  }, [rows, filters, textFilters, rangeFilters, fieldByName, refData]);

  const exportRows = () => {
    const headers = config.fields.map((f) => f.label);
    const body = filtered.map((row) => config.fields.map((f) => cellText(f, row)));
    exportToExcel(config.title, headers, body);
  };

  // --- form ---
  const openNew = () => {
    const initial: Row = { ...defaults };
    config.fields.forEach((f) => {
      if (initial[f.name] !== undefined) return;
      if (f.type === "select" && f.required && f.options?.length) initial[f.name] = f.options[0].value;
      else if (f.type === "boolean") initial[f.name] = true;
      else if (f.name === "movement_date" || (f.type === "date" && f.required))
        initial[f.name] = new Date().toISOString().slice(0, 10);
      else if (f.type === "time") initial[f.name] = new Date().toTimeString().slice(0, 5);
    });
    setEditing(null);
    setForm(initial);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (row: Row) => {
    setEditing(row);
    setForm({ ...row });
    setFormError(null);
    setModalOpen(true);
  };

  const setField = (name: string, value: unknown) =>
    setForm((prev) => ({ ...prev, [name]: value }));

  const save = async () => {
    setSaving(true);
    setFormError(null);
    const payload: Row = { ...defaults };
    for (const field of config.fields) {
      if (field.readOnly) continue;
      let v = form[field.name];
      if (field.type === "number" || field.type === "money") {
        v = v === "" || v === undefined || v === null ? null : Number(v);
      } else if (field.type === "map") {
        // "map" tek widget ama iki kolon yazar: kendi adı (lat) + pairField (lng).
        v = v === "" || v === undefined ? null : Number(v);
        const pv = form[field.pairField!];
        payload[field.pairField!] = pv === "" || pv === undefined || pv === null ? null : Number(pv);
      } else if (field.type === "boolean") {
        v = !!v;
      } else {
        if (typeof v === "string") v = v.trim();
        if (v === "" || v === undefined || v === null) v = null;
      }
      payload[field.name] = v;
    }

    const missing = config.fields.filter(
      (f) => f.required && !f.readOnly && payload[f.name] === null,
    );
    if (missing.length > 0) {
      setSaving(false);
      setFormError(`Lütfen zorunlu alanları doldurun: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }

    // Sayısal sınır + e-posta/telefon format kontrolü
    for (const f of config.fields) {
      if (f.readOnly) continue;
      const v = payload[f.name];
      if (v === null || v === undefined) continue;
      if (f.type === "number" || f.type === "money") {
        const n = Number(v);
        if (f.positive && !(n > 0)) {
          setSaving(false);
          setFormError(`${f.label} 0'dan büyük olmalı.`);
          return;
        }
        if (f.min !== undefined && n < f.min) {
          setSaving(false);
          setFormError(
            f.min === 0 ? `${f.label} negatif olamaz.` : `${f.label} en az ${formatNumber(f.min)} olmalı.`,
          );
          return;
        }
      } else if (f.type === "email") {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))) {
          setSaving(false);
          setFormError(`${f.label} geçerli bir e-posta adresi değil.`);
          return;
        }
      } else if (f.type === "tel") {
        if (String(v).replace(/\D/g, "").length < 7) {
          setSaving(false);
          setFormError(`${f.label} geçerli bir telefon numarası değil.`);
          return;
        }
      }
    }

    const dupField = config.fields.find((f) => {
      if (!f.unique || f.readOnly) return false;
      const v = payload[f.name];
      if (v === null) return false;
      const norm = String(v).toLocaleLowerCase("tr");
      return rows.some(
        (r) => r.id !== editing?.id && String(r[f.name] ?? "").trim().toLocaleLowerCase("tr") === norm,
      );
    });
    if (dupField) {
      setSaving(false);
      setFormError(`${dupField.label}: "${String(payload[dupField.name])}" değeri zaten kayıtlı.`);
      return;
    }

    // Kota: kaynak bağlantının kalan tonajını aşan satışı engelle (fazla satış).
    if (config.quota) {
      const q = config.quota;
      const refId = payload[q.field];
      const adding = Number(payload[q.amountField]) || 0;
      if (refId && adding > 0) {
        const { data: capRow } = await supabase
          .from(q.capacityTable)
          .select(q.capacityField)
          .eq("id", refId)
          .maybeSingle();
        const capacity = Number((capRow as Row | null)?.[q.capacityField]) || 0;
        if (capacity > 0) {
          const statusCol = q.statusField ?? "status";
          let usedQ = supabase
            .from(config.table)
            .select(`${q.amountField},${statusCol}`)
            .eq(q.field, refId);
          if (editing?.id) usedQ = usedQ.neq("id", editing.id);
          const { data: usedRows } = await usedQ;
          const used = ((usedRows as Row[] | null) ?? []).reduce((sum, r) => {
            if (q.excludeStatus?.includes(String(r[statusCol] ?? ""))) return sum;
            return sum + (Number(r[q.amountField]) || 0);
          }, 0);
          if (used + adding > capacity) {
            const remaining = Math.max(capacity - used, 0);
            setSaving(false);
            setFormError(
              `Bu bağlantının satılabilir kalan miktarı ${formatNumber(remaining)} (toplam ${formatNumber(capacity)}). Daha fazlası girilemez.`,
            );
            return;
          }
        }
      }
    }

    const result = editing?.id
      ? await supabase.from(config.table).update(payload).eq("id", editing.id)
      : await supabase.from(config.table).insert(payload);

    setSaving(false);
    if (result.error) {
      setFormError(result.error.message);
      return;
    }
    setModalOpen(false);
    loadRows();
  };

  const remove = async (row: Row) => {
    if (!window.confirm(`"${config.singular}" kaydı silinsin mi?`)) return;
    if (config.softDelete) {
      const { error } = await supabase
        .from(config.table)
        .update({ [config.softDelete.column]: false })
        .eq("id", row.id);
      if (error) { alert("Silinemedi: " + error.message); return; }
    } else {
      const { error } = await supabase.from(config.table).delete().eq("id", row.id);
      if (error) { alert("Silinemedi: " + error.message); return; }
    }
    loadRows();
  };

  // --- detay görünümü + kayda özel not ---
  const notesFieldName = fieldByName["notes"]
    ? "notes"
    : fieldByName["description"]
      ? "description"
      : null;

  const openDetail = (row: Row) => {
    setDetail(row);
    setNoteText(notesFieldName ? ((row[notesFieldName] as string) ?? "") : "");
  };

  const onRowOpen = (row: Row) => {
    if (rowHref) router.push(rowHref(row));
    else openDetail(row);
  };

  const saveNote = async () => {
    if (!detail || !notesFieldName) return;
    setSavingNote(true);
    const { error } = await supabase
      .from(config.table)
      .update({ [notesFieldName]: noteText === "" ? null : noteText })
      .eq("id", detail.id);
    setSavingNote(false);
    if (error) {
      alert("Not kaydedilemedi: " + error.message);
      return;
    }
    setDetail({ ...detail, [notesFieldName]: noteText });
    loadRows();
  };

  const overQuota = !!(
    quotaInfo &&
    config.quota &&
    Number(form[config.quota.amountField]) > quotaInfo.remaining
  );

  const listFieldDefs = config.listFields.map((n) => fieldByName[n]).filter(Boolean);

  // Filtre paneli: her alan tipine göre otomatik gruplanır (bkz. resources.ts).
  const dropdownFilterFields = config.fields.filter(
    (f) => f.type === "reference" || f.type === "select" || f.type === "boolean",
  );
  const rangeFilterFields = config.fields.filter(
    (f) => f.type === "date" || f.type === "number" || f.type === "money",
  );
  const textFilterFields = config.fields.filter(
    (f) =>
      f.type === "text" ||
      f.type === "textarea" ||
      f.type === "select_other" ||
      f.type === "email" ||
      f.type === "tel" ||
      f.type === "url",
  );
  const hasFilterUI =
    !hideFilters &&
    dropdownFilterFields.length + rangeFilterFields.length + textFilterFields.length > 0;
  const activeFilterCount =
    Object.values(filters).filter((v) => v).length +
    Object.values(textFilters).filter((v) => v.trim() !== "").length +
    Object.values(rangeFilters).filter((r) => r.from !== "" || r.to !== "").length;
  const hasActiveFilters = activeFilterCount > 0;
  const clearAllFilters = () => {
    setFilters({});
    setTextFilters({});
    setRangeFilters({});
  };

  const filterOptions = (field: FieldDef): { value: string; label: string }[] => {
    if (field.type === "select")
      return (field.options || []).map((o) => ({ value: o.value, label: o.label }));
    if (field.type === "reference" && field.ref)
      return (refData[field.ref.table] || [])
        .filter((o) => {
          const flt = field.ref!.filter;
          return !flt || Object.entries(flt).every(([col, vals]) => vals.includes(String(o[col])));
        })
        .map((r) => ({
          value: String(r.id),
          label: pickRefLabel(field.ref!, r, r.id),
        }));
    if (field.type === "boolean")
      return [
        { value: "true", label: "Evet" },
        { value: "false", label: "Hayır" },
      ];
    return [];
  };

  return (
    <div className="space-y-4">
      {/* Üst bar */}
      <div
        className={`flex flex-col gap-3 sm:flex-row sm:items-center ${
          hideTitle ? "sm:justify-end" : "sm:justify-between"
        }`}
      >
        {!hideTitle && (
          <h1 className="text-lg font-semibold">{title || config.title}</h1>
        )}
        <div className="flex items-center gap-2">
          {hasFilterUI && (
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${
                filtersOpen || hasActiveFilters
                  ? "border-brand bg-brand/5 text-brand"
                  : "border-border bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Filter className="h-4 w-4" /> Filtrele
              {hasActiveFilters && (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}
          {rows.length > 0 && (
            <button
              type="button"
              onClick={exportRows}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
              title="Görünen (filtrelenmiş) kayıtları Excel'e aktar"
            >
              <Download className="h-4 w-4" /> Excel&apos;e Aktar
            </button>
          )}
          {canWrite && (
            <Button onClick={openNew} className="shrink-0">
              <Plus className="h-4 w-4" /> Yeni
            </Button>
          )}
        </div>
      </div>

      {/* Filtre paneli: istenince açılır, tablonun ÜSTÜNDE — sürekli yer kaplamaz */}
      {hasFilterUI && filtersOpen && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold">Filtreler</span>
            <div className="flex items-center gap-3">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-xs font-medium text-brand hover:underline"
                >
                  Temizle
                </button>
              )}
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="text-gray-400 hover:text-gray-600"
                title="Kapat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {dropdownFilterFields.map((f) => (
              <div key={f.name}>
                <label className="mb-1 block text-xs font-medium text-gray-600">{f.label}</label>
                <SearchableSelect
                  value={filters[f.name] ?? ""}
                  onChange={(v) => setFilters((prev) => ({ ...prev, [f.name]: v }))}
                  options={filterOptions(f)}
                  placeholder="Tümü"
                  className="w-full"
                />
              </div>
            ))}
            {rangeFilterFields.map((f) => {
              const r = rangeFilters[f.name] ?? { from: "", to: "" };
              const isDate = f.type === "date";
              return (
                <div key={f.name}>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{f.label}</label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type={isDate ? "date" : "number"}
                      value={r.from}
                      onChange={(e) =>
                        setRangeFilters((prev) => ({ ...prev, [f.name]: { from: e.target.value, to: prev[f.name]?.to ?? "" } }))
                      }
                      placeholder={isDate ? undefined : "min"}
                      className="min-w-0 flex-1"
                    />
                    <span className="shrink-0 text-xs text-gray-400">–</span>
                    <Input
                      type={isDate ? "date" : "number"}
                      value={r.to}
                      onChange={(e) =>
                        setRangeFilters((prev) => ({ ...prev, [f.name]: { from: prev[f.name]?.from ?? "", to: e.target.value } }))
                      }
                      placeholder={isDate ? undefined : "maks"}
                      className="min-w-0 flex-1"
                    />
                  </div>
                </div>
              );
            })}
            {textFilterFields.map((f) => (
              <div key={f.name}>
                <label className="mb-1 block text-xs font-medium text-gray-600">{f.label}</label>
                <Input
                  value={textFilters[f.name] ?? ""}
                  onChange={(e) => setTextFilters((prev) => ({ ...prev, [f.name]: e.target.value }))}
                  placeholder="Ara..."
                  className="w-full"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Veri yüklenemedi: {error}
          <div className="mt-1 text-xs text-red-500">
            Tablolar henüz oluşturulmadıysa Supabase SQL Editor&apos;de migration
            dosyalarını çalıştırın.
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState message={rows.length === 0 ? "Kayıt bulunamadı." : "Filtreyle eşleşen kayıt yok."} />
      ) : (
        <>
          {/* Masaüstü tablo */}
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50 text-left text-xs uppercase text-gray-500">
                  {listFieldDefs.map((f) => (
                    <th key={f.name} className="px-4 py-3 font-medium">
                      {f.label}
                    </th>
                  ))}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={String(row.id)}
                    onClick={() => onRowOpen(row)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-gray-50"
                  >
                    {listFieldDefs.map((f) => (
                      <td key={f.name} className="px-4 py-3">
                        {renderCell(f, row)}
                      </td>
                    ))}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => onRowOpen(row)}
                          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                          title="Detay"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {canWrite && (
                          <button
                            onClick={() => openEdit(row)}
                            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                            title="Düzenle"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {canWrite && (
                          <button
                            onClick={() => remove(row)}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            title="Sil"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobil kartlar */}
          <div className="space-y-3 md:hidden">
            {filtered.map((row) => (
              <div
                key={String(row.id)}
                className="cursor-pointer rounded-xl border border-border bg-card p-4"
                onClick={() => onRowOpen(row)}
              >
                {listFieldDefs.map((f, i) => (
                  <div
                    key={f.name}
                    className={`flex justify-between gap-3 py-1 ${i === 0 ? "mb-1 border-b border-border pb-2" : ""}`}
                  >
                    <span className="text-xs text-gray-500">{f.label}</span>
                    <span
                      className={`text-right text-sm ${i === 0 ? "font-semibold" : ""}`}
                    >
                      {renderCell(f, row)}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Form modalı */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          !canWrite
            ? `${config.singular} (Görüntüle)`
            : editing
              ? `${config.singular} Düzenle`
              : `Yeni ${config.singular}`
        }
      >
        <div className="space-y-3">
          {quotaInfo && (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                overQuota
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5">
                <span>Seçili gemi tonajı</span>
                <span className="font-medium">
                  Toplam {formatNumber(quotaInfo.capacity)} · Satılan{" "}
                  {formatNumber(quotaInfo.used)} · Kalan {formatNumber(quotaInfo.remaining)}
                </span>
              </div>
              {overQuota && (
                <div className="mt-1 text-xs font-medium">
                  Girilen miktar kalan tonajı aşıyor. En fazla{" "}
                  {formatNumber(quotaInfo.remaining)} girilebilir.
                </div>
              )}
            </div>
          )}
          {groupFieldRows(config.fields.filter((f) => !f.formHidden && !f.readOnly)).map((group) => {
            // select_other kendi iç durumunu yalnızca ilk değerden kurar; farklı
            // bir kayıt açıldığında yeniden kurulması için anahtara kayıt id'si eklenir.
            const keyOf = (f: FieldDef) => (f.type === "select_other" ? `${f.name}:${editing?.id ?? "new"}` : f.name);
            if (group.length === 1) {
              const f = group[0];
              return (
                <Field key={keyOf(f)} label={f.label} required={f.required}>
                  {renderInput(f)}
                </Field>
              );
            }
            const [head, ...rest] = group;
            return (
              <div key={keyOf(head)} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Field label={head.label} required={head.required}>
                    {renderInput(head)}
                  </Field>
                </div>
                {rest.map((f) => (
                  <div key={keyOf(f)} className="w-28 shrink-0">
                    <Field label={f.label} required={f.required}>
                      {renderInput(f)}
                    </Field>
                  </div>
                ))}
              </div>
            );
          })}

          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              {canWrite ? "İptal" : "Kapat"}
            </Button>
            {canWrite && (
              <Button onClick={save} disabled={saving}>
                {saving ? (
                  <Spinner className="h-4 w-4 border-white/40 border-t-white" />
                ) : (
                  "Kaydet"
                )}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* Detay görünümü */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={`${config.singular} Detayı`}
      >
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              {config.fields
                .filter((f) => f.name !== notesFieldName)
                .map((f) => (
                  <div
                    key={f.name}
                    className={f.type === "textarea" ? "sm:col-span-2" : ""}
                  >
                    <div className="text-xs text-gray-500">{f.label}</div>
                    <div className="mt-0.5 text-sm">{renderCell(f, detail)}</div>
                  </div>
                ))}
            </div>

            {detailExtra && detailExtra(detail)}

            {notesFieldName && (
              <div className="rounded-lg border border-border p-3">
                <div className="mb-2 text-sm font-medium">Notlar</div>
                {canWrite ? (
                  <>
                    <Textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder={`Bu ${config.singular.toLocaleLowerCase("tr")} için not yazın...`}
                    />
                    <div className="mt-2 flex justify-end">
                      <Button size="sm" onClick={saveNote} disabled={savingNote}>
                        {savingNote ? "Kaydediliyor..." : "Notu Kaydet"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="whitespace-pre-wrap text-sm text-gray-700">
                    {(detail[notesFieldName] as string) || "-"}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-border pt-3">
              {canWrite && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    const r = detail;
                    setDetail(null);
                    openEdit(r);
                  }}
                >
                  <Pencil className="h-4 w-4" /> Düzenle
                </Button>
              )}
              <Button onClick={() => setDetail(null)}>Kapat</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );

  function renderInput(f: FieldDef) {
    const value = form[f.name] ?? "";
    if (f.type === "textarea")
      return (
        <Textarea
          value={value as string}
          onChange={(e) => setField(f.name, e.target.value)}
          placeholder={f.placeholder}
          disabled={!canWrite}
        />
      );
    if (f.type === "boolean")
      return (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!form[f.name]}
            onChange={(e) => setField(f.name, e.target.checked)}
            disabled={!canWrite}
            className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
          />
          <span className="text-sm text-gray-600">Evet</span>
        </label>
      );
    if (f.type === "select")
      return (
        <Select
          value={value as string}
          onChange={(e) => setField(f.name, e.target.value)}
          disabled={!canWrite}
        >
          <option value="">Seçiniz...</option>
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
    if (f.type === "select_other")
      return (
        <SelectOtherInput
          value={form[f.name]}
          options={f.options || []}
          onChange={(v) => setField(f.name, v)}
          disabled={!canWrite}
          uppercase={config.uppercaseText}
        />
      );
    if (f.type === "reference")
      return (
        <Select
          value={value as string}
          onChange={(e) => {
            const v = e.target.value;
            setForm((prev) => {
              const next: Row = { ...prev, [f.name]: v };
              if (f.autofill && v && f.ref) {
                const refRow = (refData[f.ref.table] || []).find(
                  (r) => String(r.id) === v,
                );
                if (refRow)
                  for (const [target, src] of Object.entries(f.autofill)) {
                    const val = refRow[src];
                    if (val !== undefined && val !== null && val !== "")
                      next[target] = val;
                  }
              }
              return next;
            });
          }}
          disabled={!canWrite}
        >
          <option value="">Seçiniz...</option>
          {(refData[f.ref!.table] || [])
            .filter((o) => {
              const flt = f.ref!.filter;
              return (
                !flt ||
                Object.entries(flt).every(([col, vals]) => vals.includes(String(o[col])))
              );
            })
            .map((o) => (
              <option key={String(o.id)} value={String(o.id)}>
                {pickRefLabel(f.ref!, o, o.id)}
              </option>
            ))}
        </Select>
      );
    if (f.type === "number" || f.type === "money")
      return (
        <NumberInput
          value={form[f.name]}
          onChange={(v) => setField(f.name, v)}
          placeholder={f.placeholder}
          disabled={!canWrite}
        />
      );
    if (f.type === "file")
      return (
        <FileInput
          value={form[f.name]}
          onChange={(v) => setField(f.name, v)}
          bucket={f.bucket || "contracts"}
          disabled={!canWrite}
        />
      );
    if (f.type === "map")
      return (
        <MapPointInput
          lat={form[f.name]}
          lng={form[f.pairField!]}
          onChangeLat={(v) => setField(f.name, v)}
          onChangeLng={(v) => setField(f.pairField!, v)}
          disabled={!canWrite}
        />
      );
    const inputType =
      f.type === "date"
        ? "date"
        : f.type === "time"
          ? "time"
          : f.type === "email"
            ? "email"
            : f.type === "tel"
              ? "tel"
              : f.type === "url"
                ? "url"
                : "text";
    const forceUpper = config.uppercaseText && f.type === "text";
    return (
      <Input
        type={inputType}
        value={value as string}
        onChange={(e) => {
          const raw = e.target.value;
          setField(f.name, forceUpper ? raw.toLocaleUpperCase("tr") : raw);
        }}
        placeholder={f.placeholder}
        disabled={!canWrite}
      />
    );
  }
}
