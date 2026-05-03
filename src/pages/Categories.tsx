import { useEffect, useState, useMemo } from "react";
import { api, getAssetUrl } from "@/lib/api";
import { useSEO } from "@/hooks/useSEO";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScoreTooltip } from "@/components/ScoreTooltip";
import {
  Ban,
  MousePointerClick,
  Link as LinkIcon,
  Library,
  MonitorPlay,
  Loader2,
  Crown,
  Medal,
  Award,
  Star,
  Search,
  ArrowUpDown,
  Info,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TrustScoreInfoDialog } from "@/components/TrustScoreInfoDialog";

interface CategoryEntry {
  id: number;
  name: string;
  url: string;
  logo_path: string;
  avg_score: number;
  vote_count: number;
  weighted_count: number;
  trust_score: number;
  has_enough_votes: boolean;
  distribution: { 1: number; 2: number; 3: number; 4: number; 5: number };
}

interface CategoryData {
  [category: string]: CategoryEntry[];
}

const categories = [
  { key: "pubs", label: "Publicités", icon: Ban, description: "Moins il y a de pubs, mieux c'est" },
  { key: "facilite", label: "Facilité", icon: MousePointerClick, description: "Navigation et ergonomie du site" },
  { key: "liens", label: "Liens", icon: LinkIcon, description: "Fiabilité des liens de streaming" },
  { key: "catalogue", label: "Catalogue", icon: Library, description: "Variété et richesse du contenu disponible" },
  { key: "qualite_video", label: "Qualité Vidéo", icon: MonitorPlay, description: "Qualité de l'image et du son" },
];

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

function DistributionBar({
  stars,
  count,
  max,
  index,
}: {
  stars: number;
  count: number;
  max: number;
  index: number;
}) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="flex items-center gap-1 w-9 shrink-0">
        <span className="font-medium tabular-nums w-3 text-center inline-block">
          {stars}
        </span>
        <Star className="w-3 h-3 fill-yellow-500 text-yellow-500 shrink-0" />
      </div>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-[100px]">
        <div
          className="h-full bg-yellow-500 rounded-full animate-histogram-bar"
          style={{ width: `${pct}%`, animationDelay: `${index * 60}ms` }}
        />
      </div>
      <span className="w-8 text-right tabular-nums text-muted-foreground shrink-0">
        {count}
      </span>
    </div>
  );
}

function StarDisplay({
  score,
  avg,
  voteCount,
  distribution,
  categoryLabel,
  CategoryIcon,
}: {
  score: number;
  avg: number;
  voteCount: number;
  distribution?: CategoryEntry["distribution"];
  categoryLabel: string;
  CategoryIcon: LucideIcon;
}) {
  const rounded = Math.round(score * 10) / 10;
  const dist = distribution ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const max = Math.max(dist[1], dist[2], dist[3], dist[4], dist[5], 1);
  return (
    <ScoreTooltip
      contentClassName="w-64 px-3 py-2"
      content={
        <div className="text-xs space-y-2.5">
          <div className="flex items-center gap-1.5 pb-2 border-b -mx-3 px-3">
            <CategoryIcon className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="font-semibold uppercase tracking-wide text-[11px]">
              {categoryLabel}
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">TrustScore</span>
              <span className="font-semibold">{rounded.toFixed(2)} / 5</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Moyenne brute</span>
              <span className="font-semibold">{avg.toFixed(2)} / 5</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Votes</span>
              <span className="font-semibold">{voteCount}</span>
            </div>
          </div>
          {voteCount > 0 && (
            <div className="space-y-1 pt-2 border-t">
              <div className="text-muted-foreground mb-1.5 font-medium">
                Distribution
              </div>
              <DistributionBar stars={5} count={dist[5]} max={max} index={0} />
              <DistributionBar stars={4} count={dist[4]} max={max} index={1} />
              <DistributionBar stars={3} count={dist[3]} max={max} index={2} />
              <DistributionBar stars={2} count={dist[2]} max={max} index={3} />
              <DistributionBar stars={1} count={dist[1]} max={max} index={4} />
            </div>
          )}
        </div>
      }
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star
              key={i}
              className={`w-4 h-4 ${
                i <= Math.round(score)
                  ? "fill-yellow-500 text-yellow-500"
                  : "text-muted-foreground/30"
              }`}
            />
          ))}
        </div>
        <span className="text-sm font-medium">{rounded.toFixed(1)}</span>
        <Info className="w-3 h-3 text-muted-foreground/50 shrink-0" />
      </div>
    </ScoreTooltip>
  );
}

export default function Categories() {
  useSEO({
    title: "Comparatif Streaming par Catégorie - Pubs, Qualité, Catalogue",
    description: "Comparez les sites de streaming par catégorie : publicités, facilité d'utilisation, fiabilité des liens, richesse du catalogue et qualité vidéo. Trouvez le site de streaming sans pub avec le meilleur catalogue.",
    canonical: "/categories",
    keywords: "streaming sans pub, streaming qualité HD, meilleur catalogue streaming, site streaming fiable, streaming sans publicité, comparatif qualité streaming, streaming liens fiables, site streaming facile",
  });

  type CatSortKey = "trust_score" | "vote_count";
  type SortDir = "asc" | "desc";

  const [data, setData] = useState<CategoryData>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<CatSortKey>("trust_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: CatSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  useEffect(() => {
    api.getCategoryLeaderboard()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const sortedByCategory = useMemo(() => {
    const result: Record<string, CategoryEntry[]> = {};
    for (const cat of categories) {
      const entries = (data[cat.key] || [])
        .filter((entry) =>
          entry.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .slice()
        .sort((a, b) => {
          // Sites peu votés toujours en bas, peu importe le tri
          if (a.has_enough_votes !== b.has_enough_votes) {
            return a.has_enough_votes ? -1 : 1;
          }
          let av: number, bv: number;
          if (sortKey === "trust_score") {
            av = Number(a.trust_score);
            bv = Number(b.trust_score);
          } else {
            av = Number(a.vote_count);
            bv = Number(b.vote_count);
          }
          const primary = sortDir === "desc" ? bv - av : av - bv;
          if (primary !== 0) return primary;
          return Number(b.vote_count) - Number(a.vote_count);
        });
      result[cat.key] = entries;
    }
    return result;
  }, [data, searchQuery, sortKey, sortDir]);

  return (
    <div className="container mx-auto px-4 py-6 sm:py-12">
      <div className="mb-6 sm:mb-10 animate-fade-in-up stagger-1">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold">Classement par Catégories</h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Comparez les sites de streaming selon différents critères de qualité
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
              Score de confiance unique qui combine{" "}
              <strong className="text-foreground">la moyenne pondérée par le temps</strong> (votes
              récents privilégiés), un{" "}
              <strong className="text-foreground">lissage bayésien</strong> avec un prior calculé
              dynamiquement sur l'ensemble des sites, et une{" "}
              <strong className="text-foreground">borne inférieure de confiance à 95%</strong>{" "}
              avec une variance plancher pour pénaliser les petits échantillons. Un site a besoin
              d'au moins 10 votes effectifs par catégorie pour être classé. Inspiré de Trustpilot.
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
        <Tabs defaultValue="pubs" className="animate-fade-in-up stagger-2">
          <div className="overflow-x-auto -mx-4 px-4 mb-6">
            <TabsList className="inline-flex h-auto gap-1 w-max">
              {categories.map(({ key, label, icon: Icon }) => (
                <TabsTrigger key={key} value={key} className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 text-xs sm:text-sm whitespace-nowrap">
                  <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="mb-6">
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
          </div>

          {categories.map(({ key, label, icon: Icon, description }) => {
            const entries = sortedByCategory[key] || [];
            const rankedEntries = entries.filter((e) => e.has_enough_votes);
            const newcomerEntries = entries.filter((e) => !e.has_enough_votes);

            return (
              <TabsContent key={key} value={key}>
                <div className="mb-4">
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
                <div className="rounded-xl border bg-card overflow-x-auto">
                  <Table className="min-w-[500px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14">#</TableHead>
                        <TableHead>Site</TableHead>
                        <TableHead
                          className="cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap"
                          onClick={() => toggleSort("trust_score")}
                        >
                          <div className="flex items-center gap-1">
                            TrustScore
                            <ArrowUpDown className={`w-3 h-3 ${sortKey === "trust_score" ? "text-primary" : "text-muted-foreground/50"}`} />
                          </div>
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap"
                          onClick={() => toggleSort("vote_count")}
                        >
                          <div className="flex items-center gap-1">
                            Nombre de votes
                            <ArrowUpDown className={`w-3 h-3 ${sortKey === "vote_count" ? "text-primary" : "text-muted-foreground/50"}`} />
                          </div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            Aucun vote dans cette catégorie pour le moment
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {rankedEntries.map((entry, index) => {
                            const rank = index + 1;
                            const rankClass = rank === 1 ? "rank-gold" : rank === 2 ? "rank-silver" : rank === 3 ? "rank-bronze" : "";
                            return (
                              <TableRow
                                key={entry.id}
                                className={`animate-fade-in-up ${index < 5 ? `stagger-${index + 1}` : ""} ${rank <= 3 ? "bg-muted/30" : ""}`}
                              >
                                <TableCell>
                                  <RankBadge rank={rank} />
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-3">
                                    <SiteLogo site={entry} />
                                    <div className="min-w-0">
                                      <span className={`font-semibold ${rankClass}`}>{entry.name}</span>
                                      <a href={entry.url} target="_blank" rel="noopener noreferrer" className="block text-xs text-muted-foreground hover:text-primary transition-colors">{entry.url}</a>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <StarDisplay
                                    score={Number(entry.trust_score)}
                                    avg={Number(entry.avg_score)}
                                    voteCount={Number(entry.vote_count)}
                                    distribution={entry.distribution}
                                    categoryLabel={label}
                                    CategoryIcon={Icon}
                                  />
                                </TableCell>
                                <TableCell>
                                  <span className="text-muted-foreground">{Number(entry.vote_count)}</span>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          {newcomerEntries.length > 0 && (
                            <>
                              <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={4} className="py-3">
                                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                                    <Info className="w-3.5 h-3.5" />
                                    <span>Pas encore assez de votes pour être classés</span>
                                  </div>
                                </TableCell>
                              </TableRow>
                              {newcomerEntries.map((entry) => (
                                <TableRow key={entry.id} className="opacity-60 grayscale">
                                  <TableCell>
                                    <RankBadge rank={0} dimmed />
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-3">
                                      <SiteLogo site={entry} />
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="font-medium">{entry.name}</span>
                                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-medium">
                                            Nouveau
                                          </Badge>
                                        </div>
                                        <a href={entry.url} target="_blank" rel="noopener noreferrer" className="block text-xs text-muted-foreground hover:text-primary transition-colors">{entry.url}</a>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    {entry.vote_count > 0 ? (
                                      <StarDisplay
                                        score={Number(entry.trust_score)}
                                        avg={Number(entry.avg_score)}
                                        voteCount={Number(entry.vote_count)}
                                        distribution={entry.distribution}
                                        categoryLabel={label}
                                        CategoryIcon={Icon}
                                      />
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-muted-foreground">{Number(entry.vote_count)}</span>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </>
                          )}
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
}
