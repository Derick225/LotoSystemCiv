import React, { useState, useEffect } from "react";
import { adminService, AdminUser } from "../../services/adminService";
import { useToast } from "../ui/Toast";
import {
  Users,
  ShieldAlert,
  Trash2,
  Search,
  UserCheck,
  Crown,
  Clock,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { audioEngine } from "../../utils/audioEngine";

export const UserManagement: React.FC = () => {
  const { showToast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadUsers = async () => {
    audioEngine.play("scan");
    setLoading(true);
    setError(null);
    try {
      const data = await adminService.fetchUsers();
      if (Array.isArray(data)) {
        setUsers(data);
      } else {
        throw new Error("Format de données invalide reçu du serveur.");
      }
      audioEngine.play("success");
    } catch (e: unknown) {
      console.error(e);
      setError(
        (e instanceof Error ? e.message : String(e)) || "Erreur de chargement.",
      );
      showToast(
        (e instanceof Error ? e.message : String(e)) ||
          "Erreur chargement utilisateurs",
        "error",
      );
      audioEngine.play("error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleRoleUpdate = async (userId: string, currentRole: string) => {
    audioEngine.play("click");
    const newRole = currentRole === "admin" ? "user" : "admin";
    if (
      !confirm(
        `Voulez-vous vraiment passer cet utilisateur en ${newRole.toUpperCase()} ?`,
      )
    )
      return;

    setProcessingId(userId);
    try {
      const success = await adminService.updateUserRole(userId, newRole);
      if (!success) {
        throw new Error("Le serveur a retourné un statut d'échec pour la mise à jour.");
      }
      audioEngine.play("success");
      showToast(`Rôle mis à jour : ${newRole}`, "success");
      // Mise à jour optimiste locale
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)),
      );
    } catch (e: unknown) {
      audioEngine.play("error");
      showToast("Erreur mise à jour rôle", "error");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (userId: string) => {
    audioEngine.play("click");
    if (
      !confirm(
        "ATTENTION: Cette action est irréversible. Supprimer l'utilisateur ?",
      )
    )
      return;

    setProcessingId(userId);
    try {
      const success = await adminService.deleteUser(userId);
      if (!success) {
        throw new Error("Le serveur a retourné un statut d'échec pour la suppression.");
      }
      audioEngine.play("success");
      showToast("Utilisateur supprimé", "success");
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (e: unknown) {
      audioEngine.play("error");
      showToast("Erreur suppression", "error");
    } finally {
      setProcessingId(null);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.id.includes(searchTerm),
  );

  const getSubscriptionBadge = (sub: AdminUser["subscription"]) => {
    if (!sub)
      return (
        <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded text-xs font-bold">
          Inactif
        </span>
      );

    const isActive = sub.status === "active" || sub.status === "trial";
    const isPremium = sub.plan === "premium";

    return (
      <span
        className={`px-2 py-1 rounded text-xs font-bold flex items-center gap-1 w-fit ${isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}
      >
        {isPremium && <Crown size={10} />}
        {sub.status.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 animate-slide-up">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter flex items-center gap-3">
            <Users className="text-indigo-600" /> Gestion Accès
          </h3>
          <p className="text-slate-400 text-xs font-medium mt-1">
            {users.length} comptes enregistrés • Base Auth
          </p>
        </div>

        <div className="flex gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <input
              type="text"
              placeholder="Rechercher email ou ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-bold focus:ring-2 ring-indigo-500 outline-none"
            />
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
          </div>
          <button
            onClick={loadUsers}
            className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-2xl hover:rotate-180 transition-all"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-8 rounded-2xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-center">
          <AlertTriangle className="mx-auto text-rose-500 mb-4" size={32} />
          <h4 className="text-rose-700 dark:text-rose-300 font-bold mb-2">
            Accès aux données impossible
          </h4>
          <p className="text-xs text-rose-600 dark:text-rose-400 mb-4">
            {error}
          </p>
          <p className="text-[10px] text-slate-500">
            Vérifiez que votre email est dans la liste blanche des admins ou que
            les secrets Supabase (SERVICE_ROLE_KEY) sont configurés.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto custom-scrollbar rounded-2xl border border-slate-100 dark:border-slate-700">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 text-[10px] font-black uppercase tracking-widest">
              <tr>
                <th className="p-4 rounded-tl-2xl">Utilisateur</th>
                <th className="p-4">Rôle</th>
                <th className="p-4">Abonnement</th>
                <th className="p-4">Activité</th>
                <th className="p-4 text-right rounded-tr-2xl">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-medium">
              {filteredUsers.map((user) => (
                <tr
                  key={user.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors group"
                >
                  <td className="p-4">
                    <div className="font-bold text-slate-800 dark:text-white">
                      {user.email}
                    </div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">
                      {user.id}
                    </div>
                  </td>
                  <td className="p-4">
                    <button
                      onClick={() => handleRoleUpdate(user.id, user.role)}
                      disabled={!!processingId}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all active:scale-95 ${user.role === "admin" ? "bg-indigo-600 text-white border-indigo-500" : "bg-slate-100 dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-white hover:border-indigo-300"}`}
                    >
                      {user.role === "admin" ? (
                        <ShieldAlert size={12} />
                      ) : (
                        <UserCheck size={12} />
                      )}
                      <span className="text-[10px] font-black uppercase">
                        {user.role}
                      </span>
                    </button>
                  </td>
                  <td className="p-4">
                    {getSubscriptionBadge(user.subscription)}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Clock size={12} />
                      <span>
                        {user.last_sign_in
                          ? new Date(user.last_sign_in).toLocaleDateString()
                          : "Jamais"}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleDelete(user.id)}
                      disabled={!!processingId}
                      className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                      title="Supprimer le compte"
                    >
                      {processingId === user.id ? (
                        <RefreshCw
                          size={16}
                          className="animate-spin text-indigo-500"
                        />
                      ) : (
                        <Trash2 size={16} />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredUsers.length === 0 && !loading && (
            <div className="p-8 text-center text-slate-400 italic">
              Aucun utilisateur trouvé.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
