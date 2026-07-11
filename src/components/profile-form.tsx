"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input } from "./ui";
import { ROLE_LABELS } from "@/lib/nav";
import type { Role } from "@/lib/types";
import { KeyRound, UserCog } from "lucide-react";

export function ProfileForm({
  email,
  fullName,
  role,
}: {
  email: string | null;
  fullName: string | null;
  role: Role;
}) {
  const supabase = createClient();
  const router = useRouter();

  // --- İsim ---
  const [name, setName] = useState(fullName || "");
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameMsg({ ok: false, text: "İsim boş olamaz." });
      return;
    }
    setSavingName(true);
    setNameMsg(null);
    // İsim güncellemesi SECURITY DEFINER fonksiyonla yapılır (yalnızca kendi adını,
    // rolünü değiştiremez). Auth metadata da senkron tutulur.
    const { error } = await supabase.rpc("update_my_profile", { p_full_name: trimmed });
    if (!error) await supabase.auth.updateUser({ data: { full_name: trimmed } });
    setSavingName(false);
    if (error) {
      setNameMsg({ ok: false, text: `Güncellenemedi: ${error.message}` });
      return;
    }
    setNameMsg({ ok: true, text: "İsim güncellendi." });
    router.refresh();
  };

  // --- Şifre ---
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const savePw = async () => {
    if (pw.length < 6) {
      setPwMsg({ ok: false, text: "Şifre en az 6 karakter olmalı." });
      return;
    }
    if (pw !== pw2) {
      setPwMsg({ ok: false, text: "Şifreler eşleşmiyor." });
      return;
    }
    setSavingPw(true);
    setPwMsg(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSavingPw(false);
    if (error) {
      setPwMsg({ ok: false, text: `Şifre değiştirilemedi: ${error.message}` });
      return;
    }
    setPw("");
    setPw2("");
    setPwMsg({ ok: true, text: "Şifreniz güncellendi." });
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-xl font-bold">Profilim</h1>

      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <UserCog className="h-5 w-5 text-brand" />
          <h2 className="font-semibold">Hesap Bilgileri</h2>
        </div>
        <Field label="E-posta">
          <Input value={email || ""} disabled />
        </Field>
        <Field label="Rol">
          <Input value={ROLE_LABELS[role]} disabled />
        </Field>
        <Field label="Ad Soyad">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Adınız Soyadınız"
          />
        </Field>
        <Msg m={nameMsg} />
        <div className="flex justify-end">
          <Button onClick={saveName} disabled={savingName}>
            {savingName ? "Kaydediliyor..." : "İsmi Kaydet"}
          </Button>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <KeyRound className="h-5 w-5 text-brand" />
          <h2 className="font-semibold">Şifre Değiştir</h2>
        </div>
        <Field label="Yeni Şifre">
          <Input
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="En az 6 karakter"
          />
        </Field>
        <Field label="Yeni Şifre (Tekrar)">
          <Input
            type="password"
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
          />
        </Field>
        <Msg m={pwMsg} />
        <div className="flex justify-end">
          <Button onClick={savePw} disabled={savingPw}>
            {savingPw ? "Değiştiriliyor..." : "Şifreyi Değiştir"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// Form mesaj kutusu: render sırasında yeniden yaratılmasın diye modül seviyesinde.
function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m) return null;
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${
        m.ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {m.text}
    </div>
  );
}
