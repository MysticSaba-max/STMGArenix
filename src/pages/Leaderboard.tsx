import { useEffect, useState, useMemo } from "react";
import { api, getAssetUrl } from "@/lib/api";
import { useSEO } from "@/hooks/useSEO";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ThumbsUp, ThumbsDown, Loader2, Crown, Medal, Award, ArrowUpDown, Info } from "lucide-react";

interface LeaderboardEntry {
  id: number;
  name: string;
  url: string;
  logo_path: string;
  score: number;
  upvotes: number;
  downvotes: number;
}

type SortKey = "score" | "upvotes" | "downvotes" | "total";
type SortDir = "asc" | "desc";
type RankingMethod = "raw" | "bayesian" | "weighted" | "wilson";

const BAYESIAN_PRIOR_ALPHA = 2;
const BAYESIAN_PRIOR_BETA = 8;
const WEIGHTED_M = 10;
const WEIGHTED_C = 0.5;

const methodInfo: Record<RankingMethod, { label: string; description: string; scoreLabel: string }> = {
  raw: {
    label: "Score brut",
    description: "Upvotes − Downvotes. Simple mais favorise les sites avec beaucoup de votes, peu importe le ratio.",
    scoreLabel: "Score",
  },
  bayesian: {
    label: "Bayésien",
    description: "Lissage Beta-Binomial avec a priori pessimiste (2 pseudo-upvotes, 8 pseudo-downvotes). Sans données, un site démarre à 20% et converge progressivement vers son vrai ratio à mesure que les votes s'accumulent.",
    scoreLabel: "Score Bayésien",
  },
  weighted: {
    label: "Pondérée",
    description: "Moyenne pondérée (formule IMDb) avec a priori neutre à 50%. Combine le ratio réel du site et un score de référence, pondérés par le nombre de votes : plus un site a de votes, plus son ratio compte. Sans données, un site démarre à 50%.",
    scoreLabel: "Moyenne pondérée",
  },
  wilson: {
    label: "Wilson",
    description: "Borne inférieure de l'intervalle de confiance à 95% (formule Reddit). Le score le plus pessimiste réaliste — pénalise fortement les petits échantillons.",
    scoreLabel: "Score Wilson",
  },
};

function computeBayesianScores(data: LeaderboardEntry[]): Map<number, number> {
  const scores = new Map<number, number>();
  for (const site of data) {
    const up = Number(site.upvotes);
    const down = Number(site.downvotes);
    const score = (up + BAYESIAN_PRIOR_ALPHA) / (up + down + BAYESIAN_PRIOR_ALPHA + BAYESIAN_PRIOR_BETA);
    scores.set(site.id, score);
  }
  return scores;
}

function computeWeightedScores(data: LeaderboardEntry[]): Map<number, number> {
  const scores = new Map<number, number>();
  for (const site of data) {
    const up = Number(site.upvotes);
    const down = Number(site.downvotes);
    const score = (up + WEIGHTED_M * WEIGHTED_C) / (up + down + WEIGHTED_M);
    scores.set(site.id, score);
  }
  return scores;
}

function computeWilsonScores(data: LeaderboardEntry[]): Map<number, number> {
  const z = 1.96;
  const scores = new Map<number, number>();

  for (const site of data) {
    const n = Number(site.upvotes) + Number(site.downvotes);
    if (n === 0) {
      scores.set(site.id, 0);
      continue;
    }
    const p = Number(site.upvotes) / n;
    const lower =
      (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) /
      (1 + (z * z) / n);
    scores.set(site.id, Math.max(0, lower));
  }
  return scores;
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
      src={getAssetUrl(site.logo_path)}
      alt={site.name}
      className="w-8 h-8 rounded-lg object-cover shrink-0"
      onError={() => setImgError(true)}
    />
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-yellow-500/10">
        <Crown className="w-4 h-4 text-yellow-500" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-400/10">
        <Medal className="w-4 h-4 text-gray-400" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-700/10">
        <Award className="w-4 h-4 text-orange-700" />
      </div>
    );
  }
  return <span className="text-muted-foreground font-medium w-8 text-center block">{rank}</span>;
}

export default function Leaderboard() {
  useSEO({
    title: "Classement des Sites de Streaming - Top Sites Streaming 2026",
    description: "Classement complet des meilleurs sites de streaming gratuit basé sur les votes de la communauté. Comparez les scores, upvotes et downvotes pour trouver le site de streaming idéal.",
    canonical: "/leaderboard",
    keywords: "classement streaming, top site streaming, meilleur site streaming 2026, comparatif site streaming, site streaming gratuit classement, streaming fiable, streaming populaire",
  });

  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [method, setMethod] = useState<RankingMethod>("wilson");

  useEffect(() => {
    api.getLeaderboard()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const bayesianScores = useMemo(() => computeBayesianScores(data), [data]);
  const weightedScores = useMemo(() => computeWeightedScores(data), [data]);
  const wilsonScores = useMemo(() => computeWilsonScores(data), [data]);

  function getMethodScore(site: LeaderboardEntry): number {
    if (method === "bayesian") return bayesianScores.get(site.id) ?? 0;
    if (method === "weighted") return weightedScores.get(site.id) ?? 0;
    if (method === "wilson") return wilsonScores.get(site.id) ?? 0;
    return Number(site.score);
  }

  const sorted = useMemo(() => {
    const arr = [...data];
    arr.sort((a, b) => {
      let av: number, bv: number;
      if (sortKey === "score") {
        av = getMethodScore(a);
        bv = getMethodScore(b);
      } else if (sortKey === "total") {
        av = Number(a.upvotes) + Number(a.downvotes);
        bv = Number(b.upvotes) + Number(b.downvotes);
      } else {
        av = Number(a[sortKey]);
        bv = Number(b[sortKey]);
      }
      const primary = sortDir === "desc" ? bv - av : av - bv;
      if (primary !== 0) return primary;
      const totalA = Number(a.upvotes) + Number(a.downvotes);
      const totalB = Number(b.upvotes) + Number(b.downvotes);
      if (totalA !== totalB) return totalB - totalA;
      return Number(b.upvotes) - Number(a.upvotes);
    });
    return arr;
  }, [data, sortKey, sortDir, method, bayesianScores, weightedScores, wilsonScores]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortableHead({ label, sortKeyVal, children }: { label: string; sortKeyVal: SortKey; children?: React.ReactNode }) {
    return (
      <TableHead
        className="cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap"
        onClick={() => toggleSort(sortKeyVal)}
      >
        <div className="flex items-center gap-1">
          {children}
          {label}
          <ArrowUpDown className={`w-3 h-3 ${sortKey === sortKeyVal ? "text-primary" : "text-muted-foreground/50"}`} />
        </div>
      </TableHead>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 sm:py-12">
      {/* Page Header */}
      <div className="mb-6 sm:mb-10 animate-fade-in-up stagger-1">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold">Classement Global</h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Le classement de tous les sites de streaming basé sur les votes de la communauté
        </p>
      </div>

      {/* Sélecteur de méthode de classement */}
      <div className="mb-6 animate-fade-in-up stagger-2">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground shrink-0">Méthode de classement :</span>
          <div className="flex bg-muted rounded-lg p-1 gap-1">
            {(Object.keys(methodInfo) as RankingMethod[]).map((key) => (
              <button
                key={key}
                onClick={() => { setMethod(key); setSortKey("score"); setSortDir("desc"); }}
                className={`px-3 py-1.5 rounded-md text-sm transition-all ${
                  method === key
                    ? "bg-background shadow-sm font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {methodInfo[key].label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-start gap-2 mt-2.5 text-xs text-muted-foreground">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p>{methodInfo[method].description}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="rounded-xl border bg-card animate-fade-in-up stagger-3 overflow-x-auto">
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">#</TableHead>
                <TableHead>Site</TableHead>
                <SortableHead label={methodInfo[method].scoreLabel} sortKeyVal="score" />
                <SortableHead label="Upvotes" sortKeyVal="upvotes">
                  <ThumbsUp className="w-3 h-3 text-green-500" />
                </SortableHead>
                <SortableHead label="Downvotes" sortKeyVal="downvotes">
                  <ThumbsDown className="w-3 h-3 text-red-500" />
                </SortableHead>
                <SortableHead label="Total" sortKeyVal="total" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((site, index) => {
                const rank = index + 1;
                const rankClass = rank === 1 ? "rank-gold" : rank === 2 ? "rank-silver" : rank === 3 ? "rank-bronze" : "";
                return (
                  <TableRow
                    key={site.id}
                    className={`animate-fade-in-up ${index < 5 ? `stagger-${index + 1}` : ""} ${rank <= 3 ? "bg-muted/30" : ""}`}
                  >
                    <TableCell>
                      <RankBadge rank={rank} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <SiteLogo site={site} />
                        <div className="min-w-0">
                          <div className={`font-semibold ${rankClass}`}>{site.name}</div>
                          <a href={site.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary transition-colors">{site.url}</a>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {method === "raw" ? (
                        <span className={`font-bold text-lg ${Number(site.score) > 0 ? "text-green-500" : Number(site.score) < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                          {Number(site.score) > 0 ? "+" : ""}{Number(site.score)}
                        </span>
                      ) : (
                        <span className={`font-bold text-lg ${
                          getMethodScore(site) >= 0.6 ? "text-green-500" : getMethodScore(site) < 0.4 ? "text-red-500" : "text-muted-foreground"
                        }`}>
                          {(getMethodScore(site) * 100).toFixed(1)}%
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-green-500 font-medium">{Number(site.upvotes)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-red-500 font-medium">{Number(site.downvotes)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{Number(site.upvotes) + Number(site.downvotes)}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
