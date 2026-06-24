"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import { Spinner } from "./ui";
import { Plus, Trash2 } from "lucide-react";

// Genel amaçlı fotoğraf galerisi. Kendi verisini yükler; bir üst kaydın
// (gemi, araç vb.) fotoğraflarını gösterir/ekler/siler. Fotoğraflar tarayıcıda
// sıkıştırılıp verilen private kovaya yüklenir, yol da verilen tabloya yazılır.
// Önizleme imzalı URL ile yapılır.
//
// table:    örn. "contract_photos"
// fkColumn: örn. "contract_id"
// fkValue:  ilgili kaydın id'si
// bucket:   örn. "contract-photos"

type Photo = { id: string; path: string; label: string | null };

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
  const pendingLabel = useRef<string>(labels[0]);
  const mounted = useRef(true);

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
    setBusy(true);
    setErr(null);
    try {
      for (const file of Array.from(files)) {
        const { blob, ext, contentType } = await compressImage(file);
        const key = `${fkValue}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from(bucket).upload(key, blob, { upsert: false, contentType });
        if (up.error) {
          setErr(up.error.message);
          break;
        }
        const ins = await supabase
          .from(table)
          .insert({ [fkColumn]: fkValue, path: key, label: pendingLabel.current });
        if (ins.error) {
          await supabase.storage.from(bucket).remove([key]);
          setErr(ins.error.message);
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

  const trigger = (label: string) => {
    pendingLabel.current = label;
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Fotoğraf ekle:</span>
          {labels.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => trigger(l)}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-2.5 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> {l}
            </button>
          ))}
          {busy && <span className="text-xs text-gray-500">İşleniyor...</span>}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
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
                title={p.label || "Fotoğraf"}
              >
                {urls[p.path] ? (
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
