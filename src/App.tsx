import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/hooks/useTheme";
import { Navbar } from "@/components/layout/Navbar";
import Home from "@/pages/Home";
import Leaderboard from "@/pages/Leaderboard";
import Categories from "@/pages/Categories";
import VotePage from "@/pages/Vote";
import Admin from "@/pages/Admin";
import ProposePage from "@/pages/Propose";

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-background">
          <Navbar />
          <main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/vote" element={<VotePage />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/propose" element={<ProposePage />} />
            </Routes>
          </main>
          <Toaster richColors position="bottom-right" />
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
