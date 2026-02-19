import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/utils";
import { Tv, Trophy, Star, Vote, Menu, PlusCircle } from "lucide-react";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const navLinks = [
  { to: "/", label: "Accueil", icon: Tv },
  { to: "/leaderboard", label: "Classement", icon: Trophy },
  { to: "/categories", label: "Catégories", icon: Star },
  { to: "/vote", label: "Voter", icon: Vote },
  { to: "/propose", label: "Proposer", icon: PlusCircle },
];

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  function handleMobileNav(to: string) {
    navigate(to);
    setOpen(false);
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-bold text-xl">
          <Tv className="h-6 w-6 text-primary" />
          <span>
            STMG<span className="text-primary">Arenix</span>
          </span>
        </Link>

        {/* Desktop navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                location.pathname === to
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          {/* Mobile hamburger menu */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Ouvrir le menu"
              >
                <Menu className="h-6 w-6" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 border-border/40 bg-background">
              <SheetHeader className="border-b border-border/40 pb-4">
                <SheetTitle className="flex items-center gap-2 text-xl font-bold">
                  <Tv className="h-5 w-5 text-primary" />
                  <span>
                    STMG<span className="text-primary">Arenix</span>
                  </span>
                </SheetTitle>
              </SheetHeader>

              <nav className="flex flex-col gap-1 px-2 pt-2">
                {navLinks.map(({ to, label, icon: Icon }) => (
                  <button
                    key={to}
                    onClick={() => handleMobileNav(to)}
                    className={cn(
                      "flex items-center gap-3 w-full px-4 py-3 rounded-md text-sm font-medium transition-colors text-left",
                      location.pathname === to
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {label}
                  </button>
                ))}

              </nav>

              <div className="mt-auto border-t border-border/40 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Theme</span>
                  <ThemeToggle />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
