import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, ShieldOff } from "lucide-react";

export default function Forbidden() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background decoration */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, color-mix(in srgb, hsl(0 85% 50%) 20%, transparent), transparent)",
        }}
      />

      <div className="relative z-10 text-center space-y-6 animate-fade-in-up">
        {/* Big 403 */}
        <div className="relative">
          <p className="text-[10rem] sm:text-[14rem] font-bold leading-none select-none opacity-[0.06] absolute inset-0 flex items-center justify-center">
            403
          </p>
          <div className="relative flex items-center justify-center w-24 h-24 sm:w-32 sm:h-32 mx-auto rounded-3xl bg-destructive/10 border border-destructive/20 mb-6">
            <ShieldOff className="w-10 h-10 sm:w-14 sm:h-14 text-destructive/60" />
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-4xl sm:text-5xl font-bold">Accès refusé</h1>
          <p className="text-muted-foreground text-base sm:text-lg max-w-md mx-auto">
            Vous n&apos;avez pas la permission d&apos;accéder à cette ressource.
          </p>
        </div>

        <div className="flex items-center justify-center pt-2">
          <Button asChild size="lg" className="gap-2">
            <Link to="/">
              <Home className="w-4 h-4" />
              Retour à l&apos;accueil
            </Link>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground/50 pt-4">Erreur 403</p>
      </div>
    </div>
  );
}
