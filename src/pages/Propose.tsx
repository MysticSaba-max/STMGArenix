import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, X, CheckCircle2, PlusCircle } from "lucide-react";

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

    // Prévisualisation locale immédiate
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
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [logoPath, setLogoPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const remainingDays = getRemainingDays();
  const alreadySubmitted = remainingDays !== null;

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

  // ── État succès ──
  if (submitted) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-lg">
        <div className="flex flex-col items-center gap-4 text-center animate-fade-in-up">
          <CheckCircle2 className="w-16 h-16 text-green-500" />
          <h1 className="text-2xl font-bold">Proposition envoyée !</h1>
          <p className="text-muted-foreground">
            Merci pour votre suggestion. L'équipe va l'examiner et l'ajouter si elle est jugée pertinente.
          </p>
          <p className="text-sm text-muted-foreground">
            Vous pourrez proposer un autre site dans 7 jours.
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Retour
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 sm:py-12 max-w-lg">
      <div className="mb-8 animate-fade-in-up stagger-1">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <PlusCircle className="w-7 h-7 text-primary" />
          Proposer un site
        </h1>
        <p className="mt-2 text-muted-foreground">
          Suggérez un site à ajouter au classement. Votre proposition sera examinée par l'équipe.
        </p>
      </div>

      {alreadySubmitted ? (
        <Card className="animate-fade-in-up stagger-2">
          <CardContent className="pt-6 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="font-medium">Vous avez déjà soumis une proposition récemment.</p>
            <p className="text-sm text-muted-foreground">
              Vous pourrez en soumettre une nouvelle dans{" "}
              <strong>{remainingDays} jour{remainingDays! > 1 ? "s" : ""}</strong>.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="animate-fade-in-up stagger-2">
          <CardHeader>
            <CardTitle className="text-lg">Informations du site</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Nom */}
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

              {/* URL */}
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

              {/* Logo */}
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
  );
}
