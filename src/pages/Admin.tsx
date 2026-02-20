import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Shield,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Users,
  BarChart3,
  Star,
  Upload,
  X,
  Key,
  UserPlus,
  Check,
  PlusCircle,
  RotateCcw,
} from "lucide-react";

interface Site {
  id: number;
  name: string;
  url: string;
  logo_path: string;
}

interface AdminAccount {
  id: number;
  username: string;
  created_at: string;
}

interface Proposal {
  id: number;
  name: string;
  url: string;
  logo_path: string;
  status: "pending" | "accepted" | "rejected";
  type: "new_site" | "modification";
  site_id: number | null;
  modification_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

interface Stats {
  totalSites: number;
  totalVotes: number;
  totalCategoryVotes: number;
}

interface SiteFormData {
  name: string;
  url: string;
  logo_path: string;
}

// ─── Logo du site ─────────────────────────────────────────────────────────────
function SiteLogo({ site }: { site: { name: string; logo_path: string } }) {
  const [imgError, setImgError] = useState(false);
  if (imgError || !site.logo_path) {
    return (
      <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center font-bold text-xs text-primary shrink-0">
        {site.name.charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={site.logo_path}
      alt={site.name}
      className="w-8 h-8 rounded-lg object-cover shrink-0"
      onError={() => setImgError(true)}
    />
  );
}

// ─── Composant upload image ───────────────────────────────────────────────────
function LogoUploader({ value, onChange }: { value: string; onChange: (path: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(value || null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Fichier trop lourd (max 2 MB).");
      return;
    }
    const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!ALLOWED.includes(file.type)) {
      toast.error("Type non autorisé. Utilisez JPG, PNG, WebP ou GIF.");
      return;
    }
    // Prévisualisation locale immédiate
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      const result = await api.uploadLogo(file);
      onChange(result.path);
      toast.success("Logo uploadé !");
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'upload");
      setPreview(value || null);
    } finally {
      setUploading(false);
    }
  }

  function clearLogo() {
    setPreview(null);
    onChange("");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-3">
      {preview ? (
        <div className="relative w-20 h-20">
          <img
            src={preview}
            alt="Prévisualisation"
            className="w-20 h-20 rounded-xl object-cover border border-border"
          />
          <button
            type="button"
            onClick={clearLogo}
            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:opacity-80"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center text-muted-foreground">
          <Upload className="w-6 h-6" />
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
        className="gap-2"
      >
        {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
        {uploading ? "Upload en cours..." : "Choisir un fichier"}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFile}
      />
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Ou entrez une URL / chemin</Label>
        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setPreview(e.target.value || null);
          }}
          placeholder="/logos/mon-site.png"
          className="text-sm"
        />
      </div>
    </div>
  );
}

// ─── Login Form ───────────────────────────────────────────────────────────────
function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [honeypot, setHoneypot] = useState(""); // Piège à bots

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (honeypot) { toast.error("Erreur de connexion."); return; }
    setLoading(true);
    try {
      const result = await api.login(username, password);
      localStorage.setItem("admin_token", result.token);
      toast.success("Connexion réussie !");
      onLogin();
    } catch (err: any) {
      toast.error(err.message || "Identifiants invalides");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Card className="w-full max-w-md animate-fade-in-up">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Panel Admin</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Connectez-vous pour accéder au tableau de bord
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Honeypot invisible pour les humains */}
            <div style={{ position: "absolute", left: "-9999px", opacity: 0, pointerEvents: "none" }} aria-hidden="true">
              <input type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Nom d'utilisateur</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" autoComplete="username" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Se connecter
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [allProposals, setAllProposals] = useState<Proposal[]>([]);
  const [proposalFilter, setProposalFilter] = useState<"pending" | "accepted" | "rejected">("pending");
  const [proposalActionLoading, setProposalActionLoading] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);

  // ID de l'admin connecté (depuis le JWT)
  const currentAdminId = (() => {
    try {
      const token = localStorage.getItem("admin_token");
      if (!token) return null;
      const payload = JSON.parse(atob(token.split(".")[1]));
      return payload.id as number;
    } catch { return null; }
  })();

  // ── État dialogs site ──
  const [siteDialogOpen, setSiteDialogOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [siteForm, setSiteForm] = useState<SiteFormData>({ name: "", url: "", logo_path: "" });
  const [formLoading, setFormLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingSite, setDeletingSite] = useState<Site | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [scoreAdjustments, setScoreAdjustments] = useState<Record<number, string>>({});

  // ── État reset votes ──
  const [resetVotesDialogOpen, setResetVotesDialogOpen] = useState(false);
  const [resettingSite, setResettingSite] = useState<Site | null>(null);
  const [resetVotesLoading, setResetVotesLoading] = useState(false);

  // ── État dialogs admin ──
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [newAdminUsername, setNewAdminUsername] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [adminFormLoading, setAdminFormLoading] = useState(false);
  const [deleteAdminDialogOpen, setDeleteAdminDialogOpen] = useState(false);
  const [deletingAdmin, setDeletingAdmin] = useState<AdminAccount | null>(null);
  const [deleteAdminLoading, setDeleteAdminLoading] = useState(false);
  const [pwDialogOpen, setPwDialogOpen] = useState(false);
  const [pwAdmin, setPwAdmin] = useState<AdminAccount | null>(null);
  const [newPw, setNewPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  const proposals = allProposals.filter((p) => p.status === proposalFilter);

  const fetchProposals = useCallback(async () => {
    try {
      const data = await api.getProposals(undefined);
      setAllProposals(data);
    } catch { /* silently ignore */ }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [statsData, sitesData, adminsData] = await Promise.all([
        api.getStats(),
        api.getSites(),
        api.getAdmins(),
      ]);
      setStats(statsData);
      setSites(sitesData);
      setAdmins(adminsData);
      await fetchProposals();
    } catch (err: any) {
      const msg: string = err.message || "";
      if (msg.includes("401") || msg.includes("Unauthorized") || msg.includes("token")) {
        toast.error("Session expirée, veuillez vous reconnecter");
        localStorage.removeItem("admin_token");
        onLogout();
      } else {
        toast.error("Erreur lors du chargement");
      }
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleProposalAction(id: number, action: "accept" | "reject") {
    setProposalActionLoading((prev) => ({ ...prev, [id]: true }));
    const proposal = proposals.find((p) => p.id === id);
    try {
      if (action === "accept") {
        await api.acceptProposal(id);
        toast.success(
          proposal?.type === "modification"
            ? "Signalement accepté et site mis à jour !"
            : "Proposition acceptée et site ajouté !"
        );
        fetchData();
      } else {
        await api.rejectProposal(id);
        toast.success("Proposition refusée.");
      }
      fetchProposals();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors du traitement");
    } finally {
      setProposalActionLoading((prev) => ({ ...prev, [id]: false }));
    }
  }

  function handleProposalFilterChange(status: "pending" | "accepted" | "rejected") {
    setProposalFilter(status);
  }

  // ── Handlers site ──
  function openCreateDialog() {
    setEditingSite(null);
    setSiteForm({ name: "", url: "", logo_path: "" });
    setSiteDialogOpen(true);
  }
  function openEditDialog(site: Site) {
    setEditingSite(site);
    setSiteForm({ name: site.name, url: site.url, logo_path: site.logo_path });
    setSiteDialogOpen(true);
  }

  async function handleSiteSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true);
    try {
      if (editingSite) {
        await api.updateSite(editingSite.id, siteForm);
        toast.success("Site modifié !");
      } else {
        await api.createSite(siteForm);
        toast.success("Site ajouté !");
      }
      setSiteDialogOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la sauvegarde");
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDeleteSite() {
    if (!deletingSite) return;
    setDeleteLoading(true);
    try {
      await api.deleteSite(deletingSite.id);
      toast.success("Site supprimé !");
      setDeleteDialogOpen(false);
      setDeletingSite(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la suppression");
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleResetVotes() {
    if (!resettingSite) return;
    setResetVotesLoading(true);
    try {
      await api.resetSiteVotes(resettingSite.id);
      toast.success(`Votes de "${resettingSite.name}" réinitialisés.`);
      setResetVotesDialogOpen(false);
      setResettingSite(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la réinitialisation");
    } finally {
      setResetVotesLoading(false);
    }
  }

  async function handleScoreAdjust(siteId: number) {
    const value = parseInt(scoreAdjustments[siteId] || "0", 10);
    if (isNaN(value) || value === 0) { toast.error("Entrez un nombre valide"); return; }
    try {
      await api.adjustScores(siteId, { upvoteAdjust: value });
      toast.success(`Score ajusté de ${value > 0 ? "+" : ""}${value}`);
      setScoreAdjustments((prev) => ({ ...prev, [siteId]: "" }));
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'ajustement");
    }
  }

  // ── Handlers admin ──
  async function handleCreateAdmin(e: React.FormEvent) {
    e.preventDefault();
    setAdminFormLoading(true);
    try {
      await api.createAdmin(newAdminUsername, newAdminPassword);
      toast.success(`Compte "${newAdminUsername}" créé !`);
      setAdminDialogOpen(false);
      setNewAdminUsername(""); setNewAdminPassword("");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la création");
    } finally {
      setAdminFormLoading(false);
    }
  }

  async function handleDeleteAdmin() {
    if (!deletingAdmin) return;
    setDeleteAdminLoading(true);
    try {
      await api.deleteAdmin(deletingAdmin.id);
      toast.success(`Compte "${deletingAdmin.username}" supprimé.`);
      setDeleteAdminDialogOpen(false);
      setDeletingAdmin(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la suppression");
    } finally {
      setDeleteAdminLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!pwAdmin) return;
    setPwLoading(true);
    try {
      await api.changeAdminPassword(pwAdmin.id, newPw);
      toast.success("Mot de passe modifié !");
      setPwDialogOpen(false); setNewPw(""); setPwAdmin(null);
    } catch (err: any) {
      toast.error(err.message || "Erreur lors du changement");
    } finally {
      setPwLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 sm:py-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10 animate-fade-in-up stagger-1">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold flex items-center gap-2 sm:gap-3">
          <Shield className="w-6 h-6 sm:w-8 sm:h-8 text-primary shrink-0" />
          Panel Admin
        </h1>
        <Button
          variant="outline"
          onClick={() => { localStorage.removeItem("admin_token"); toast.success("Déconnexion réussie"); onLogout(); }}
          className="gap-2 self-start sm:self-auto"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10 animate-fade-in-up stagger-2">
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-xl bg-primary/10"><BarChart3 className="w-6 h-6 text-primary" /></div>
              <div><p className="text-2xl font-bold">{stats.totalSites}</p><p className="text-sm text-muted-foreground">Total Sites</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-xl bg-green-500/10"><Users className="w-6 h-6 text-green-500" /></div>
              <div><p className="text-2xl font-bold">{stats.totalVotes}</p><p className="text-sm text-muted-foreground">Total Votes</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-xl bg-yellow-500/10"><Star className="w-6 h-6 text-yellow-500" /></div>
              <div><p className="text-2xl font-bold">{stats.totalCategoryVotes}</p><p className="text-sm text-muted-foreground">Votes catégorie</p></div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Gestion des sites */}
      <div className="mb-10 animate-fade-in-up stagger-3">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg sm:text-xl font-bold">Gestion des sites</h2>
          <Button onClick={openCreateDialog} size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Ajouter un site</span>
            <span className="sm:hidden">Ajouter</span>
          </Button>
        </div>
        <div className="rounded-xl border bg-card overflow-x-auto">
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Logo</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Logo Path</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map((site) => (
                <TableRow key={site.id}>
                  <TableCell><SiteLogo site={site} /></TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{site.name}</TableCell>
                  <TableCell>
                    <a href={site.url} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary transition-colors whitespace-nowrap">{site.url}</a>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{site.logo_path}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEditDialog(site)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon-sm" className="text-orange-500 hover:text-orange-500" title="Réinitialiser les votes" onClick={() => { setResettingSite(site); setResetVotesDialogOpen(true); }}><RotateCcw className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => { setDeletingSite(site); setDeleteDialogOpen(true); }}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Ajustement des scores */}
      <div className="mb-10 animate-fade-in-up stagger-4">
        <h2 className="text-lg sm:text-xl font-bold mb-4">Ajustement des scores</h2>
        <div className="rounded-xl border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Ajustement</TableHead>
                <TableHead className="w-24 sm:w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map((site) => (
                <TableRow key={site.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 sm:gap-3">
                      <SiteLogo site={site} />
                      <span className="font-medium text-sm sm:text-base">{site.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input type="number" placeholder="ex: 5" value={scoreAdjustments[site.id] || ""} onChange={(e) => setScoreAdjustments((prev) => ({ ...prev, [site.id]: e.target.value }))} className="w-20 sm:w-32" />
                  </TableCell>
                  <TableCell>
                    <Button variant="secondary" size="sm" onClick={() => handleScoreAdjust(site.id)}>Appliquer</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Propositions de sites */}
      <div className="mb-10 animate-fade-in-up stagger-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-primary" />
            Propositions &amp; signalements
            {allProposals.filter((p) => p.status === "pending").length > 0 && proposalFilter !== "pending" && (
              <span className="ml-1 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                {allProposals.filter((p) => p.status === "pending").length}
              </span>
            )}
          </h2>
          {/* Filtres */}
          <div className="flex items-center gap-1 text-sm">
            {(["pending", "accepted", "rejected"] as const).map((s) => (
              <button
                key={s}
                onClick={() => handleProposalFilterChange(s)}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  proposalFilter === s
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {s === "pending" ? "En attente" : s === "accepted" ? "Acceptées" : "Refusées"}
              </button>
            ))}
          </div>
        </div>

        {proposals.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground text-sm">
            {proposalFilter === "pending"
              ? "Aucune proposition ou signalement en attente."
              : proposalFilter === "accepted"
              ? "Aucune proposition ou signalement accepté."
              : "Aucune proposition ou signalement refusé."}
          </div>
        ) : (
          <div className="rounded-xl border bg-card overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Icône</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>Détails</TableHead>
                  <TableHead>Soumis le</TableHead>
                  {proposalFilter === "pending" && (
                    <TableHead className="text-right w-44">Actions</TableHead>
                  )}
                  {proposalFilter !== "pending" && (
                    <TableHead className="w-28">Statut</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {proposals.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      {p.logo_path ? (
                        <img
                          src={p.logo_path}
                          alt={p.name}
                          className="w-9 h-9 rounded-lg object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center font-bold text-xs text-primary">
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <span>{p.name}</span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded font-medium w-fit ${
                            p.type === "modification"
                              ? "bg-amber-500/10 text-amber-600"
                              : "bg-primary/10 text-primary"
                          }`}
                        >
                          {p.type === "modification" ? "Modification" : "Nouveau site"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5 text-sm">
                        {p.type === "new_site" ? (
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-primary transition-colors whitespace-nowrap"
                          >
                            {p.url.length > 40 ? p.url.slice(0, 40) + "…" : p.url}
                          </a>
                        ) : (
                          <>
                            {p.url ? (
                              <a
                                href={p.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-amber-600 hover:text-amber-700 transition-colors whitespace-nowrap font-medium"
                              >
                                → {p.url.length > 36 ? p.url.slice(0, 36) + "…" : p.url}
                              </a>
                            ) : null}
                            {p.modification_note ? (
                              <span className="text-muted-foreground italic">
                                {p.modification_note.length > 60
                                  ? p.modification_note.slice(0, 60) + "…"
                                  : p.modification_note}
                              </span>
                            ) : null}
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(p.submitted_at).toLocaleDateString("fr-FR")}
                    </TableCell>
                    {proposalFilter === "pending" && (
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-green-600 border-green-600/30 hover:bg-green-600/10 hover:text-green-600"
                            disabled={proposalActionLoading[p.id]}
                            onClick={() => handleProposalAction(p.id, "accept")}
                          >
                            {proposalActionLoading[p.id] ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                            Accepter
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1.5 text-destructive hover:text-destructive"
                            disabled={proposalActionLoading[p.id]}
                            onClick={() => handleProposalAction(p.id, "reject")}
                          >
                            {proposalActionLoading[p.id] ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <X className="w-3 h-3" />
                            )}
                            Refuser
                          </Button>
                        </div>
                      </TableCell>
                    )}
                    {proposalFilter !== "pending" && (
                      <TableCell>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            p.status === "accepted"
                              ? "bg-green-500/10 text-green-600"
                              : "bg-destructive/10 text-destructive"
                          }`}
                        >
                          {p.status === "accepted" ? "Acceptée" : "Refusée"}
                        </span>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Gestion des comptes admins */}
      <div className="animate-fade-in-up stagger-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Comptes administrateurs
          </h2>
          <Button onClick={() => setAdminDialogOpen(true)} size="sm" className="gap-2">
            <UserPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Ajouter un admin</span>
            <span className="sm:hidden">Ajouter</span>
          </Button>
        </div>
        <div className="rounded-xl border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom d'utilisateur</TableHead>
                <TableHead>Créé le</TableHead>
                <TableHead className="text-right w-40">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.map((admin) => (
                <TableRow key={admin.id}>
                  <TableCell className="font-medium">
                    {admin.username}
                    {admin.id === currentAdminId && (
                      <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">vous</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(admin.created_at).toLocaleDateString("fr-FR")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" title="Changer le mot de passe" onClick={() => { setPwAdmin(admin); setNewPw(""); setPwDialogOpen(true); }}>
                        <Key className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" title="Supprimer" disabled={admin.id === currentAdminId} onClick={() => { setDeletingAdmin(admin); setDeleteAdminDialogOpen(true); }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Dialog créer/modifier site */}
      <Dialog open={siteDialogOpen} onOpenChange={setSiteDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSite ? "Modifier le site" : "Ajouter un site"}</DialogTitle>
            <DialogDescription>{editingSite ? "Modifiez les informations du site." : "Renseignez les informations du nouveau site."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSiteSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="site-name">Nom</Label>
              <Input id="site-name" value={siteForm.name} onChange={(e) => setSiteForm((f) => ({ ...f, name: e.target.value }))} placeholder="CinePulse" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-url">URL</Label>
              <Input id="site-url" value={siteForm.url} onChange={(e) => setSiteForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://cinepulse.example.com" required />
            </div>
            <div className="space-y-2">
              <Label>Logo</Label>
              <LogoUploader value={siteForm.logo_path} onChange={(path) => setSiteForm((f) => ({ ...f, logo_path: path }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSiteDialogOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={formLoading}>
                {formLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {editingSite ? "Sauvegarder" : "Ajouter"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog réinitialiser votes site */}
      <Dialog open={resetVotesDialogOpen} onOpenChange={setResetVotesDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Réinitialiser les votes</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer <strong>tous les votes</strong> de{" "}
              <strong>{resettingSite?.name}</strong> ?{" "}
              Cette action est irréversible et remettra le score à zéro.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetVotesDialogOpen(false)}>Annuler</Button>
            <Button
              variant="destructive"
              onClick={handleResetVotes}
              disabled={resetVotesLoading}
              className="gap-2"
            >
              {resetVotesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              Réinitialiser
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog supprimer site */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
            <DialogDescription>Êtes-vous sûr de vouloir supprimer <strong>{deletingSite?.name}</strong> ? Cette action est irréversible et supprimera tous les votes associés.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDeleteSite} disabled={deleteLoading}>
              {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog créer admin */}
      <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer un compte administrateur</DialogTitle>
            <DialogDescription>Le nouveau compte aura accès à l'intégralité du panel.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateAdmin} className="space-y-4">
            <div className="space-y-2">
              <Label>Nom d'utilisateur</Label>
              <Input value={newAdminUsername} onChange={(e) => setNewAdminUsername(e.target.value)} placeholder="nouvel_admin" required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_-]+" title="Lettres, chiffres, _ et - uniquement" />
            </div>
            <div className="space-y-2">
              <Label>Mot de passe</Label>
              <Input type="password" value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)} placeholder="••••••••" required minLength={8} />
              <p className="text-xs text-muted-foreground">Minimum 8 caractères.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setAdminDialogOpen(false); setNewAdminUsername(""); setNewAdminPassword(""); }}>Annuler</Button>
              <Button type="submit" disabled={adminFormLoading}>
                {adminFormLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Créer le compte
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog supprimer admin */}
      <Dialog open={deleteAdminDialogOpen} onOpenChange={setDeleteAdminDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer un compte admin</DialogTitle>
            <DialogDescription>Êtes-vous sûr de vouloir supprimer le compte <strong>{deletingAdmin?.username}</strong> ? Cette action est irréversible.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAdminDialogOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDeleteAdmin} disabled={deleteAdminLoading}>
              {deleteAdminLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog changer mot de passe admin */}
      <Dialog open={pwDialogOpen} onOpenChange={setPwDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Changer le mot de passe</DialogTitle>
            <DialogDescription>Nouveau mot de passe pour <strong>{pwAdmin?.username}</strong>.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label>Nouveau mot de passe</Label>
              <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="••••••••" required minLength={8} />
              <p className="text-xs text-muted-foreground">Minimum 8 caractères.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setPwDialogOpen(false); setNewPw(""); setPwAdmin(null); }}>Annuler</Button>
              <Button type="submit" disabled={pwLoading}>
                {pwLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Sauvegarder
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function Admin() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem("admin_token"));
  return isLoggedIn ? (
    <AdminDashboard onLogout={() => setIsLoggedIn(false)} />
  ) : (
    <LoginForm onLogin={() => setIsLoggedIn(true)} />
  );
}
