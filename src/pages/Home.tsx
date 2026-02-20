import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, TrendingUp, TrendingDown, Crown, Medal, Award, Loader2, BarChart3, Users } from "lucide-react";

interface LeaderboardEntry {
  id: number;
  name: string;
  url: string;
  logo_path: string;
  score: number;
  upvotes: number;
  downvotes: number;
}

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

function PodiumCard({ site, rank }: { site: LeaderboardEntry; rank: number }) {
  const rankConfig = {
    1: { icon: Crown, colorClass: "rank-gold", label: "#1", elevation: "md:-mt-8", glow: "shadow-[0_0_40px_rgba(220,38,38,0.25)]", border: "border-yellow-500/30" },
    2: { icon: Medal, colorClass: "rank-silver", label: "#2", elevation: "", glow: "", border: "border-gray-400/20" },
    3: { icon: Award, colorClass: "rank-bronze", label: "#3", elevation: "", glow: "", border: "border-orange-700/20" },
  }[rank]!;

  const RankIcon = rankConfig.icon;

  return (
    <Card className={`relative overflow-hidden transition-all duration-300 hover:scale-105 ${rankConfig.glow} ${rankConfig.border} ${rankConfig.elevation}`}>
      {rank === 1 && (
        <div className="absolute inset-0 bg-gradient-to-b from-yellow-500/5 to-transparent pointer-events-none" />
      )}
      <CardContent className="flex flex-col items-center text-center pt-4 sm:pt-6 gap-3 sm:gap-4">
        <div className="relative">
          <SiteLogo site={site} size={rank === 1 ? 64 : 48} />
          <div className="absolute -top-2 -right-2 flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-background border-2 shadow-md">
            <RankIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
        </div>
        <div>
          <span className={`text-xl sm:text-2xl font-bold ${rankConfig.colorClass}`}>{rankConfig.label}</span>
          <h3 className="text-base sm:text-lg font-semibold mt-1">{site.name}</h3>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 text-sm">
          <span className="flex items-center gap-1 text-green-500">
            <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            {site.upvotes}
          </span>
          <span className="text-lg sm:text-xl font-bold">{site.score}</span>
          <span className="flex items-center gap-1 text-red-500">
            <TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            {site.downvotes}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getLeaderboard()
      .then(setLeaderboard)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const top3 = leaderboard.slice(0, 3);
  const totalVotes = leaderboard.reduce((sum, s) => sum + Number(s.upvotes) + Number(s.downvotes), 0);

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative hero-gradient grain-overlay overflow-hidden">
        <div className="relative z-10 container mx-auto px-4 py-16 sm:py-24 md:py-32 text-center">
          <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight animate-fade-in-up stagger-1">
            L'arène du{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              streaming
            </span>
          </h1>
          <p className="mt-4 sm:mt-6 text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto animate-fade-in-up stagger-2">
            Votez, comparez et découvrez les meilleurs sites de streaming
          </p>
          <div className="mt-8 sm:mt-10 flex flex-wrap justify-center gap-3 sm:gap-4 animate-fade-in-up stagger-3">
            <Button asChild size="lg" className="text-base px-8">
              <Link to="/leaderboard">
                <Trophy className="w-5 h-5 mr-2" />
                Voir le classement
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="text-base px-8">
              <Link to="/vote">
                Voter maintenant
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Top 3 Podium Section */}
      <section className="container mx-auto px-4 py-10 sm:py-16 md:py-24">
        <div className="text-center mb-8 sm:mb-12 scroll-reveal">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold">
            Le Podium
          </h2>
          <p className="mt-3 text-muted-foreground">
            Les trois sites de streaming les mieux notés par la communauté
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : top3.length >= 3 ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 max-w-4xl mx-auto items-end">
            <div className="scroll-reveal delay-2 order-2 sm:order-1">
              <PodiumCard site={top3[1]} rank={2} />
            </div>
            <div className="scroll-reveal delay-1 order-1 sm:order-2">
              <PodiumCard site={top3[0]} rank={1} />
            </div>
            <div className="scroll-reveal delay-3 order-3">
              <PodiumCard site={top3[2]} rank={3} />
            </div>
          </div>
        ) : (
          <p className="text-center text-muted-foreground">Pas encore assez de données pour afficher le podium.</p>
        )}
      </section>

      {/* Stats Bar */}
      <section className="border-y bg-muted/30">
        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
            <div className="text-center scroll-reveal delay-1">
              <div className="flex items-center justify-center gap-2 text-primary mb-2">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div className="text-3xl font-bold">{leaderboard.length}</div>
              <div className="text-sm text-muted-foreground mt-1">Sites répertoriés</div>
            </div>
            <div className="text-center scroll-reveal delay-2">
              <div className="flex items-center justify-center gap-2 text-primary mb-2">
                <Users className="w-5 h-5" />
              </div>
              <div className="text-3xl font-bold">{totalVotes}</div>
              <div className="text-sm text-muted-foreground mt-1">Votes comptabilisés</div>
            </div>
            <div className="text-center scroll-reveal delay-3">
              <div className="flex items-center justify-center gap-2 text-primary mb-2">
                <Trophy className="w-5 h-5" />
              </div>
              <div className="text-3xl font-bold">5</div>
              <div className="text-sm text-muted-foreground mt-1">Catégories évaluées</div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="container mx-auto px-4 py-8 text-center">
          <p className="font-bold text-lg">
            STMG<span className="text-primary">Arenix</span>
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Fait avec passion pour le streaming
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            &copy; {new Date().getFullYear()} STMGArenix
          </p>
        </div>
      </footer>
    </div>
  );
}
