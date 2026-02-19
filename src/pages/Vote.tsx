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
    <div className="flex items-center gap-0.5">
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
            className={`w-5 h-5 transition-colors ${
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
  const [fingerprint, setFingerprint] = useState("");
  const [globalVotes, setGlobalVotes] = useState<Record<number, "up" | "down">>({});
  const [categoryVotes, setCategoryVotes] = useState<Record<string, number>>({});
  const [votingInProgress, setVotingInProgress] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function init() {
      try {
        const fp = await getFingerprint();
        setFingerprint(fp);

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
        (votesData.categoryVotes || []).forEach((v: CategoryVote) => {
          cv[`${v.site_id}_${v.category}`] = v.score;
        });
        setCategoryVotes(cv);
      } catch (err) {
        console.error(err);
        toast.error("Erreur lors du chargement des données");
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

  const handleCategoryVote = useCallback(
    async (siteId: number, category: string, score: number) => {
      const key = `cat_${siteId}_${category}`;
      if (votingInProgress[key]) return;

      setVotingInProgress((prev) => ({ ...prev, [key]: true }));
      try {
        await api.voteCategory({ site_id: siteId, category, score, fingerprint });
        setCategoryVotes((prev) => ({ ...prev, [`${siteId}_${category}`]: score }));
        toast.success("Note enregistrée !");
      } catch (err: any) {
        toast.error(err.message || "Erreur lors du vote");
      } finally {
        setVotingInProgress((prev) => ({ ...prev, [key]: false }));
      }
    },
    [fingerprint, votingInProgress]
  );

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      {/* Page Header */}
      <div className="mb-10 animate-fade-in-up stagger-1">
        <h1 className="text-3xl md:text-4xl font-bold">Votez pour vos sites préférés</h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Votre vote compte ! Un seul vote par appareil par site.
        </p>
      </div>

      {/* Site Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sites.map((site, index) => {
          const currentVote = globalVotes[site.id];

          return (
            <Card
              key={site.id}
              className={`animate-fade-in-up ${index < 5 ? `stagger-${index + 1}` : ""} transition-all duration-300 hover:shadow-lg`}
            >
              <CardHeader>
                <div className="flex items-start gap-4">
                  <SiteLogo site={site} />
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg">{site.name}</CardTitle>
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

              <CardContent className="space-y-4">
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
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Notes par catégorie
                  </p>
                  {categoryConfig.map(({ key, label, icon: Icon }) => (
                    <div key={key} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm min-w-0">
                        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="truncate">{label}</span>
                      </div>
                      <StarRating
                        value={categoryVotes[`${site.id}_${key}`] || 0}
                        onChange={(score) => handleCategoryVote(site.id, key, score)}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
