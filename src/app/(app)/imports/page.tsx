import { requireAccess } from "@/lib/auth";
import { TuikImportsPage } from "@/components/tuik-imports";

export default async function ImportsPage() {
  const profile = await requireAccess("/imports");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">İthalat — TÜİK Karşılaştırması</h1>
        <p className="text-sm text-gray-500">
          Türkiye&apos;nin GTİP bazlı aylık ithalatı içinde Sunar&apos;ın payı
        </p>
      </div>
      <TuikImportsPage role={profile.role} />
    </div>
  );
}
