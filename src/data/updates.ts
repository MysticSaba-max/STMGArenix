import { Sparkles, Wrench, Bug, type LucideIcon } from "lucide-react";

export interface UpdateEntry {
  date: string;
  tag: "new" | "improvement" | "fix";
  title: string;
  items: string[];
}

export interface TagConfig {
  label: string;
  icon: LucideIcon;
  className: string;
}

export const tagConfig: Record<UpdateEntry["tag"], TagConfig> = {
  new: { label: "Nouveau", icon: Sparkles, className: "bg-green-500/10 text-green-500 border-green-500/20" },
  improvement: { label: "Amélioration", icon: Wrench, className: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  fix: { label: "Correction", icon: Bug, className: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
};

export const updates: UpdateEntry[] = [
  {
    date: "3 mai 2026",
    tag: "improvement",
    title: "STMG TrustScore",
    items: [
      "Score unique inspiré de Trustpilot (remplace les 4 méthodes)",
      "Lissage bayésien + borne de confiance Wilson",
      "Décroissance temporelle des votes (demi-vie d'un an)",
      "Sites avec moins de 5 votes marqués « Nouveau »",
    ],
  },
  {
    date: "26 fév 2026",
    tag: "new",
    title: "Classement intelligent",
    items: [
      "Moyenne Bayésienne (formule IMDb)",
      "Score Wilson (formule Reddit)",
      "Sélecteur de méthode dans le classement",
    ],
  },
  {
    date: "25 fév 2026",
    tag: "new",
    title: "Votes par catégorie",
    items: [
      "Notation 1-5 étoiles par catégorie",
      "5 critères : Pubs, Facilité, Liens, Catalogue, Qualité Vidéo",
    ],
  },
  {
    date: "24 fév 2026",
    tag: "improvement",
    title: "Anti-triche renforcé",
    items: [
      "Détection de bots améliorée",
      "Vérification Turnstile CAPTCHA",
      "Déduplication par empreinte + IP",
    ],
  },
  {
    date: "20 fév 2026",
    tag: "new",
    title: "Lancement de STMGArenix",
    items: [
      "Système de vote upvote/downvote",
      "Classement global en temps réel",
      "Proposition de sites par la communauté",
    ],
  },
];
