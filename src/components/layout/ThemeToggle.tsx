import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative h-9 w-9 rounded-full border border-border/50 bg-secondary/50 hover:bg-secondary flex items-center justify-center transition-colors duration-300 overflow-hidden group"
      aria-label={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
    >
      <Sun
        className={`h-[18px] w-[18px] text-yellow-500 absolute transition-all duration-500 ease-in-out ${
          theme === "dark"
            ? "rotate-0 scale-100 opacity-100"
            : "rotate-90 scale-0 opacity-0"
        }`}
      />
      <Moon
        className={`h-[18px] w-[18px] text-foreground absolute transition-all duration-500 ease-in-out ${
          theme === "light"
            ? "rotate-0 scale-100 opacity-100"
            : "-rotate-90 scale-0 opacity-0"
        }`}
      />
      <span className="absolute inset-0 rounded-full bg-primary/10 scale-0 group-active:scale-100 transition-transform duration-300" />
    </button>
  );
}
