import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { getFingerprint } from "@/lib/fingerprint";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
} from "lucide-react";

interface Site {
  id: number;
  name: string;
  url: string;
  logo_path: string;
}

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
      src={site.logo_path}
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
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [fingerprint, setFingerprint] = useState("");
  const [globalVotes, setGlobalVotes] = useState<Record<number, "up" | "down">>({});
  const [categoryVotes, setCategoryVotes] = useState<Record<string, number>>({});
  const [pendingCategoryVotes, setPendingCategoryVotes] = useState<Record<string, number>>({});
  const [votingInProgress, setVotingInProgress] = useState<Record<string, boolean>>({});
  const [submittedSites, setSubmittedSites] = useState<Set<number>>(new Set());

  useEffect(() => {
    async function init() {
      try {
        const fp = await getFingerprint();
        setFingerprint(fp);
        api.setFingerprint(fp);

        // Skip Turnstile if session cookie already exists
        if (api.hasSession()) {
          setVerified(true);
          setVerifying(false);
        } else {
          await api.verifyTurnstile(fp);
          setVerified(true);
          setVerifying(false);
        }

        const [sitesData, votesData] = await Promise.all([
          api.getSites(),
          api.getMyVotes(fp),
        ]);

        setSites(sitesData);

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
      } catch (err) {
        console.error(err);
        setVerifying(false);
        if (!verified) {
          toast.error("La vérification a échoué, veuillez réessayer");
        } else {
          toast.error("Erreur lors du chargement des données");
        }
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const handleGlobalVote = useCallback(
    async (siteId: number, voteType: "up" | "down") => {
      const key = `global_${siteId}`;
      if (votingInProgress[key]) return;

      setVotingInProgress((prev) => ({ ...prev, [key]: true }));
      try {
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
    [fingerprint, votingInProgress]
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
    [fingerprint, pendingCategoryVotes, votingInProgress]
  );

  if (verifying || loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {verifying ? "On vérifie que vous n'êtes pas un robot..." : "Chargement des données..."}
        </p>
      </div>
    );
  }

  if (!verified) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-sm text-muted-foreground">
          La vérification a échoué. Veuillez rafraîchir la page.
        </p>
        <Button onClick={() => window.location.reload()}>Réessayer</Button>
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
      </div>

      {/* Site Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {sites.map((site, index) => {
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
