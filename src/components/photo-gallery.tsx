"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressImage, isImagePath } from "@/lib/image";
import { translateDbError } from "@/lib/db-errors";
import { Input, Select, Spinner } from "./ui";
import { FileText, Trash2, UploadCloud } from "lucide-react";

// Genel amaçlı fotoğraf galerisi. Kendi verisini yükler; bir üst kaydın
// (gemi, araç vb.) fotoğraflarını gösterir/ekler/siler. Fotoğraflar tarayıcıda
// sıkıştırılıp verilen private kovaya yüklenir, yol da verilen tabloya yazılır.
// Önizleme imzalı URL ile yapılır.
//
// table:    örn. "contract_photos"
// fkColumn: örn. "contract_id"
// fkValue:  ilgili kaydın id'si
// bucket:   örn. "contract-photos"
//
// Yükleme akışı: önce (zorunlu) belge türü seçilir, sonra dosya sürükle-
// bırak ile (veya tıklayıp) eklenir — eskiden her tür için ayrı bir "+"
// butonu vardı, sürükle-bırak yoktu (kullanıcı isteği: "sürükle bırak
// olmadan kullanıcı yapamaz... yanına hemen dosya türü kısmı seçsin").
// "Diğer" seçilirse türü kullanıcı kendi yazar.

type Photo = { id: string; path: string; label: string | null };
const OTHER = "__other__";

export function PhotoGallery({
  bucket,
  table,
  fkColumn,
  fkValue,
  canWrite,
  labels = ["Fotoğraf"],
  emptyText = "Fotoğraf yok.",
  onChanged,
}: {
  bucket: string;
  table: string;
  fkColumn: string;
  fkValue: string;
  canWrite: boolean;
  labels?: string[];
  emptyText?: string;
  onChanged?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const [selectedLabel, setSelectedLabel] = useState("");
  const [otherLabel, setOtherLabel] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const effectiveLabel = selectedLabel === OTHER ? otherLabel.trim() : selectedLabel;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from(table)
      .select("id,path,label,created_at")
      .eq(fkColumn, fkValue)
      .order("created_at", { ascending: true });
    if (!mounted.current) return;
    const rows = (data as (Photo & { created_at: string })[] | null) || [];
    setPhotos(rows);
    const paths = rows.map((r) => r.path);
    if (paths.length === 0) {
      setUrls({});
      return;
    }
    const { data: signed } = await supabase.storage.from(bucket).createSignedUrls(paths, 3600);
    if (!mounted.current) return;
    const m: Record<string, string> = {};
    (signed || []).forEach((s) => {
      if (s.signedUrl && s.path) m[s.path] = s.signedUrl;
    });
    setUrls(m);
  }, [supabase, table, fkColumn, fkValue, bucket]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => {
      if (mounted.current) setLoading(false);
    });
  }, [load]);

  const handleFiles = async (files: FileList) => {
    if (!effectiveLabel) { setErr("Önce belge türünü seçin."); return; }
    setBusy(true);
    setErr(null);
    try {
      for (const file of Array.from(files)) {
        const { blob, ext, contentType } = await compressImage(file);
        const key = `${fkValue}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from(bucket).upload(key, blob, { upsert: false, contentType });
        if (up.error) {
          setErr(translateDbError(up.error));
          break;
        }
        const ins = await supabase
          .from(table)
          .insert({ [fkColumn]: fkValue, path: key, label: effectiveLabel });
        if (ins.error) {
          await supabase.storage.from(bucket).remove([key]);
          setErr(translateDbError(ins.error));
          break;
        }
      }
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const openPicker = () => {
    if (!effectiveLabel) { setErr("Önce belge türünü seçin."); return; }
    inputRef.current?.click();
  };

  const remove = async (p: Photo) => {
    if (!window.confirm("Bu fotoğraf silinsin mi?")) return;
    setBusy(true);
    await supabase.storage.from(bucket).remove([p.path]);
    await supabase.from(table).delete().eq("id", p.id);
    await load();
    onChanged?.();
    setBusy(false);
  };

  return (
    <div className="space-y-2">
      {canWrite && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[180px]">
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Belge Türü <span className="text-red-500">*</span>
              </label>
              <Select
                value={selectedLabel}
                onChange={(e) => { setSelectedLabel(e.target.value); setErr(null); }}
              >
                <option value="">Seçiniz...</option>
                {labels.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
                <option value={OTHER}>Diğer</option>
              </Select>
            </div>
            {selectedLabel === OTHER && (
              <div className="min-w-[180px]">
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Türünü Yazın <span className="text-red-500">*</span>
                </label>
                <Input
                  value={otherLabel}
                  onChange={(e) => setOtherLabel(e.target.value)}
                  placeholder="ör. Teknik Rapor"
                />
              </div>
            )}
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); if (effectiveLabel) setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (!effectiveLabel) { setErr("Önce belge türünü seçin."); return; }
              if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
            }}
            onClick={openPicker}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openPicker(); }}
            className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
              busy
                ? "cursor-wait border-border bg-gray-50 text-gray-400"
                : !effectiveLabel
                  ? "cursor-not-allowed border-border bg-gray-50 text-gray-400"
                  : dragOver
                    ? "cursor-pointer border-brand bg-brand/5 text-brand"
                    : "cursor-pointer border-border bg-gray-50 text-gray-500 hover:border-brand/50 hover:bg-brand/5"
            }`}
          >
            <UploadCloud className="h-6 w-6" />
            <div className="text-sm font-medium">
              {busy
                ? "Yükleniyor..."
                : !effectiveLabel
                  ? "Önce belge türünü seçin"
                  : "Dosyaları buraya sürükle bırak ya da tıkla"}
            </div>
            <div className="text-xs text-gray-400">Fotoğraf veya PDF</div>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(e.target.files);
            }}
          />
        </div>
      )}

      {err && <div className="text-xs text-red-600">{err}</div>}

      {loading ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : photos.length === 0 ? (
        <div className="text-xs text-gray-400">{emptyText}</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => (
            <div key={p.id} className="group relative">
              <a
                href={urls[p.path] || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
                title={p.label || "Dosya"}
              >
                {!isImagePath(p.path) ? (
                  <div className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-red-50 text-red-600">
                    <FileText className="h-8 w-8" />
                    <span className="text-[10px] font-semibold">PDF</span>
                  </div>
                ) : urls[p.path] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={urls[p.path]}
                    alt={p.label || "Fotoğraf"}
                    className="h-24 w-24 rounded-lg border border-border object-cover"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-border bg-gray-50">
                    <Spinner />
                  </div>
                )}
              </a>
              {p.label && (
                <span className="absolute inset-x-0 bottom-0 truncate rounded-b-lg bg-black/55 px-1 py-0.5 text-center text-[10px] text-white">
                  {p.label}
                </span>
              )}
              {canWrite && (
                <button
                  type="button"
                  onClick={() => remove(p)}
                  disabled={busy}
                  className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-white p-0.5 text-gray-400 shadow group-hover:block hover:text-red-600 disabled:opacity-50"
                  title="Fotoğrafı sil"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
