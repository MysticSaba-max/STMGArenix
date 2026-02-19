import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initBotDetection } from "./lib/botDetection";

// Initialiser le tracking comportemental dès le chargement de la page
initBotDetection();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
