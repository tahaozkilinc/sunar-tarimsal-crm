import { requireProfile } from "@/lib/auth";
import { ProfileForm } from "@/components/profile-form";

// Kendi profilini görüntüleme/düzenleme: her giriş yapmış kullanıcı erişebilir
// (pending hariç; layout pending'i zaten ayırır). İsim + şifre değiştirilebilir.
export default async function ProfilePage() {
  const profile = await requireProfile();
  return (
    <ProfileForm email={profile.email} fullName={profile.full_name} role={profile.role} />
  );
}
