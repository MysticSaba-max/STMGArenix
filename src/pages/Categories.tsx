import { useEffect, useState, useMemo, useCallback } from "react";
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
import { Ban, MousePointerClick, Link as LinkIcon, Library, MonitorPlay, Loader2, Crown, Medal, Award, Star, Search, ArrowUpDown, Info } from "lucide-react";
import { Input } from "@/components/ui/input";

interface CategoryEntry {
  id: number;
  name: string;
  url: string;
  logo_path: string;
  avg_score: number;
  vote_count: number;
}

interface CategoryData {
  [category: string]: CategoryEntry[];
}

type RankingMethod = "raw" | "bayesian" | "wilson";

const BAYESIAN_M = 10;

const methodInfo: Record<RankingMethod, { label: string; description: string }> = {
  raw: {
    label: "Score brut",
    description: "Moyenne simple des notes. Peut être trompeuse avec peu de votes.",
  },
  bayesian: {
    label: "Bayésien",
    description: "Moyenne pondérée (formule IMDb). Les sites avec peu de votes sont tirés vers la moyenne globale de la catégorie.",
  },
  wilson: {
    label: "Wilson",
    description: "Borne inférieure de confiance à 95%. Estimation pessimiste réaliste — pénalise fortement les petits échantillons.",
  },
};

function computeCategoryBayesian(entries: CategoryEntry[]): Map<number, number> {
  const totalWeighted = entries.reduce((sum, e) => sum + Number(e.avg_score) * Number(e.vote_count), 0);
  const totalVotes = entries.reduce((sum, e) => sum + Number(e.vote_count), 0);
  const C = totalVotes > 0 ? totalWeighted / totalVotes : 3;

  const scores = new Map<number, number>();
  for (const entry of entries) {
    const v = Number(entry.vote_count);
    const R = Number(entry.avg_score);
    if (v === 0) {
      scores.set(entry.id, C);
      continue;
    }
    const WR = (v / (v + BAYESIAN_M)) * R + (BAYESIAN_M / (v + BAYESIAN_M)) * C;
    scores.set(entry.id, WR);
  }
  return scores;
}

function computeCategoryWilson(entries: CategoryEntry[]): Map<number, number> {
  const z = 1.96;
  const scores = new Map<number, number>();

  for (const entry of entries) {
    const n = Number(entry.vote_count);
    if (n === 0) {
      scores.set(entry.id, 0);
      continue;
    }
    // Normaliser la note 1-5 vers 0-1
    const p = (Number(entry.avg_score) - 1) / 4;
    const lower =
      (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) /
      (1 + (z * z) / n);
    // Reconvertir 0-1 vers 1-5
    scores.set(entry.id, Math.max(1, lower * 4 + 1));
  }
  return scores;
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

function StarDisplay({ score }: { score: number }) {
  const rounded = Math.round(score * 10) / 10;
  return (
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
    </div>
  );
}

export default function Categories() {
  useSEO({
    title: "Comparatif Streaming par Catégorie - Pubs, Qualité, Catalogue",
    description: "Comparez les sites de streaming par catégorie : publicités, facilité d'utilisation, fiabilité des liens, richesse du catalogue et qualité vidéo. Trouvez le site de streaming sans pub avec le meilleur catalogue.",
    canonical: "/categories",
    keywords: "streaming sans pub, streaming qualité HD, meilleur catalogue streaming, site streaming fiable, streaming sans publicité, comparatif qualité streaming, streaming liens fiables, site streaming facile",
  });

  type CatSortKey = "avg_score" | "vote_count";
  type SortDir = "asc" | "desc";

  const [data, setData] = useState<CategoryData>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<CatSortKey>("avg_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [method, setMethod] = useState<RankingMethod>("wilson");

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

  // Pré-calculer les scores Bayésien et Wilson par catégorie
  const bayesianByCategory = useMemo(() => {
    const result: Record<string, Map<number, number>> = {};
    for (const cat of categories) {
      result[cat.key] = computeCategoryBayesian(data[cat.key] || []);
    }
    return result;
  }, [data]);

  const wilsonByCategory = useMemo(() => {
    const result: Record<string, Map<number, number>> = {};
    for (const cat of categories) {
      result[cat.key] = computeCategoryWilson(data[cat.key] || []);
    }
    return result;
  }, [data]);

  const getScore = useCallback((catKey: string, entry: CategoryEntry): number => {
    if (method === "bayesian") return bayesianByCategory[catKey]?.get(entry.id) ?? Number(entry.avg_score);
    if (method === "wilson") return wilsonByCategory[catKey]?.get(entry.id) ?? 0;
    return Number(entry.avg_score);
  }, [method, bayesianByCategory, wilsonByCategory]);

  return (
    <div className="container mx-auto px-4 py-6 sm:py-12">
      {/* Page Header */}
      <div className="mb-6 sm:mb-10 animate-fade-in-up stagger-1">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold">Classement par Catégories</h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Comparez les sites de streaming selon différents critères de qualité
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
                onClick={() => { setMethod(key); setSortKey("avg_score"); setSortDir("desc"); }}
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

          {/* Barre de recherche */}
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

          {categories.map(({ key, description }) => {
            const entries = (data[key] || [])
              .filter((entry) =>
                entry.name.toLowerCase().includes(searchQuery.toLowerCase())
              )
              .sort((a, b) => {
                let av: number, bv: number;
                if (sortKey === "avg_score") {
                  av = getScore(key, a);
                  bv = getScore(key, b);
                } else {
                  av = Number(a[sortKey]);
                  bv = Number(b[sortKey]);
                }
                return sortDir === "desc" ? bv - av : av - bv;
              });
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
                          onClick={() => toggleSort("avg_score")}
                        >
                          <div className="flex items-center gap-1">
                            {method === "raw" ? "Score Moyen" : method === "bayesian" ? "Score Bayésien" : "Score Wilson"}
                            <ArrowUpDown className={`w-3 h-3 ${sortKey === "avg_score" ? "text-primary" : "text-muted-foreground/50"}`} />
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
                        entries.map((entry, index) => {
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
                                <StarDisplay score={getScore(key, entry)} />
                              </TableCell>
                              <TableCell>
                                <span className="text-muted-foreground">{Number(entry.vote_count)}</span>
                              </TableCell>
                            </TableRow>
                          );
                        })
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
