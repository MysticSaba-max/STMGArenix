import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useSEO } from "@/hooks/useSEO";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, X, CheckCircle2, PlusCircle, Flag, Clock } from "lucide-react";

// ─── Cooldown proposition ──────────────────────────────────────────────────────
const COOLDOWN_KEY = "proposal_submitted_at";
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

function getRemainingDays(): number | null {
  const raw = localStorage.getItem(COOLDOWN_KEY);
  if (!raw) return null;
  const submittedAt = Number(raw);
  const diff = submittedAt + COOLDOWN_MS - Date.now();
  if (diff <= 0) {
    localStorage.removeItem(COOLDOWN_KEY);
    return null;
  }
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ─── Cooldown signalement ──────────────────────────────────────────────────────
const REPORT_COOLDOWN_KEY = "report_submitted_at";
const REPORT_COOLDOWN_MS = 2 * 24 * 60 * 60 * 1000; // 48h

function getReportRemainingHours(): number | null {
  const raw = localStorage.getItem(REPORT_COOLDOWN_KEY);
  if (!raw) return null;
  const submittedAt = Number(raw);
  const diff = submittedAt + REPORT_COOLDOWN_MS - Date.now();
  if (diff <= 0) {
    localStorage.removeItem(REPORT_COOLDOWN_KEY);
    return null;
  }
  return Math.ceil(diff / (1000 * 60 * 60));
}

// ─── Composant upload logo ─────────────────────────────────────────────────────
function LogoUploader({
  value,
  onChange,
}: {
  value: string;
  onChange: (path: string) => void;
}) {
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

    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      const result = await api.uploadProposalLogo(file);
      onChange(result.path);
      toast.success("Icône uploadée !");
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'upload");
      setPreview(null);
      onChange("");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
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
        {uploading ? "Upload en cours..." : "Choisir une icône"}
      </Button>
      <p className="text-xs text-muted-foreground">JPG, PNG, WebP ou GIF · max 2 MB</p>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}

// ─── Page principale ───────────────────────────────────────────────────────────
export default function ProposePage() {
  useSEO({
    title: "Proposer un Site de Streaming",
    description: "Proposez un nouveau site de streaming à ajouter au classement STMGArenix. Signalez un changement d'URL ou suggérez un site manquant. La communauté vote, vous proposez !",
    canonical: "/propose",
    keywords: "proposer site streaming, ajouter site streaming, signaler site streaming, nouveau site streaming",
  });

  // ── Proposition nouveau site ──
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [logoPath, setLogoPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // ── Signalement modification ──
  const [sites, setSites] = useState<{ id: number; name: string; url: string }[]>([]);
  const [reportSiteId, setReportSiteId] = useState("");
  const [reportNewUrl, setReportNewUrl] = useState("");
  const [reportNote, setReportNote] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const remainingDays = getRemainingDays();
  const alreadySubmitted = remainingDays !== null;

  const reportRemainingHours = getReportRemainingHours();
  const alreadyReported = reportRemainingHours !== null;

  useEffect(() => {
    api.getSites().then((data) => setSites(data)).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (alreadySubmitted) return;

    if (!name.trim() || name.trim().length < 2) {
      toast.error("Le nom doit contenir au moins 2 caractères.");
      return;
    }
    if (!url.trim()) {
      toast.error("L'URL est requise.");
      return;
    }
    try {
      new URL(url.trim());
    } catch {
      toast.error("URL invalide. Elle doit commencer par http:// ou https://");
      return;
    }

    setLoading(true);
    try {
      await api.submitProposal({ name: name.trim(), url: url.trim(), logo_path: logoPath });
      localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
      setSubmitted(true);
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la soumission.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReport(e: React.FormEvent) {
    e.preventDefault();
    if (alreadyReported) return;

    const siteId = Number(reportSiteId);
    if (!siteId) {
      toast.error("Veuillez sélectionner un site.");
      return;
    }
    if (!reportNewUrl.trim() && !reportNote.trim()) {
      toast.error("Indiquez une nouvelle URL ou une note explicative.");
      return;
    }
    if (reportNewUrl.trim()) {
      try {
        new URL(reportNewUrl.trim());
      } catch {
        toast.error("Nouvelle URL invalide. Elle doit commencer par http:// ou https://");
        return;
      }
    }

    setReportLoading(true);
    try {
      await api.reportSiteModification({
        site_id: siteId,
        new_url: reportNewUrl.trim() || undefined,
        note: reportNote.trim() || undefined,
      });
      localStorage.setItem(REPORT_COOLDOWN_KEY, String(Date.now()));
      setReportSubmitted(true);
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'envoi.");
    } finally {
      setReportLoading(false);
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 sm:py-12 max-w-lg space-y-10">

      {/* ── Section : Proposer un nouveau site ── */}
      <div className="animate-fade-in-up stagger-1">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <PlusCircle className="w-7 h-7 text-primary" />
            Proposer un site
          </h1>
          <p className="mt-2 text-muted-foreground">
            Suggérez un site à ajouter au classement. Votre proposition sera examinée par l'équipe.
          </p>
        </div>

        {submitted ? (
          <Card>
            <CardContent className="pt-6 flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <p className="font-medium">Proposition envoyée !</p>
              <p className="text-sm text-muted-foreground">
                Merci pour votre suggestion. Vous pourrez en soumettre une nouvelle dans 7 jours.
              </p>
            </CardContent>
          </Card>
        ) : alreadySubmitted ? (
          <Card>
            <CardContent className="pt-6 text-center space-y-3">
              <Clock className="w-10 h-10 text-muted-foreground mx-auto" />
              <p className="font-medium">Vous avez déjà soumis une proposition récemment.</p>
              <p className="text-sm text-muted-foreground">
                Vous pourrez en soumettre une nouvelle dans{" "}
                <strong>{remainingDays} jour{remainingDays! > 1 ? "s" : ""}</strong>.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informations du site</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="site-name">Nom du site *</Label>
                  <Input
                    id="site-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="CinePulse"
                    maxLength={100}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="site-url">URL du site *</Label>
                  <Input
                    id="site-url"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Icône du site</Label>
                  <LogoUploader value={logoPath} onChange={setLogoPath} />
                </div>
                <Button type="submit" className="w-full gap-2" disabled={loading}>
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <PlusCircle className="w-4 h-4" />
                  )}
                  {loading ? "Envoi en cours..." : "Soumettre la proposition"}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Une seule proposition tous les 7 jours par adresse IP.
                </p>
              </form>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Section : Signaler une modification ── */}
      <div className="animate-fade-in-up stagger-2">
        <div className="mb-6">
          <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Flag className="w-6 h-6 text-amber-500" />
            Signaler une modification
          </h2>
          <p className="mt-2 text-muted-foreground">
            Un site a changé de domaine ou d'URL ? Signalez-le pour que l'équipe puisse le mettre à jour.
          </p>
        </div>

        {reportSubmitted ? (
          <Card>
            <CardContent className="pt-6 flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <p className="font-medium">Signalement envoyé !</p>
              <p className="text-sm text-muted-foreground">
                Merci, l'équipe examinera votre signalement. Vous pourrez en envoyer un autre dans 48h.
              </p>
            </CardContent>
          </Card>
        ) : alreadyReported ? (
          <Card>
            <CardContent className="pt-6 text-center space-y-3">
              <Clock className="w-10 h-10 text-muted-foreground mx-auto" />
              <p className="font-medium">Vous avez déjà envoyé un signalement récemment.</p>
              <p className="text-sm text-muted-foreground">
                Vous pourrez en envoyer un nouveau dans{" "}
                <strong>{reportRemainingHours} heure{reportRemainingHours! > 1 ? "s" : ""}</strong>.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Détails du signalement</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleReport} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="report-site">Site concerné *</Label>
                  <select
                    id="report-site"
                    value={reportSiteId}
                    onChange={(e) => setReportSiteId(e.target.value)}
                    required
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">-- Sélectionnez un site --</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="report-url">Nouvelle URL du site</Label>
                  <Input
                    id="report-url"
                    type="url"
                    value={reportNewUrl}
                    onChange={(e) => setReportNewUrl(e.target.value)}
                    placeholder="https://nouveau-domaine.com"
                  />
                  <p className="text-xs text-muted-foreground">Laissez vide si seul un changement mineur est à noter.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="report-note">Note / explications</Label>
                  <textarea
                    id="report-note"
                    value={reportNote}
                    onChange={(e) => setReportNote(e.target.value)}
                    placeholder="Décrivez la modification (ex: le site a changé de domaine en janvier 2026)"
                    maxLength={500}
                    rows={3}
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {reportNote.length}/500
                  </p>
                </div>

                <Button type="submit" variant="outline" className="w-full gap-2 border-amber-500/40 text-amber-600 hover:bg-amber-500/10 hover:text-amber-600" disabled={reportLoading}>
                  {reportLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Flag className="w-4 h-4" />
                  )}
                  {reportLoading ? "Envoi en cours..." : "Envoyer le signalement"}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  Un signalement tous les 48h par adresse IP.
                </p>
              </form>
            </CardContent>
          </Card>
        )}
      </div>

    </div>
  );
}
