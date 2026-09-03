"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import { translateDbError } from "@/lib/db-errors";
import { baseRole } from "@/lib/nav";
import type { Role } from "@/lib/types";
import { Input, Spinner } from "./ui";
import { Download, Trash2, UploadCloud } from "lucide-react";

// Sözleşmeye bağlı, İSİMLİ, ÇOKLU dökümanlar (fatura, konşimento, ek protokol
// vb.) — sürükle-bırak ile yüklenir. Bu, tek dosyalık contract_file_url'den
// (resources.ts'teki form alanı, dokunulmadı) ve operasyonun gemiye ait numune
// fotoğrafları contract_photos'tan (0022, yazma yetkisi operasyonda) BAĞIMSIZ:
// burası satın almanın yönettiği (purchase_contracts writeRoles ile aynı:
// admin+purchasing) ayrı bir galeri. ResourceManager'ın "Detay" görünümüne
// (detailExtra) enjekte edilir — bkz. purchasing-tabs.tsx.

const BUCKET = "contract-documents";

type Doc = { id: string; path: string; label: string; created_at: string };

function extLabel(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return ext.toUpperCase().slice(0, 4);
}

export function ContractDocuments({ contractId, role }: { contractId: string; role: Role }) {
  const supabase = useMemo(() => createClient(), []);
  const canWrite = ["admin", "purchasing"].includes(baseRole(role));

  const [docs, setDocs] = useState<Doc[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data } = await supabase
      .from("contract_documents")
      .select("id,path,label,created_at")
      .eq("contract_id", contractId)
      .order("created_at", { ascending: false });
    setDocs((data as Doc[] | null) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  // İmzalı önizleme/indirme URL'leri (tek seferde toplu).
  useEffect(() => {
    let on = true;
    (async () => {
      const paths = docs.map((d) => d.path);
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
  }, [supabase, docs]);

  const upload = async (files: FileList | File[]) => {
    setBusy(true);
    setErr(null);
    try {
      const arr = Array.from(files);
      const base = name.trim();
      for (let i = 0; i < arr.length; i++) {
        const file = arr[i];
        const fileBase = file.name.replace(/\.[^.]+$/, "");
        const label = base ? (arr.length > 1 ? `${base} (${i + 1})` : base) : fileBase;
        const ext = file.name.split(".").pop() || "bin";
        const key = `${contractId}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from(BUCKET).upload(key, file, {
          upsert: false,
          contentType: file.type || undefined,
        });
        if (up.error) {
          setErr(translateDbError(up.error));
          break;
        }
        const ins = await supabase
          .from("contract_documents")
          .insert({ contract_id: contractId, path: key, label });
        if (ins.error) {
          // Tabloya yazılamadıysa yüklenen dosyayı geri al (yetim kalmasın).
          await supabase.storage.from(BUCKET).remove([key]);
          setErr(translateDbError(ins.error));
          break;
        }
      }
      setName("");
      await load();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (d: Doc) => {
    if (!window.confirm(`"${d.label}" silinsin mi?`)) return;
    setBusy(true);
    await supabase.storage.from(BUCKET).remove([d.path]);
    await supabase.from("contract_documents").delete().eq("id", d.id);
    await load();
    setBusy(false);
  };

  if (loading)
    return (
      <div className="flex justify-center py-3">
        <Spinner />
      </div>
    );

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="mb-2 text-xs font-semibold uppercase text-gray-500">Dökümanlar</div>

      {canWrite && (
        <div className="mb-3 space-y-2">
          <Input
            placeholder="Döküman adı (ör. Fatura, Konşimento) — boş bırakılırsa dosya adı kullanılır"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files?.length) upload(e.dataTransfer.files);
            }}
            onClick={() => !busy && inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-5 text-center transition-colors ${
              dragOver ? "border-brand bg-brand/5" : "border-border hover:bg-gray-50"
            } ${busy ? "pointer-events-none opacity-50" : ""}`}
          >
            <UploadCloud className="h-6 w-6 text-gray-400" />
            <span className="text-sm text-gray-600">
              {busy ? "Yükleniyor..." : "Dosyaları sürükleyip bırakın veya seçmek için tıklayın"}
            </span>
            <span className="text-xs text-gray-400">PDF, Word, Excel, JPG, PNG · en fazla 20 MB</span>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
            onChange={(e) => {
              if (e.target.files?.length) upload(e.target.files);
            }}
          />
        </div>
      )}

      {err && <div className="mb-2 text-xs text-red-600">{err}</div>}

      {docs.length === 0 ? (
        <div className="text-xs text-gray-400">Bu sözleşme için döküman eklenmemiş.</div>
      ) : (
        <div className="space-y-1.5">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-gray-100 text-[10px] font-bold text-gray-500">
                {extLabel(d.path)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{d.label}</div>
                <div className="text-xs text-gray-400">{formatDate(d.created_at)}</div>
              </div>
              {urls[d.path] && (
                <a
                  href={urls[d.path]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                  title="İndir / Görüntüle"
                >
                  <Download className="h-4 w-4" />
                </a>
              )}
              {canWrite && (
                <button
                  type="button"
                  onClick={() => remove(d)}
                  disabled={busy}
                  className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  title="Sil"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
