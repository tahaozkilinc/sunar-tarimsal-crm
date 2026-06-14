"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input } from "@/components/ui";
import { Leaf } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      // Yanlış kimlik bilgisi ile yapılandırma/bağlantı hatasını ayır ki
      // kurulum sorunları "şifre hatalı" gibi görünüp yanıltmasın.
      const invalid =
        error.code === "invalid_credentials" ||
        /invalid login credentials/i.test(error.message);
      setError(
        invalid
          ? "Giriş başarısız. E-posta veya şifre hatalı."
          : `Giriş yapılamadı: ${error.message}`,
      );
      return;
    }
    router.push("/");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-white">
            <Leaf className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold">Sunar Tarımsal CRM</h1>
          <p className="text-sm text-gray-500">Hesabınızla giriş yapın</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="E-posta">
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="ornek@sunaryatirim.com.tr"
            />
          </Field>
          <Field label="Şifre">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
