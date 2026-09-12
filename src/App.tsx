import { ThemeProvider } from "@/hooks/useTheme";

function App() {
  return (
    <ThemeProvider>
      <div className="flex min-h-svh flex-col bg-background text-foreground">
        <main className="flex flex-1 items-center justify-center px-6 py-20">
          <div className="w-full max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-primary sm:text-6xl">
              Projet arrêté.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground sm:text-xl">
              STMGArenix n’est plus développé ni maintenu.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Son code source est conservé{" "}
              <a
                href="https://github.com/MysticSaba-max/STMGArenix"
                className="font-semibold text-foreground underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              >
                à titre d’archive sur GitHub
              </a>.
            </p>
          </div>
        </main>
        <footer className="px-6 py-6 text-center text-xs leading-relaxed text-muted-foreground">
          Créé avec <span className="text-red-500">♥</span> par MysticSaba &amp; VillagersYT{" "}
          (ancien administrateur de Movix et développeur)
        </footer>
      </div>
    </ThemeProvider>
  );
}

export default App;
