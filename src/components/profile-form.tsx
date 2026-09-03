"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input } from "./ui";
import { ROLE_LABELS, ROLE_LABELS_EN } from "@/lib/nav";
import { L } from "@/lib/i18n";
import { translateDbError } from "@/lib/db-errors";
import type { Role } from "@/lib/types";
import { Globe, KeyRound, UserCog } from "lucide-react";

export function ProfileForm({
  email,
  fullName,
  role,
  language,
}: {
  email: string | null;
  fullName: string | null;
  role: Role;
  language: "tr" | "en";
}) {
  const supabase = createClient();
  const router = useRouter();
  // Kullanıcının kendi seçtiği dil (bkz. src/lib/i18n.ts + migration 0072).
  // Kaydedilene kadar iyimser (optimistic) yerel state ile anında yansır.
  const [lang, setLang] = useState<"tr" | "en">(language);
  const isEn = lang === "en";
  const t = (tr: string, en: string) => L(isEn, tr, en);

  const [savingLang, setSavingLang] = useState(false);
  const changeLang = async (next: "tr" | "en") => {
    if (next === lang || savingLang) return;
    setLang(next);
    setSavingLang(true);
    const { error } = await supabase.rpc("update_my_language", { p_language: next });
    setSavingLang(false);
    if (error) {
      setLang(lang); // hata olursa eski dile geri dön
      return;
    }
    router.refresh();
  };

  // --- İsim ---
  const [name, setName] = useState(fullName || "");
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameMsg({ ok: false, text: t("İsim boş olamaz.", "Name cannot be empty.") });
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
      setNameMsg({ ok: false, text: `${t("Güncellenemedi", "Could not update")}: ${translateDbError(error)}` });
      return;
    }
    setNameMsg({ ok: true, text: t("İsim güncellendi.", "Name updated.") });
    router.refresh();
  };

  // --- Şifre ---
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const savePw = async () => {
    if (pw.length < 6) {
      setPwMsg({ ok: false, text: t("Şifre en az 6 karakter olmalı.", "Password must be at least 6 characters.") });
      return;
    }
    if (pw !== pw2) {
      setPwMsg({ ok: false, text: t("Şifreler eşleşmiyor.", "Passwords do not match.") });
      return;
    }
    setSavingPw(true);
    setPwMsg(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSavingPw(false);
    if (error) {
      setPwMsg({ ok: false, text: `${t("Şifre değiştirilemedi", "Could not change password")}: ${translateDbError(error)}` });
      return;
    }
    setPw("");
    setPw2("");
    setPwMsg({ ok: true, text: t("Şifreniz güncellendi.", "Your password has been updated.") });
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-xl font-bold">{t("Profilim", "My Profile")}</h1>

      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Globe className="h-5 w-5 text-brand" />
          <h2 className="font-semibold">{t("Dil", "Language")}</h2>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={lang === "tr" ? "primary" : "secondary"}
            disabled={savingLang}
            onClick={() => changeLang("tr")}
          >
            Türkçe
          </Button>
          <Button
            type="button"
            variant={lang === "en" ? "primary" : "secondary"}
            disabled={savingLang}
            onClick={() => changeLang("en")}
          >
            English
          </Button>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <UserCog className="h-5 w-5 text-brand" />
          <h2 className="font-semibold">{t("Hesap Bilgileri", "Account Information")}</h2>
        </div>
        <Field label={t("E-posta", "Email")}>
          <Input value={email || ""} disabled />
        </Field>
        <Field label={t("Rol", "Role")}>
          <Input value={isEn ? ROLE_LABELS_EN[role] : ROLE_LABELS[role]} disabled />
        </Field>
        <Field label={t("Ad Soyad", "Full Name")}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("Adınız Soyadınız", "Your full name")}
          />
        </Field>
        <Msg m={nameMsg} />
        <div className="flex justify-end">
          <Button onClick={saveName} disabled={savingName}>
            {savingName ? t("Kaydediliyor...", "Saving...") : t("İsmi Kaydet", "Save Name")}
          </Button>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <KeyRound className="h-5 w-5 text-brand" />
          <h2 className="font-semibold">{t("Şifre Değiştir", "Change Password")}</h2>
        </div>
        <Field label={t("Yeni Şifre", "New Password")}>
          <Input
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder={t("En az 6 karakter", "At least 6 characters")}
          />
        </Field>
        <Field label={t("Yeni Şifre (Tekrar)", "New Password (Confirm)")}>
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
            {savingPw ? t("Değiştiriliyor...", "Changing...") : t("Şifreyi Değiştir", "Change Password")}
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
