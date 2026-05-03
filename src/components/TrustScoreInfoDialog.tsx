import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  HelpCircle,
  Calculator,
  TrendingUp,
  Clock,
  ShieldQuestion,
  Users,
  CheckCircle2,
  XCircle,
} from "lucide-react";

export function TrustScoreInfoDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <HelpCircle className="w-3.5 h-3.5" />
          Comment ça marche ?
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Comment fonctionne le STMG TrustScore ?</DialogTitle>
          <DialogDescription>
            L'algorithme exact de classement, expliqué en clair pour tout le monde.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          {/* TL;DR */}
          <section className="rounded-lg bg-primary/5 border border-primary/20 p-4">
            <h3 className="font-semibold text-base mb-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              En résumé
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Le TrustScore résume la qualité d'un site en combinant{" "}
              <strong className="text-foreground">trois éléments</strong> : le nombre de votes
              (combien de gens ont jugé), l'âge des votes (les récents pèsent plus), et notre
              certitude sur la note (avec peu de votes, on est moins sûrs). Inspiré de{" "}
              <strong className="text-foreground">Trustpilot</strong>,{" "}
              <strong className="text-foreground">IMDb</strong> et{" "}
              <strong className="text-foreground">Reddit</strong>.
            </p>
          </section>

          {/* Pourquoi pas la moyenne simple ? */}
          <section>
            <h3 className="font-semibold text-base mb-2 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500" />
              Pourquoi pas la moyenne simple ?
            </h3>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Imagine deux sites :
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div className="rounded-lg border p-3">
                <div className="font-semibold mb-1">Site A</div>
                <div className="text-xs text-muted-foreground">
                  1 vote à 5 étoiles
                </div>
                <div className="mt-2 text-lg font-bold">Moyenne : 5.0 ★</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="font-semibold mb-1">Site B</div>
                <div className="text-xs text-muted-foreground">
                  500 votes, moyenne 4.5
                </div>
                <div className="mt-2 text-lg font-bold">Moyenne : 4.5 ★</div>
              </div>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Avec une moyenne brute, le Site A « gagne » alors qu'on n'a aucune idée si
              ce 5 ★ unique est représentatif. C'était exactement le bug du classement
              précédent. Le TrustScore corrige ça.
            </p>
          </section>

          {/* Lissage bayésien */}
          <section>
            <h3 className="font-semibold text-base mb-2 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-blue-500" />
              Le lissage bayésien (en clair)
            </h3>
            <p className="text-muted-foreground leading-relaxed mb-3">
              L'idée : <strong className="text-foreground">chaque catégorie a une « note typique »</strong>{" "}
              calculée sur tous les sites (par exemple ~3 ★ pour Pubs). Quand un site a peu
              de votes, on <em>mélange</em> sa note avec cette moyenne typique. Plus le site
              a de votes, moins le mélange compte.
            </p>
            <div className="rounded-lg bg-muted/50 border p-3 font-mono text-xs leading-relaxed">
              note_finale = (votes × note_du_site + 12 × note_typique)
              <br />
              <span className="ml-[12.7ch]">/ (votes + 12)</span>
            </div>
            <div className="mt-3 rounded-lg border p-3">
              <div className="text-xs font-semibold mb-2">Exemple concret</div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div>Site avec <strong className="text-foreground">5 votes à 4.8 ★</strong>, note typique de la catégorie = 3.0 ★</div>
                <div className="font-mono pt-1">
                  → (5 × 4.8 + 12 × 3.0) / (5 + 12) = 60 / 17 = <strong className="text-foreground">3.5 ★</strong>
                </div>
                <div className="pt-1">
                  Les 5 votes du site « tirent » peu, la note typique « tire » beaucoup
                  → résultat tempéré.
                </div>
                <div>À 1000 votes, la note du site domine totalement.</div>
              </div>
            </div>
          </section>

          {/* Intervalle de confiance */}
          <section>
            <h3 className="font-semibold text-base mb-2 flex items-center gap-2">
              <ShieldQuestion className="w-4 h-4 text-amber-500" />
              L'intervalle de confiance
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Une fois la note lissée, on{" "}
              <strong className="text-foreground">soustrait une marge d'incertitude</strong>{" "}
              inversement proportionnelle à la racine carrée du nombre de votes. Plus il y
              a de votes, plus la marge est petite. C'est ce qu'on appelle la{" "}
              <strong className="text-foreground">borne inférieure de confiance à 95%</strong>{" "}
              (formule Wilson pour les votes up/down — identique au tri « best » de Reddit ;
              borne gaussienne équivalente pour les notes 1-5).
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              Concrètement : avec 5 votes, l'erreur peut être ±0.5 ★ ; avec 1000 votes,
              elle est ±0.06 ★.
            </p>
          </section>

          {/* Décroissance temporelle */}
          <section>
            <h3 className="font-semibold text-base mb-2 flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-500" />
              La décroissance temporelle
            </h3>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Les sites de streaming changent <strong className="text-foreground">vite</strong>.
              Un site parfait en 2024 peut être pourri aujourd'hui. On donne donc plus de
              poids aux votes récents, avec une demi-vie d'un an :
            </p>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 font-semibold">Âge du vote</th>
                    <th className="text-right p-2 font-semibold">Poids</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t">
                    <td className="p-2 text-muted-foreground">Aujourd'hui</td>
                    <td className="p-2 text-right font-mono">100%</td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2 text-muted-foreground">6 mois</td>
                    <td className="p-2 text-right font-mono">~71%</td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2 text-muted-foreground">1 an</td>
                    <td className="p-2 text-right font-mono">50%</td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2 text-muted-foreground">2 ans</td>
                    <td className="p-2 text-right font-mono">25%</td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2 text-muted-foreground">5 ans</td>
                    <td className="p-2 text-right font-mono">~3%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Seuil minimum */}
          <section>
            <h3 className="font-semibold text-base mb-2 flex items-center gap-2">
              <Users className="w-4 h-4 text-green-500" />
              Le seuil minimum de votes
            </h3>
            <p className="text-muted-foreground leading-relaxed mb-2">
              En dessous d'un certain nombre de votes, on n'a pas assez d'information pour
              classer le site de manière fiable. Il est alors marqué « Nouveau » et placé en
              bas, sans polluer le classement principal.
            </p>
            <ul className="space-y-1 text-muted-foreground text-xs">
              <li className="flex gap-2">
                <span className="text-primary font-bold">•</span>
                <span>
                  <strong className="text-foreground">5 votes</strong> pour le Classement
                  Global (signal binaire up/down)
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold">•</span>
                <span>
                  <strong className="text-foreground">10 votes</strong> par catégorie pour
                  les notes 1-5 (une note continue demande plus de données qu'un simple
                  up/down pour être stable)
                </span>
              </li>
            </ul>
          </section>

          {/* Différence binaire vs catégorie */}
          <section>
            <h3 className="font-semibold text-base mb-2 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-500" />
              Deux variantes
            </h3>
            <p className="text-muted-foreground leading-relaxed mb-2">
              On utilise deux versions de la même idée :
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex gap-2">
                <span className="text-primary font-bold">•</span>
                <span>
                  <strong className="text-foreground">Classement Global</strong> (votes
                  up/down) : prior neutre à 50%, borne Wilson à 95%, seuil 5 votes,
                  affiché en pourcentage.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold">•</span>
                <span>
                  <strong className="text-foreground">Classement par Catégories</strong>{" "}
                  (notes 1-5) : prior calculé dynamiquement sur la moyenne globale de la
                  catégorie, borne de confiance à 95%, seuil 10 votes, affiché en étoiles.
                </span>
              </li>
            </ul>
          </section>

          {/* Transparence */}
          <section className="rounded-lg bg-muted/30 border p-3 text-xs text-muted-foreground">
            L'algorithme est{" "}
            <strong className="text-foreground">100% transparent</strong>. Aucun classement
            payant, aucun coup de pouce manuel.
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
