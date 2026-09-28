import React, { useState, useEffect, useMemo } from "react";
import { adminService, AdminUser, UserMetrics } from "../../services/adminService";
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
  UserPlus,
  Download,
  Calendar,
  CreditCard,
  X,
  Check,
  Filter,
} from "lucide-react";
import { audioEngine } from "../../utils/audioEngine";

export const UserManagement: React.FC = () => {
  const { showToast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");
  const [planFilter, setPlanFilter] = useState<"all" | "premium" | "trial" | "basic" | "expired">("all");
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");
  const [newPlan, setNewPlan] = useState<"basic" | "trial" | "premium">("premium");
  const [newDuration, setNewDuration] = useState<number>(30);
  const [isCreating, setIsCreating] = useState(false);

  // Edit Subscription Modal State
  const [editingSubUser, setEditingSubUser] = useState<AdminUser | null>(null);
  const [subStatus, setSubStatus] = useState("active");
  const [subPlan, setSubPlan] = useState("premium");
  const [subExpiresAt, setSubExpiresAt] = useState("");
  const [isUpdatingSub, setIsUpdatingSub] = useState(false);

  // Confirm delete modal state
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);

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

  const metrics: UserMetrics = useMemo(() => {
    return adminService.getUserMetrics(users);
  }, [users]);

  const handleRoleToggle = async (user: AdminUser) => {
    audioEngine.play("click");
    const targetRole = user.role === "admin" ? "user" : "admin";
    if (user.role === "admin" && metrics.adminCount <= 1) {
      audioEngine.play("error");
      showToast(
        "Rétrogradation refusée : ce compte est le dernier administrateur.",
        "error",
      );
      return;
    }
    setProcessingId(user.id);
    try {
      const ok = await adminService.updateUserRole(user.id, targetRole);
      if (ok) {
        audioEngine.play("success");
        showToast(`Rôle mis à jour : ${targetRole.toUpperCase()}`, "success");
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, role: targetRole } : u)),
        );
      } else {
        throw new Error("Échec de la mise à jour");
      }
    } catch (e: unknown) {
      audioEngine.play("error");
      showToast("Erreur mise à jour rôle", "error");
    } finally {
      setProcessingId(null);
    }
  };

  const handleOpenEditSub = (user: AdminUser) => {
    audioEngine.play("click");
    setEditingSubUser(user);
    setSubStatus(user.subscription?.status || "active");
    setSubPlan(user.subscription?.plan || "premium");
    // Aucune date inventée : sans abonnement existant, le champ reste vide et
    // doit être renseigné explicitement avant l'enregistrement.
    setSubExpiresAt(
      user.subscription?.expires_at
        ? new Date(user.subscription.expires_at).toISOString().split("T")[0]
        : "",
    );
  };

  const handleSaveSub = async () => {
    if (!editingSubUser) return;
    if (!subExpiresAt) {
      audioEngine.play("error");
      showToast("Veuillez renseigner une date d'expiration.", "error");
      return;
    }
    audioEngine.play("click");
    setIsUpdatingSub(true);
    try {
      const newSub = {
        status: subStatus,
        plan: subPlan,
        expires_at: new Date(subExpiresAt).toISOString(),
      };
      const ok = await adminService.updateUserSubscription(editingSubUser.id, newSub);
      if (ok) {
        audioEngine.play("success");
        showToast("Abonnement mis à jour avec succès", "success");
        setUsers((prev) =>
          prev.map((u) =>
            u.id === editingSubUser.id ? { ...u, subscription: newSub } : u,
          ),
        );
        setEditingSubUser(null);
      } else {
        throw new Error("Erreur de sauvegarde");
      }
    } catch {
      audioEngine.play("error");
      showToast("Erreur modification abonnement", "error");
    } finally {
      setIsUpdatingSub(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newEmail.includes("@")) {
      showToast("Email invalide", "error");
      return;
    }
    audioEngine.play("click");
    setIsCreating(true);
    try {
      const created = await adminService.createUser({
        email: newEmail,
        role: newRole,
        plan: newPlan,
        durationDays: newDuration,
      });
      audioEngine.play("success");
      showToast(`Utilisateur ${created.email} créé !`, "success");
      setUsers((prev) => [created, ...prev]);
      setShowAddModal(false);
      setNewEmail("");
    } catch (err) {
      audioEngine.play("error");
      showToast("Erreur lors de la création", "error");
    } finally {
      setIsCreating(false);
    }
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    audioEngine.play("click");
    setProcessingId(userToDelete.id);
    try {
      const ok = await adminService.deleteUser(userToDelete.id);
      if (ok) {
        audioEngine.play("success");
        showToast("Utilisateur supprimé", "success");
        setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id));
        setUserToDelete(null);
      } else {
        throw new Error("Erreur");
      }
    } catch {
      audioEngine.play("error");
      showToast("Erreur suppression", "error");
    } finally {
      setProcessingId(null);
    }
  };

  const filteredUsers = useMemo(() => {
    const term = searchTerm.toLowerCase();
    const now = Date.now();
    return users.filter((u) => {
      const matchesSearch =
        u.email?.toLowerCase().includes(term) || u.id.toLowerCase().includes(term);

      if (!matchesSearch) return false;

      if (roleFilter !== "all" && u.role !== roleFilter) return false;

      if (planFilter !== "all") {
        const sub = u.subscription;
        if (planFilter === "expired") {
          const isExpired = !sub || sub.status === "expired" || new Date(sub.expires_at).getTime() <= now;
          if (!isExpired) return false;
        } else {
          if (!sub || sub.plan !== planFilter) return false;
        }
      }

      return true;
    });
  }, [users, searchTerm, roleFilter, planFilter]);

  const getSubscriptionBadge = (sub: AdminUser["subscription"]) => {
    if (!sub) {
      return (
        <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-lg text-xs font-bold">
          Aucun
        </span>
      );
    }

    const isExpired = new Date(sub.expires_at).getTime() < Date.now();
    const isActive = (sub.status === "active" || sub.status === "trial") && !isExpired;
    const isPremium = sub.plan === "premium";
    const statusLabel =
      sub.status === "suspended" ? "Suspendu" : isActive ? "Actif" : "Expiré";

    return (
      <span
        className={`px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
          isActive
            ? isPremium
              ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
              : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
            : "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
        }`}
      >
        {isPremium && <Crown size={12} className="text-amber-500" />}
        <span>{sub.plan.toUpperCase()}</span>
        <span className="text-[10px] opacity-75">
          ({statusLabel})
        </span>
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-2xl">
            <Users size={22} />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-800 dark:text-white">
              {metrics.totalUsers}
            </div>
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Total Comptes
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded-2xl">
            <Crown size={22} />
          </div>
          <div>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {metrics.activeSubscribers}
            </div>
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Abonnés Actifs
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-2xl">
            <ShieldAlert size={22} />
          </div>
          <div>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
              {metrics.adminCount}
            </div>
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Administrateurs
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 rounded-2xl">
            <CreditCard size={22} />
          </div>
          <div>
            <div className="text-2xl font-black text-cyan-600 dark:text-cyan-400">
              {metrics.activeRate}%
            </div>
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Taux Conversion
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-3">
              <Users className="text-indigo-600" /> Gestion Utilisateurs & Licences
            </h3>
            <p className="text-slate-400 text-xs font-medium mt-1">
              Contrôle d'accès RLS, rôles administratifs et abonnements
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <button
              onClick={() => {
                audioEngine.play("click");
                setShowAddModal(true);
              }}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
            >
              <UserPlus size={14} /> Créer Utilisateur
            </button>

            <button
              onClick={() => {
                audioEngine.play("click");
                adminService.exportUsersToCSV(users);
                showToast("Export CSV généré", "success");
              }}
              className="p-2.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-all text-xs font-bold"
              title="Exporter en CSV"
            >
              <Download size={16} />
            </button>

            <button
              onClick={loadUsers}
              className="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-xl hover:rotate-180 transition-all"
              title="Actualiser la liste"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6 p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-800">
          <div className="relative">
            <input
              type="text"
              placeholder="Rechercher par email ou UUID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium focus:ring-2 ring-indigo-500 outline-none"
            />
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={15}
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter size={14} className="text-slate-400 shrink-0" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              className="w-full px-3 py-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium focus:ring-2 ring-indigo-500 outline-none"
            >
              <option value="all">Tous les rôles</option>
              <option value="admin">Administrateurs uniquement</option>
              <option value="user">Utilisateurs standards</option>
            </select>
          </div>

          <div>
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value as any)}
              className="w-full px-3 py-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium focus:ring-2 ring-indigo-500 outline-none"
            >
              <option value="all">Tous les abonnements</option>
              <option value="premium">Premium uniquement</option>
              <option value="trial">Essai (Trial)</option>
              <option value="basic">Basic</option>
              <option value="expired">Expirés / Sans abonnement</option>
            </select>
          </div>
        </div>

        {error ? (
          <div className="p-8 rounded-2xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-center">
            <AlertTriangle className="mx-auto text-rose-500 mb-4" size={32} />
            <h4 className="text-rose-700 dark:text-rose-300 font-bold mb-2">
              Accès aux données impossible
            </h4>
            <p className="text-xs text-rose-600 dark:text-rose-400 mb-4">{error}</p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar rounded-2xl border border-slate-100 dark:border-slate-700">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                <tr>
                  <th className="p-4 rounded-tl-2xl">Utilisateur</th>
                  <th className="p-4">Rôle</th>
                  <th className="p-4">Abonnement & Plan</th>
                  <th className="p-4">Expiration</th>
                  <th className="p-4">Dernière Connexion</th>
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
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-[200px]">
                        {user.id}
                      </div>
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => handleRoleToggle(user)}
                        disabled={processingId === user.id}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all active:scale-95 ${
                          user.role === "admin"
                            ? "bg-indigo-600 text-white border-indigo-500"
                            : "bg-slate-100 dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-white hover:border-indigo-300"
                        }`}
                        title="Cliquer pour basculer le rôle"
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
                      <div
                        onClick={() => handleOpenEditSub(user)}
                        className="cursor-pointer inline-block"
                        title="Cliquer pour modifier l'abonnement"
                      >
                        {getSubscriptionBadge(user.subscription)}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-slate-500 text-xs font-mono">
                        {user.subscription?.expires_at
                          ? new Date(user.subscription.expires_at).toLocaleDateString()
                          : "—"}
                      </span>
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
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEditSub(user)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all"
                          title="Modifier l'abonnement"
                        >
                          <CreditCard size={15} />
                        </button>
                        <button
                          onClick={() => setUserToDelete(user)}
                          disabled={processingId === user.id}
                          className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                          title="Supprimer le compte"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredUsers.length === 0 && !loading && (
              <div className="p-8 text-center text-slate-400 italic">
                Aucun utilisateur correspondant au filtre.
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL: CREATE USER */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 md:p-8 max-w-md w-full border border-slate-100 dark:border-slate-700 shadow-2xl relative">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute right-6 top-6 p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-2xl">
                <UserPlus size={20} />
              </div>
              <h4 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">
                Nouveau Compte
              </h4>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider mb-1 block">
                  Email Utilisateur
                </label>
                <input
                  type="email"
                  required
                  placeholder="nom@exemple.ci"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold focus:ring-2 ring-indigo-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider mb-1 block">
                    Rôle
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold outline-none"
                  >
                    <option value="user">Utilisateur</option>
                    <option value="admin">Administrateur</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider mb-1 block">
                    Formule
                  </label>
                  <select
                    value={newPlan}
                    onChange={(e) => setNewPlan(e.target.value as any)}
                    className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold outline-none"
                  >
                    <option value="basic">Basic</option>
                    <option value="trial">Essai (Trial)</option>
                    <option value="premium">Premium Elite</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider mb-1 block">
                  Durée de validité (Jours)
                </label>
                <input
                  type="number"
                  min="1"
                  max="3650"
                  value={newDuration}
                  onChange={(e) => setNewDuration(parseInt(e.target.value, 10) || 30)}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold outline-none"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-black uppercase tracking-wider"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg"
                >
                  {isCreating ? <RefreshCw className="animate-spin" size={14} /> : <Check size={14} />}
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT SUBSCRIPTION */}
      {editingSubUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 md:p-8 max-w-md w-full border border-slate-100 dark:border-slate-700 shadow-2xl relative">
            <button
              onClick={() => setEditingSubUser(null)}
              className="absolute right-6 top-6 p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-2xl">
                <Crown size={20} />
              </div>
              <div>
                <h4 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">
                  Gestion Licence
                </h4>
                <p className="text-xs text-slate-400 truncate max-w-[260px]">
                  {editingSubUser.email}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider mb-1 block">
                  Statut de l'abonnement
                </label>
                <select
                  value={subStatus}
                  onChange={(e) => setSubStatus(e.target.value)}
                  className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold outline-none"
                >
                  <option value="active">Actif</option>
                  <option value="trial">Période d'essai</option>
                  <option value="expired">Expiré</option>
                  <option value="suspended">Suspendu</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider mb-1 block">
                  Plan Tarifaire
                </label>
                <select
                  value={subPlan}
                  onChange={(e) => setSubPlan(e.target.value)}
                  className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold outline-none"
                >
                  <option value="basic">Standard (Basic)</option>
                  <option value="trial">Essai Pro</option>
                  <option value="premium">Platinum Elite</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider mb-1 block">
                  Date d'expiration
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={subExpiresAt}
                    onChange={(e) => setSubExpiresAt(e.target.value)}
                    className="w-full px-4 py-3 pl-10 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold outline-none"
                  />
                  <Calendar
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditingSubUser(null)}
                  className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-black uppercase tracking-wider"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSaveSub}
                  disabled={isUpdatingSub}
                  className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg"
                >
                  {isUpdatingSub ? (
                    <RefreshCw className="animate-spin" size={14} />
                  ) : (
                    <Check size={14} />
                  )}
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 md:p-8 max-w-sm w-full border border-rose-200 dark:border-rose-900/40 shadow-2xl text-center">
            <div className="w-14 h-14 bg-rose-100 dark:bg-rose-900/30 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Trash2 size={24} />
            </div>
            <h4 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-tight mb-2">
              Supprimer l'utilisateur ?
            </h4>
            <p className="text-xs text-slate-500 mb-6">
              Cette action est irréversible pour <strong className="text-slate-700 dark:text-slate-300">{userToDelete.email}</strong>.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setUserToDelete(null)}
                className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-black uppercase"
              >
                Annuler
              </button>
              <button
                onClick={confirmDeleteUser}
                disabled={!!processingId}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black uppercase shadow-lg shadow-rose-600/20"
              >
                {processingId ? "Suppression..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
