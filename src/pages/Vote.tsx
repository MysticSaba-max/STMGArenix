import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { api, getAssetUrl } from "@/lib/api";
import { useSEO } from "@/hooks/useSEO";
import { getFingerprint } from "@/lib/fingerprint";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ThumbsUp,
  ThumbsDown,
  Star,
  ExternalLink,
  Loader2,
  Ban,
  MousePointerClick,
  Link as LinkIcon,
  Library,
  MonitorPlay,
  Check,
  ShieldX,
  ShieldCheck,
  Search,
  ArrowUpDown,
  TrendingUp,
  ArrowDownAZ,
  ArrowUpAZ,
  Flame,
  Share2,
} from "lucide-react";
import { Input } from "@/components/ui/input";

interface Site {
  id: number;
  name: string;
  url: string;
  logo_path: string;
}

interface LeaderboardEntry {
  id: number;
  upvotes: number;
  downvotes: number;
  score: number;
}

type SortOption = "votes" | "score" | "upvotes" | "alpha_asc" | "alpha_desc";

const sortOptions: { key: SortOption; label: string; icon: typeof ArrowUpDown }[] = [
  { key: "votes", label: "Plus votés", icon: Flame },
  { key: "score", label: "Meilleur score", icon: TrendingUp },
  { key: "upvotes", label: "Plus d'upvotes", icon: ThumbsUp },
  { key: "alpha_asc", label: "A → Z", icon: ArrowDownAZ },
  { key: "alpha_desc", label: "Z → A", icon: ArrowUpAZ },
];

interface GlobalVote {
  site_id: number;
  vote_type: "up" | "down";
}

interface CategoryVote {
  site_id: number;
  category: string;
  score: number;
}

const categoryConfig = [
  { key: "pubs", label: "Publicités", icon: Ban },
  { key: "facilite", label: "Facilité", icon: MousePointerClick },
  { key: "liens", label: "Liens", icon: LinkIcon },
  { key: "catalogue", label: "Catalogue", icon: Library },
  { key: "qualite_video", label: "Qualité Vidéo", icon: MonitorPlay },
];

// Codes de sécurité qui déclenchent un blocage complet
const SECURITY_CODES = [
  "VPN_DETECTED",
  "PROXY_DETECTED",
  "TOR_DETECTED",
  "RELAY_DETECTED",
  "DATACENTER_IP",
  "VPN_PROXY_DETECTED",
  "BOT_DETECTED",
  "BOT_SESSION",
  "BOT_SCORE_HIGH",
];

function SiteLogo({ site, size = 64 }: { site: { name: string; logo_path: string }; size?: number }) {
  const [imgError, setImgError] = useState(false);
  if (imgError || !site.logo_path) {
    return (
      <div
        className="rounded-xl bg-primary/20 flex items-center justify-center font-bold text-primary shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {site.name.charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={getAssetUrl(site.logo_path)}
      alt={site.name}
      className="rounded-xl object-cover shrink-0"
      style={{ width: size, height: size }}
      onError={() => setImgError(true)}
    />
  );
}

function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="flex items-center gap-0">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          className="p-0.5 transition-transform hover:scale-110"
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(i)}
        >
          <Star
            className={`w-4 h-4 sm:w-5 sm:h-5 transition-colors ${
              i <= (hovered || value)
                ? "fill-yellow-500 text-yellow-500"
                : "text-muted-foreground/30 hover:text-yellow-500/50"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

export default function VotePage() {
  useSEO({
    title: "Voter pour les Meilleurs Sites de Streaming",
    description: "Votez pour vos sites de streaming préférés ! Upvote ou downvote et notez chaque site selon 5 critères : publicités, facilité, liens, catalogue et qualité vidéo. Votre avis compte.",
    canonical: "/vote",
    keywords: "voter streaming, avis site streaming, noter site streaming, meilleur streaming vote, évaluer streaming, avis streaming gratuit",
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  // verifying = vérification Turnstile encore en cours (n'est plus un bloqueur de rendu)
  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [blockError, setBlockError] = useState<{ message: string; code: string } | null>(null);
  const [fingerprint, setFingerprint] = useState("");
  const [globalVotes, setGlobalVotes] = useState<Record<number, "up" | "down">>({});
  const [categoryVotes, setCategoryVotes] = useState<Record<string, number>>({});
  const [pendingCategoryVotes, setPendingCategoryVotes] = useState<Record<string, number>>({});
  const [votingInProgress, setVotingInProgress] = useState<Record<string, boolean>>({});
  const [submittedSites, setSubmittedSites] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("votes");
  const [leaderboardData, setLeaderboardData] = useState<Record<number, LeaderboardEntry>>({});
  const [instantVoteOpen, setInstantVoteOpen] = useState(false);
  const [instantVoteConfirmed, setInstantVoteConfirmed] = useState(false);

  // Ref vers la promesse de vérification pour que les handlers puissent l'attendre
  const verificationRef = useRef<Promise<boolean>>(Promise.resolve(true));

  // ── Instant vote : lire le paramètre et ouvrir le popup quand les sites sont chargés ──
  const instantVoteId = searchParams.get("instantvote");
  const instantVoteSite = instantVoteId ? sites.find((s) => s.id === Number(instantVoteId)) : null;

  useEffect(() => {
    if (!loading && instantVoteId && instantVoteSite) {
      setInstantVoteOpen(true);
    }
  }, [loading, instantVoteId, instantVoteSite]);

  const handleInstantVoteClose = useCallback(() => {
    setInstantVoteOpen(false);
    setInstantVoteConfirmed(false);
    // Retirer le paramètre instantvote de l'URL sans recharger la page
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("instantvote");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const handleShareVoteLink = useCallback((siteId: number) => {
    const url = `${window.location.origin}/vote?instantvote=${siteId}`;
    navigator.clipboard.writeText(url).then(() => {
      toast.success("Lien de vote copié !");
    }).catch(() => {
      toast.error("Impossible de copier le lien");
    });
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const fp = await getFingerprint();
        setFingerprint(fp);
        api.setFingerprint(fp);

        // ── Lancer la vérification en arrière-plan (sans await immédiat) ──────
        if (api.hasSession()) {
          setVerified(true);
          setVerifying(false);
          verificationRef.current = Promise.resolve(true);
        } else {
          verificationRef.current = api.verifyTurnstile(fp)
            .then(() => {
              setVerified(true);
              setVerifying(false);
              return true;
            })
            .catch((err: any) => {
              setVerifying(false);
              if (err.code && SECURITY_CODES.includes(err.code)) {
                // Bot ou VPN détecté → remplace le formulaire par l'écran de blocage
                setBlockError({ message: err.message, code: err.code });
              }
              return false;
            });
        }

        // ── Charger sites + votes + leaderboard immédiatement, sans attendre Turnstile ──────
        const [sitesData, votesData, lbData] = await Promise.all([
          api.getSites(),
          api.getMyVotes(fp),
          api.getLeaderboard(),
        ]);

        setSites(sitesData);

        const lbMap: Record<number, LeaderboardEntry> = {};
        (lbData || []).forEach((entry: LeaderboardEntry) => {
          lbMap[entry.id] = entry;
        });
        setLeaderboardData(lbMap);

        const gv: Record<number, "up" | "down"> = {};
        (votesData.globalVotes || []).forEach((v: GlobalVote) => {
          gv[v.site_id] = v.vote_type;
        });
        setGlobalVotes(gv);

        const cv: Record<string, number> = {};
        const alreadySubmitted = new Set<number>();
        (votesData.categoryVotes || []).forEach((v: CategoryVote) => {
          cv[`${v.site_id}_${v.category}`] = v.score;
          alreadySubmitted.add(v.site_id);
        });
        setCategoryVotes(cv);
        setPendingCategoryVotes(cv);
        setSubmittedSites(alreadySubmitted);

      } catch (err: any) {
        console.error(err);
        toast.error(err.message || "Erreur lors du chargement des données");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // ── Attendre la fin de la vérification avant d'envoyer un vote ─────────────
  // Retourne true si vérifié, false si bloqué/échoué
  const ensureVerified = useCallback(async (): Promise<boolean> => {
    if (verified) return true;
    if (blockError) return false;
    return verificationRef.current;
  }, [verified, blockError]);

  const handleGlobalVote = useCallback(
    async (siteId: number, voteType: "up" | "down") => {
      const key = `global_${siteId}`;
      if (votingInProgress[key]) return;

      setVotingInProgress((prev) => ({ ...prev, [key]: true }));
      try {
        // Si la vérification est encore en cours, on l'attend avant d'envoyer le vote
        const ok = await ensureVerified();
        if (!ok) {
          toast.error("Vérification de sécurité échouée. Rechargez la page.");
          return;
        }

        const result = await api.vote({ site_id: siteId, vote_type: voteType, fingerprint });
        if (result.action === "removed") {
          setGlobalVotes((prev) => {
            const next = { ...prev };
            delete next[siteId];
            return next;
          });
          toast.success("Vote supprimé");
        } else {
          setGlobalVotes((prev) => ({ ...prev, [siteId]: voteType }));
          toast.success(voteType === "up" ? "Vote positif enregistré !" : "Vote négatif enregistré !");
        }
      } catch (err: any) {
        toast.error(err.message || "Erreur lors du vote");
      } finally {
        setVotingInProgress((prev) => ({ ...prev, [key]: false }));
      }
    },
    [fingerprint, votingInProgress, ensureVerified]
  );

  const handlePendingCategoryChange = useCallback(
    (siteId: number, category: string, score: number) => {
      setPendingCategoryVotes((prev) => ({ ...prev, [`${siteId}_${category}`]: score }));
    },
    []
  );

  const handleSubmitCategories = useCallback(
    async (siteId: number) => {
      const key = `cat_submit_${siteId}`;
      if (votingInProgress[key]) return;

      setVotingInProgress((prev) => ({ ...prev, [key]: true }));
      try {
        // Si la vérification est encore en cours, on l'attend avant d'envoyer les notes
        const ok = await ensureVerified();
        if (!ok) {
          toast.error("Vérification de sécurité échouée. Rechargez la page.");
          return;
        }

        const ratings: Record<string, number> = {};
        for (const { key: catKey } of categoryConfig) {
          const score = pendingCategoryVotes[`${siteId}_${catKey}`];
          if (score) ratings[catKey] = score;
        }
        await api.voteCategories({ site_id: siteId, ratings, fingerprint });
        setCategoryVotes((prev) => {
          const next = { ...prev };
          for (const { key: catKey } of categoryConfig) {
            const val = pendingCategoryVotes[`${siteId}_${catKey}`];
            if (val) next[`${siteId}_${catKey}`] = val;
          }
          return next;
        });
        setSubmittedSites((prev) => new Set(prev).add(siteId));
        toast.success("Notes enregistrées !");
      } catch (err: any) {
        toast.error(err.message || "Erreur lors du vote");
      } finally {
        setVotingInProgress((prev) => ({ ...prev, [key]: false }));
      }
    },
    [fingerprint, pendingCategoryVotes, votingInProgress, ensureVerified]
  );

  // ── Blocage sécurité (VPN / bot détecté — y compris pendant le remplissage) ─
  if (blockError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center px-4">
        <ShieldX className="w-14 h-14 text-destructive" />
        <h2 className="text-xl font-bold">Accès restreint</h2>
        <p className="text-sm text-muted-foreground max-w-md">{blockError.message}</p>
        <p className="text-xs text-muted-foreground max-w-md">
          Si vous pensez qu'il s'agit d'une erreur, désactivez votre VPN / proxy et réessayez.
        </p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Réessayer
        </Button>
      </div>
    );
  }

  // ── Chargement initial des données (spinner très court) ──────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Chargement des données...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 sm:py-12">
      {/* Page Header */}
      <div className="mb-6 sm:mb-10 animate-fade-in-up stagger-1">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold">Votez pour vos sites préférés</h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Votre vote compte ! Un seul vote par appareil par site.
        </p>
        {/* Indicateur de vérification discret (disparaît une fois terminée) */}
        {verifying && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground/60">
            <Loader2 className="w-3 h-3 animate-spin" />
            Vérification de sécurité en cours…
          </div>
        )}
        {!verifying && verified && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-green-500/70">
            <ShieldCheck className="w-3 h-3" />
            Vérification réussie
          </div>
        )}
      </div>

      {/* Barre de recherche + tri */}
      <div className="mb-6 animate-fade-in-up stagger-2 space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Rechercher un site..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Options de tri */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>Trier par :</span>
          </div>
          {sortOptions.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                sortBy === key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Popup de vote instantané */}
      {instantVoteSite && (
        <Dialog open={instantVoteOpen} onOpenChange={(open) => { if (!open) handleInstantVoteClose(); }}>
          <DialogContent className="sm:max-w-md">
            {!instantVoteConfirmed ? (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3">
                    <SiteLogo site={instantVoteSite} size={40} />
                    <span>{instantVoteSite.name}</span>
                  </DialogTitle>
                  <DialogDescription>
                    Quelqu'un vous a partagé un lien de vote pour ce site. Souhaitez-vous donner votre avis ?
                  </DialogDescription>
                </DialogHeader>

                <div className="flex items-center justify-center gap-3 pt-2">
                  <Button
                    className="gap-2"
                    onClick={() => setInstantVoteConfirmed(true)}
                  >
                    <ThumbsUp className="w-4 h-4" />
                    Voter
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={handleInstantVoteClose}
                  >
                    <ThumbsDown className="w-4 h-4" />
                    Non merci
                  </Button>
                </div>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3">
                    <SiteLogo site={instantVoteSite} size={40} />
                    <span>Voter pour {instantVoteSite.name}</span>
                  </DialogTitle>
                  <DialogDescription>
                    Donnez votre avis sur ce site de streaming
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  {/* Global Vote dans le popup */}
                  <div className="flex items-center justify-center gap-3">
                    <Button
                      variant={globalVotes[instantVoteSite.id] === "up" ? "default" : "outline"}
                      size="sm"
                      className={`gap-1.5 ${globalVotes[instantVoteSite.id] === "up" ? "bg-green-600 hover:bg-green-700 text-white" : "hover:text-green-500 hover:border-green-500"}`}
                      onClick={() => handleGlobalVote(instantVoteSite.id, "up")}
                      disabled={!!votingInProgress[`global_${instantVoteSite.id}`]}
                    >
                      <ThumbsUp className="w-4 h-4" />
                      Pour
                    </Button>
                    <Button
                      variant={globalVotes[instantVoteSite.id] === "down" ? "default" : "outline"}
                      size="sm"
                      className={`gap-1.5 ${globalVotes[instantVoteSite.id] === "down" ? "bg-red-600 hover:bg-red-700 text-white" : "hover:text-red-500 hover:border-red-500"}`}
                      onClick={() => handleGlobalVote(instantVoteSite.id, "down")}
                      disabled={!!votingInProgress[`global_${instantVoteSite.id}`]}
                    >
                      <ThumbsDown className="w-4 h-4" />
                      Contre
                    </Button>
                  </div>

                  <Separator />

                  {/* Category Ratings dans le popup */}
                  <div className="space-y-2.5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Notes par catégorie
                    </p>
                    {categoryConfig.map(({ key, label, icon: Icon }) => (
                      <div key={key} className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-2 text-sm min-w-0">
                          <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="truncate">{label}</span>
                        </div>
                        <StarRating
                          value={pendingCategoryVotes[`${instantVoteSite.id}_${key}`] || 0}
                          onChange={(score) => handlePendingCategoryChange(instantVoteSite.id, key, score)}
                        />
                      </div>
                    ))}

                    {/* Submit categories dans le popup */}
                    <div className="pt-2">
                      {(() => {
                        const popupFilledCount = categoryConfig.filter(
                          ({ key }) => pendingCategoryVotes[`${instantVoteSite.id}_${key}`] > 0
                        ).length;
                        const popupRemaining = categoryConfig.length - popupFilledCount;
                        const popupAllFilled = popupRemaining === 0;
                        const popupIsSubmitting = !!votingInProgress[`cat_submit_${instantVoteSite.id}`];
                        const popupAlreadySubmitted = submittedSites.has(instantVoteSite.id);
                        const popupHasChanges = categoryConfig.some(({ key }) => {
                          const pending = pendingCategoryVotes[`${instantVoteSite.id}_${key}`] || 0;
                          const saved = categoryVotes[`${instantVoteSite.id}_${key}`] || 0;
                          return pending !== saved;
                        });

                        if (popupAllFilled) {
                          if (popupAlreadySubmitted && !popupHasChanges) {
                            return (
                              <div className="flex items-center gap-2 text-xs text-green-500">
                                <Check className="w-3.5 h-3.5" />
                                Notes enregistrées
                              </div>
                            );
                          }
                          return (
                            <Button
                              size="sm"
                              className="w-full gap-2"
                              onClick={() => handleSubmitCategories(instantVoteSite.id)}
                              disabled={popupIsSubmitting}
                            >
                              {popupIsSubmitting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Check className="w-4 h-4" />
                              )}
                              {popupIsSubmitting ? "Vérification..." : "Valider les notes"}
                            </Button>
                          );
                        }
                        return (
                          <p className="text-xs text-muted-foreground text-center">
                            Remplissez toutes les catégories pour valider ({popupRemaining} restante{popupRemaining > 1 ? "s" : ""})
                          </p>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Site Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {sites
          .filter((site) =>
            site.name.toLowerCase().includes(searchQuery.toLowerCase())
          )
          .sort((a, b) => {
            const lbA = leaderboardData[a.id] || { upvotes: 0, downvotes: 0, score: 0 };
            const lbB = leaderboardData[b.id] || { upvotes: 0, downvotes: 0, score: 0 };
            const totalA = lbA.upvotes + lbA.downvotes;
            const totalB = lbB.upvotes + lbB.downvotes;
            switch (sortBy) {
              case "votes":
                return totalB - totalA || lbB.score - lbA.score;
              case "score":
                return lbB.score - lbA.score || lbB.upvotes - lbA.upvotes;
              case "upvotes":
                return lbB.upvotes - lbA.upvotes || totalB - totalA;
              case "alpha_asc":
                return a.name.localeCompare(b.name, "fr");
              case "alpha_desc":
                return b.name.localeCompare(a.name, "fr");
              default:
                return 0;
            }
          })
          .map((site, index) => {
          const currentVote = globalVotes[site.id];
          const filledCount = categoryConfig.filter(
            ({ key }) => pendingCategoryVotes[`${site.id}_${key}`] > 0
          ).length;
          const remaining = categoryConfig.length - filledCount;
          const allFilled = remaining === 0;
          const isSubmitting = !!votingInProgress[`cat_submit_${site.id}`];
          const alreadySubmitted = submittedSites.has(site.id);

          const hasChanges = categoryConfig.some(({ key }) => {
            const pending = pendingCategoryVotes[`${site.id}_${key}`] || 0;
            const saved = categoryVotes[`${site.id}_${key}`] || 0;
            return pending !== saved;
          });

          return (
            <Card
              key={site.id}
              className={`animate-fade-in-up ${index < 5 ? `stagger-${index + 1}` : ""} transition-all duration-300 hover:shadow-lg`}
            >
              <CardHeader className="p-4 sm:p-6">
                <div className="flex items-start gap-3 sm:gap-4">
                  <SiteLogo site={site} size={48} />
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base sm:text-lg">{site.name}</CardTitle>
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mt-1 transition-colors"
                    >
                      Visiter
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
                {/* Global Vote */}
                <div className="flex items-center justify-center gap-3">
                  <Button
                    variant={currentVote === "up" ? "default" : "outline"}
                    size="sm"
                    className={`gap-1.5 ${currentVote === "up" ? "bg-green-600 hover:bg-green-700 text-white" : "hover:text-green-500 hover:border-green-500"}`}
                    onClick={() => handleGlobalVote(site.id, "up")}
                    disabled={!!votingInProgress[`global_${site.id}`]}
                  >
                    <ThumbsUp className="w-4 h-4" />
                    Pour
                  </Button>
                  <Button
                    variant={currentVote === "down" ? "default" : "outline"}
                    size="sm"
                    className={`gap-1.5 ${currentVote === "down" ? "bg-red-600 hover:bg-red-700 text-white" : "hover:text-red-500 hover:border-red-500"}`}
                    onClick={() => handleGlobalVote(site.id, "down")}
                    disabled={!!votingInProgress[`global_${site.id}`]}
                  >
                    <ThumbsDown className="w-4 h-4" />
                    Contre
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground hover:text-primary"
                    onClick={() => handleShareVoteLink(site.id)}
                    title="Copier le lien de vote direct"
                  >
                    <Share2 className="w-4 h-4" />
                  </Button>
                </div>

                <Separator />

                {/* Category Ratings */}
                <div className="space-y-2.5 sm:space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Notes par catégorie
                  </p>
                  {categoryConfig.map(({ key, label, icon: Icon }) => (
                    <div key={key} className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm min-w-0">
                        <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground shrink-0" />
                        <span className="truncate">{label}</span>
                      </div>
                      <StarRating
                        value={pendingCategoryVotes[`${site.id}_${key}`] || 0}
                        onChange={(score) => handlePendingCategoryChange(site.id, key, score)}
                      />
                    </div>
                  ))}

                  {/* Status message + submit button */}
                  <div className="pt-2">
                    {allFilled ? (
                      alreadySubmitted && !hasChanges ? (
                        <div className="flex items-center gap-2 text-xs text-green-500">
                          <Check className="w-3.5 h-3.5" />
                          Notes enregistrées
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          className="w-full gap-2"
                          onClick={() => handleSubmitCategories(site.id)}
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                          {isSubmitting ? "Vérification..." : "Valider les notes"}
                        </Button>
                      )
                    ) : (
                      <p className="text-xs text-muted-foreground text-center">
                        Remplissez toutes les catégories pour valider ({remaining} restante{remaining > 1 ? "s" : ""})
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
