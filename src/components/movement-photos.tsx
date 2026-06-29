"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressImage, isImagePath } from "@/lib/image";
import { Spinner } from "./ui";
import { FileText, Plus, Trash2 } from "lucide-react";

// Bir araç girişine (stock_movements) bağlı fotoğraflar: irsaliye, numune vb.
// Fotoğraf tarayıcıda sıkıştırılıp private "movement-photos" kovasına yüklenir,
// yolu movement_photos tablosuna yazılır; önizleme imzalı URL ile gösterilir.

const BUCKET = "movement-photos";
const PRESET_LABELS = ["İrsaliye", "Numune", "Diğer"];

export type MovementPhoto = {
  id: string;
  movement_id: string;
  path: string;
  label: string | null;
  created_at: string;
};

export function MovementPhotos({
  movementId,
  photos,
  canWrite,
  onChanged,
}: {
  movementId: string;
  photos?: MovementPhoto[];
  canWrite: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const list = useMemo(() => photos ?? [], [photos]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingLabel = useRef<string>(PRESET_LABELS[0]);

  // İmzalı önizleme URL'leri (tek seferde toplu).
  useEffect(() => {
    let on = true;
    (async () => {
      const paths = list.map((p) => p.path);
      if (paths.length === 0) {
        setUrls({});
        return;
      }
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
      if (!on) return;
      const m: Record<string, string> = {};
      (data || []).forEach((d) => {
        if (d.signedUrl && d.path) m[d.path] = d.signedUrl;
      });
      setUrls(m);
    })();
    return () => {
      on = false;
    };
  }, [supabase, list]);

  const handleFiles = async (files: FileList) => {
    setBusy(true);
    setErr(null);
    try {
      for (const file of Array.from(files)) {
        const { blob, ext, contentType } = await compressImage(file);
        const key = `${movementId}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from(BUCKET).upload(key, blob, {
          upsert: false,
          contentType,
        });
        if (up.error) {
          setErr(up.error.message);
          break;
        }
        const ins = await supabase
          .from("movement_photos")
          .insert({ movement_id: movementId, path: key, label: pendingLabel.current });
        if (ins.error) {
          // Tabloya yazılamadıysa yüklenen dosyayı geri al (yetim kalmasın).
          await supabase.storage.from(BUCKET).remove([key]);
          setErr(ins.error.message);
          break;
        }
      }
      await onChanged();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const trigger = (label: string) => {
    pendingLabel.current = label;
    inputRef.current?.click();
  };

  const remove = async (p: MovementPhoto) => {
    if (!window.confirm("Bu fotoğraf silinsin mi?")) return;
    setBusy(true);
    await supabase.storage.from(BUCKET).remove([p.path]);
    await supabase.from("movement_photos").delete().eq("id", p.id);
    await onChanged();
    setBusy(false);
  };

  return (
    <div className="space-y-2">
      {canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Foto / PDF ekle:</span>
          {PRESET_LABELS.map((l) => (
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

      {list.length === 0 ? (
        <div className="text-xs text-gray-400">Bu araç için foto / irsaliye yok.</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {list.map((p) => (
            <div key={p.id} className="group relative">
              <a
                href={urls[p.path] || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
                title={p.label || "Dosya"}
              >
                {!isImagePath(p.path) ? (
                  <div className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-red-50 text-red-600">
                    <FileText className="h-7 w-7" />
                    <span className="text-[10px] font-semibold">PDF</span>
                  </div>
                ) : urls[p.path] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={urls[p.path]}
                    alt={p.label || "Araç fotoğrafı"}
                    className="h-20 w-20 rounded-lg border border-border object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-border bg-gray-50">
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
