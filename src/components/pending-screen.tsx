"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button, Card } from "./ui";
import { Clock } from "lucide-react";

export function PendingScreen({ email }: { email: string | null }) {
  const router = useRouter();
  const logout = async () => {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
          <Clock className="h-6 w-6" />
        </div>
        <h1 className="mb-2 text-lg font-bold">Hesabınız onay bekliyor</h1>
        <p className="mb-6 text-sm text-gray-500">
          {email} hesabına henüz bir rol atanmadı. Yönetici rol atadıktan sonra
          ilgili modüllere erişebilirsiniz.
        </p>
        <Button variant="secondary" onClick={logout} className="w-full">
          Çıkış Yap
        </Button>
      </Card>
    </div>
  );
}
