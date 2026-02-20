import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/hooks/useTheme";
import { Navbar } from "@/components/layout/Navbar";
import { GlobalEffects } from "@/components/GlobalEffects";
import Home from "@/pages/Home";
import Leaderboard from "@/pages/Leaderboard";
import Categories from "@/pages/Categories";
import VotePage from "@/pages/Vote";
import Admin from "@/pages/Admin";
import ProposePage from "@/pages/Propose";
import NotFound from "@/pages/NotFound";
import Forbidden from "@/pages/Forbidden";
import ServerError from "@/pages/ServerError";

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-background">
          <GlobalEffects />
          <Navbar />
          <main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/vote" element={<VotePage />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/propose" element={<ProposePage />} />
              <Route path="/403" element={<Forbidden />} />
              <Route path="/500" element={<ServerError />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <footer className="border-t border-border/40 mt-12 py-6 text-center text-xs text-muted-foreground/50">
            Made with <span className="text-red-500">♥</span> by MysticSaba &amp; VillagersYT
          </footer>
          <Toaster richColors position="bottom-right" />
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
