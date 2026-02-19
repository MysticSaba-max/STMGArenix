import { useEffect, useState, useCallback } from "react";
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
} from "lucide-react";

interface Site {
  id: number;
  name: string;
  url: string;
  logo_path: string;
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

// ============ Login Form ============
function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
            <div className="space-y-2">
              <Label htmlFor="username">Nom d'utilisateur</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                required
              />
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

// ============ Admin Dashboard ============
function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [siteDialogOpen, setSiteDialogOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [siteForm, setSiteForm] = useState<SiteFormData>({ name: "", url: "", logo_path: "" });
  const [formLoading, setFormLoading] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingSite, setDeletingSite] = useState<Site | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Score adjustment state
  const [scoreAdjustments, setScoreAdjustments] = useState<Record<number, string>>({});

  const fetchData = useCallback(async () => {
    try {
      const [statsData, sitesData] = await Promise.all([
        api.getStats(),
        api.getSites(),
      ]);
      setStats(statsData);
      setSites(sitesData);
    } catch (err: any) {
      if (err.message.includes("401") || err.message.includes("Unauthorized") || err.message.includes("token")) {
        toast.error("Session expirée, veuillez vous reconnecter");
        localStorage.removeItem("admin_token");
        onLogout();
      } else {
        toast.error("Erreur lors du chargement des données");
      }
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---- Site CRUD ----
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

  function openDeleteDialog(site: Site) {
    setDeletingSite(site);
    setDeleteDialogOpen(true);
  }

  async function handleSiteSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true);
    try {
      if (editingSite) {
        await api.updateSite(editingSite.id, siteForm);
        toast.success("Site modifié avec succès !");
      } else {
        await api.createSite(siteForm);
        toast.success("Site ajouté avec succès !");
      }
      setSiteDialogOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la sauvegarde");
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete() {
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

  async function handleScoreAdjust(siteId: number) {
    const value = parseInt(scoreAdjustments[siteId] || "0", 10);
    if (isNaN(value) || value === 0) {
      toast.error("Entrez un nombre valide (positif ou négatif)");
      return;
    }
    try {
      await api.adjustScores(siteId, { upvoteAdjust: value });
      toast.success(`Score ajusté de ${value > 0 ? "+" : ""}${value}`);
      setScoreAdjustments((prev) => ({ ...prev, [siteId]: "" }));
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'ajustement");
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
    <div className="container mx-auto px-4 py-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-10 animate-fade-in-up stagger-1">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3">
            <Shield className="w-8 h-8 text-primary" />
            Panel Admin
          </h1>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            localStorage.removeItem("admin_token");
            toast.success("Déconnexion réussie");
            onLogout();
          }}
          className="gap-2"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10 animate-fade-in-up stagger-2">
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-xl bg-primary/10">
                <BarChart3 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalSites}</p>
                <p className="text-sm text-muted-foreground">Total Sites</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-xl bg-green-500/10">
                <Users className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalVotes}</p>
                <p className="text-sm text-muted-foreground">Total Votes</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-xl bg-yellow-500/10">
                <Star className="w-6 h-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalCategoryVotes}</p>
                <p className="text-sm text-muted-foreground">Votes par catégorie</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sites Management */}
      <div className="mb-10 animate-fade-in-up stagger-3">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Gestion des sites</h2>
          <Button onClick={openCreateDialog} className="gap-2">
            <Plus className="w-4 h-4" />
            Ajouter un site
          </Button>
        </div>
        <div className="rounded-xl border bg-card">
          <Table>
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
                  <TableCell>
                    <SiteLogo site={site} />
                  </TableCell>
                  <TableCell className="font-medium">{site.name}</TableCell>
                  <TableCell>
                    <a href={site.url} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                      {site.url}
                    </a>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{site.logo_path}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEditDialog(site)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => openDeleteDialog(site)}>
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

      {/* Score Adjustment */}
      <div className="animate-fade-in-up stagger-4">
        <h2 className="text-xl font-bold mb-4">Ajustement des scores</h2>
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Ajustement</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map((site) => (
                <TableRow key={site.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <SiteLogo site={site} />
                      <span className="font-medium">{site.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      placeholder="ex: 5 ou -3"
                      value={scoreAdjustments[site.id] || ""}
                      onChange={(e) =>
                        setScoreAdjustments((prev) => ({ ...prev, [site.id]: e.target.value }))
                      }
                      className="w-32"
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleScoreAdjust(site.id)}
                    >
                      Appliquer
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create/Edit Site Dialog */}
      <Dialog open={siteDialogOpen} onOpenChange={setSiteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSite ? "Modifier le site" : "Ajouter un site"}</DialogTitle>
            <DialogDescription>
              {editingSite
                ? "Modifiez les informations du site ci-dessous."
                : "Renseignez les informations du nouveau site."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSiteSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="site-name">Nom</Label>
              <Input
                id="site-name"
                value={siteForm.name}
                onChange={(e) => setSiteForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="CinePulse"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-url">URL</Label>
              <Input
                id="site-url"
                value={siteForm.url}
                onChange={(e) => setSiteForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://cinepulse.example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-logo">Logo Path</Label>
              <Input
                id="site-logo"
                value={siteForm.logo_path}
                onChange={(e) => setSiteForm((f) => ({ ...f, logo_path: e.target.value }))}
                placeholder="/logos/cinepulse.png"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSiteDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={formLoading}>
                {formLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {editingSite ? "Sauvegarder" : "Ajouter"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer <strong>{deletingSite?.name}</strong> ? Cette action est irréversible et supprimera tous les votes associés.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ Main Admin Component ============
export default function Admin() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem("admin_token"));

  return isLoggedIn ? (
    <AdminDashboard onLogout={() => setIsLoggedIn(false)} />
  ) : (
    <LoginForm onLogin={() => setIsLoggedIn(true)} />
  );
}
