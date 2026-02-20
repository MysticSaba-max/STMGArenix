import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getAssetUrl } from "@/lib/api";
import { useSEO } from "@/hooks/useSEO";
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
      src={getAssetUrl(site.logo_path)}
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
  useSEO({
    title: "Classement des Meilleurs Sites de Streaming Gratuit 2026",
    description: "Découvrez le classement des meilleurs sites de streaming gratuit en 2026. Votez, comparez et trouvez les sites de streaming les plus fiables pour regarder films et séries en ligne gratuitement.",
    canonical: "/",
    keywords: "meilleur site de streaming, site de streaming gratuit, streaming gratuit, film streaming, série streaming, comparatif streaming, top streaming 2026, regarder film en ligne, streaming sans inscription, streaming HD, streaming VOSTFR",
  });

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

      {/* SEO Content Section */}
      <section className="container mx-auto px-4 py-12 sm:py-16">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="scroll-reveal">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              Trouvez le meilleur site de streaming gratuit
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              STMGArenix est la plateforme communautaire de référence pour comparer et classer les
              <strong> meilleurs sites de streaming gratuit</strong> en {new Date().getFullYear()}.
              Que vous cherchiez un <strong>site de streaming sans pub</strong>, un site avec un
              <strong> large catalogue de films et séries</strong>, ou simplement le
              <strong> streaming le plus fiable</strong> avec des liens qui fonctionnent, notre classement
              mis à jour en temps réel vous aide à trouver la perle rare.
            </p>
          </div>

          <div className="scroll-reveal">
            <h3 className="text-xl font-semibold mb-3">Comment fonctionne le classement ?</h3>
            <p className="text-muted-foreground leading-relaxed">
              Notre classement repose entièrement sur les <strong>votes de la communauté</strong>.
              Chaque utilisateur peut voter pour ou contre un site, et noter les sites selon
              <strong> 5 catégories</strong> : quantité de publicités, facilité d'utilisation, fiabilité des liens,
              richesse du catalogue et qualité vidéo. Plus un site reçoit de votes positifs, plus il monte
              dans le classement.
            </p>
          </div>

          <div className="scroll-reveal">
            <h3 className="text-xl font-semibold mb-3">Pourquoi utiliser STMGArenix ?</h3>
            <ul className="text-muted-foreground space-y-2">
              <li className="flex gap-2">
                <span className="text-primary font-bold">•</span>
                <span><strong>Classement en temps réel</strong> — Les scores sont mis à jour à chaque vote</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold">•</span>
                <span><strong>Avis communautaires</strong> — Basé sur les vrais retours des utilisateurs, pas des classements sponsorisés</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold">•</span>
                <span><strong>5 critères détaillés</strong> — Pubs, facilité, liens, catalogue et qualité vidéo</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold">•</span>
                <span><strong>Proposez vos sites</strong> — La communauté enrichit le classement en continu</span>
              </li>
            </ul>
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
