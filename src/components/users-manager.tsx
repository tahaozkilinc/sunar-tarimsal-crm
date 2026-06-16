"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
} from "./ui";
import { ROLE_LABELS } from "@/lib/nav";
import type { Profile, Role } from "@/lib/types";
import { Plus, Trash2 } from "lucide-react";

const ROLE_OPTIONS: Role[] = [
  "admin",
  "purchasing",
  "operations",
  "sales",
  "finans",
  "maliyet",
  "viewer",
  "pending",
];

export function UsersManager() {
  const supabase = useMemo(() => createClient(), []);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    role: "sales" as Role,
  });

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    setUsers((data as Profile[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const createUser = async () => {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(json.error || "Kullanıcı oluşturulamadı.");
      return;
    }
    setModalOpen(false);
    setForm({ email: "", password: "", full_name: "", role: "sales" });
    load();
  };

  const updateUser = async (id: string, patch: Partial<Profile>) => {
    await supabase.from("profiles").update(patch).eq("id", id);
    load();
  };

  const deleteUser = async (id: string) => {
    if (!window.confirm("Kullanıcı silinsin mi?")) return;
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const json = await res.json();
      alert("Silinemedi: " + (json.error || ""));
      return;
    }
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Kullanıcılar</h2>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> Yeni Kullanıcı
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : users.length === 0 ? (
        <EmptyState message="Kullanıcı yok." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-4 py-3 font-medium">Ad / E-posta</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Durum</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.full_name || "-"}</div>
                    <div className="text-xs text-gray-500">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={u.role}
                      onChange={(e) => updateUser(u.id, { role: e.target.value as Role })}
                      className="w-36"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => updateUser(u.id, { is_active: !u.is_active })}>
                      <Badge color={u.is_active ? "green" : "gray"}>
                        {u.is_active ? "Aktif" : "Pasif"}
                      </Badge>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => deleteUser(u.id)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      title="Sil"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Yeni Kullanıcı">
        <div className="space-y-3">
          <Field label="Ad Soyad">
            <Input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </Field>
          <Field label="E-posta" required>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Şifre" required>
            <Input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="En az 6 karakter"
            />
          </Field>
          <Field label="Rol" required>
            <Select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              İptal
            </Button>
            <Button onClick={createUser} disabled={saving}>
              {saving ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : "Oluştur"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
