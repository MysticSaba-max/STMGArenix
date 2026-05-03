import { useEffect, useMemo, useState } from "react";
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
import { ScoreTooltip } from "@/components/ScoreTooltip";
import { ThumbsUp, ThumbsDown, Loader2, Crown, Medal, Award, ArrowUpDown, Info, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TrustScoreInfoDialog } from "@/components/TrustScoreInfoDialog";

interface LeaderboardEntry {
  id: number;
  name: string;
  url: string;
  logo_path: string;
  score: number;
  upvotes: number;
  downvotes: number;
  weighted_count: number;
  trust_score: number;
  has_enough_votes: boolean;
}

type SortKey = "trust_score" | "upvotes" | "downvotes" | "total";
type SortDir = "asc" | "desc";

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

function RankBadge({ rank, dimmed }: { rank: number; dimmed?: boolean }) {
  if (dimmed) {
    return <span className="text-muted-foreground/50 font-medium w-8 text-center block">—</span>;
  }
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

function ScoreDisplay({ site }: { site: LeaderboardEntry }) {
  const pct = Number(site.trust_score) * 100;
  const color =
    pct >= 60 ? "text-green-500" : pct < 40 ? "text-red-500" : "text-muted-foreground";
  const total = Number(site.upvotes) + Number(site.downvotes);
  const rawRatio = total > 0 ? (Number(site.upvotes) / total) * 100 : 0;

  return (
    <ScoreTooltip
      contentClassName="px-3 py-2"
      content={
        <div className="text-xs space-y-1">
          <div>
            <span className="text-muted-foreground">TrustScore : </span>
            <span className="font-semibold">{pct.toFixed(2)}%</span>
          </div>
          <div>
            <span className="text-muted-foreground">Ratio brut : </span>
            <span className="font-semibold">
              {rawRatio.toFixed(1)}% ({Number(site.upvotes)} / {total})
            </span>
          </div>
        </div>
      }
    >
      <span className={`font-bold text-lg inline-flex items-center gap-1.5 ${color}`}>
        {pct.toFixed(1)}%
        <Info className="w-3 h-3 opacity-50 shrink-0" />
      </span>
    </ScoreTooltip>
  );
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
  const [sortKey, setSortKey] = useState<SortKey>("trust_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    api.getLeaderboard()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const sorted = useMemo(() => {
    const arr = [...data];
    arr.sort((a, b) => {
      // Sites peu votés toujours en bas
      if (a.has_enough_votes !== b.has_enough_votes) {
        return a.has_enough_votes ? -1 : 1;
      }
      let av: number, bv: number;
      if (sortKey === "trust_score") {
        av = Number(a.trust_score);
        bv = Number(b.trust_score);
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
  }, [data, sortKey, sortDir]);

  const ranked = sorted.filter((s) => s.has_enough_votes);
  const newcomers = sorted.filter((s) => !s.has_enough_votes);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortableHead({
    label,
    sortKeyVal,
    children,
  }: {
    label: string;
    sortKeyVal: SortKey;
    children?: React.ReactNode;
  }) {
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
      <div className="mb-6 sm:mb-10 animate-fade-in-up stagger-1">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold">Classement Global</h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Le classement de tous les sites de streaming basé sur les votes de la communauté
        </p>
      </div>

      {/* Explication du TrustScore */}
      <div className="mb-6 animate-fade-in-up stagger-2 rounded-xl border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="space-y-2 flex-1 min-w-0">
            <h2 className="text-sm font-semibold">STMG TrustScore</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Score unique inspiré de Trustpilot. Combine{" "}
              <strong className="text-foreground">la décroissance temporelle</strong> (votes
              récents privilégiés, demi-vie d'un an), un{" "}
              <strong className="text-foreground">lissage bayésien</strong> avec un prior neutre
              à 50%, et la{" "}
              <strong className="text-foreground">borne inférieure Wilson à 95%</strong> pour
              pénaliser fortement les petits échantillons. Un site a besoin d'au moins 5 votes
              effectifs pour être classé.
            </p>
            <div className="pt-1">
              <TrustScoreInfoDialog />
            </div>
          </div>
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
                <SortableHead label="TrustScore" sortKeyVal="trust_score" />
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
              {ranked.map((site, index) => {
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
                      <ScoreDisplay site={site} />
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
              {newcomers.length > 0 && (
                <>
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="py-3">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                        <Info className="w-3.5 h-3.5" />
                        <span>Pas encore assez de votes pour être classés</span>
                      </div>
                    </TableCell>
                  </TableRow>
                  {newcomers.map((site) => {
                    const total = Number(site.upvotes) + Number(site.downvotes);
                    return (
                    <TableRow key={site.id} className="opacity-60 grayscale">
                      <TableCell>
                        <RankBadge rank={0} dimmed />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <SiteLogo site={site} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{site.name}</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-medium">
                                Nouveau
                              </Badge>
                            </div>
                            <a href={site.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary transition-colors">{site.url}</a>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {total > 0 ? (
                          <ScoreDisplay site={site} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-green-500 font-medium">{Number(site.upvotes)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-red-500 font-medium">{Number(site.downvotes)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">{total}</span>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
