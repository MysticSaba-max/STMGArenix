import { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ThumbsUp, ThumbsDown, Loader2, Crown, Medal, Award, ArrowUpDown } from "lucide-react";

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
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("score");
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
      let av: number, bv: number;
      if (sortKey === "total") {
        av = Number(a.upvotes) + Number(a.downvotes);
        bv = Number(b.upvotes) + Number(b.downvotes);
      } else {
        av = Number(a[sortKey]);
        bv = Number(b[sortKey]);
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return arr;
  }, [data, sortKey, sortDir]);

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

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="rounded-xl border bg-card animate-fade-in-up stagger-2 overflow-x-auto">
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">#</TableHead>
                <TableHead>Site</TableHead>
                <SortableHead label="Score" sortKeyVal="score" />
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
                      <span className={`font-bold text-lg ${Number(site.score) > 0 ? "text-green-500" : Number(site.score) < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                        {Number(site.score) > 0 ? "+" : ""}{Number(site.score)}
                      </span>
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
