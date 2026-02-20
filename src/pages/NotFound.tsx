import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 hero-gradient pointer-events-none" />

      <div className="relative z-10 text-center space-y-6 animate-fade-in-up">
        {/* Big 404 */}
        <div className="relative">
          <p className="text-[10rem] sm:text-[14rem] font-bold leading-none select-none opacity-[0.06] absolute inset-0 flex items-center justify-center">
            404
          </p>
          <div className="relative flex items-center justify-center w-24 h-24 sm:w-32 sm:h-32 mx-auto rounded-3xl bg-primary/10 border border-primary/20 mb-6">
            <Search className="w-10 h-10 sm:w-14 sm:h-14 text-primary/60" />
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-4xl sm:text-5xl font-bold">Page introuvable</h1>
          <p className="text-muted-foreground text-base sm:text-lg max-w-md mx-auto">
            La page que vous recherchez n&apos;existe pas ou a été déplacée.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button asChild size="lg" className="gap-2">
            <Link to="/">
              <Home className="w-4 h-4" />
              Retour à l&apos;accueil
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="gap-2" onClick={() => window.history.back()}>
            <span role="button" style={{ cursor: "pointer" }}>
              <ArrowLeft className="w-4 h-4" />
              Page précédente
            </span>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground/50 pt-4">Erreur 404</p>
      </div>
    </div>
  );
}
