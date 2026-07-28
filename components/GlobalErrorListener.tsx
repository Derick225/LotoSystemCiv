import React, { useEffect } from "react";
import { useToast } from "./ui/Toast";
import { getUserFriendlyError } from "../utils/errorHandler";
import { logError } from "../utils/AppError";

export const GlobalErrorListener: React.FC = () => {
  const { showToast } = useToast();

  useEffect(() => {
    // Gestionnaire pour les erreurs synchrones et exceptions DOM
    const handleGlobalError = (event: ErrorEvent) => {
      // On ignore les erreurs de redimensionnement bénignes souvent lancées par les navigateurs
      if (event.message?.includes("ResizeObserver")) return;
      // On ignore "Script error." provoqué par des scripts externes / extensions ou restrictions sandbox d'iframe
      if (event.message?.includes("Script error.")) return;
      if (event.message === "Script error.") return;

      const friendlyMsg = getUserFriendlyError(event.error || event.message);
      logError(event.error || new Error(event.message), {
        source: "GlobalErrorListener",
      });

      // On affiche un toast au lieu de laisser l'app crasher silencieusement (si possible)
      showToast(friendlyMsg, "error");
    };

    // Gestionnaire pour les Promesses rejetées non gérées (Async)
    const handlePromiseRejection = (event: PromiseRejectionEvent) => {
      const friendlyMsg = getUserFriendlyError(event.reason);
      logError(event.reason, { source: "UnhandledPromiseRejection" });

      showToast(friendlyMsg, "error");
    };

    window.addEventListener("error", handleGlobalError);
    window.addEventListener("unhandledrejection", handlePromiseRejection);

    return () => {
      window.removeEventListener("error", handleGlobalError);
      window.removeEventListener("unhandledrejection", handlePromiseRejection);
    };
  }, [showToast]);

  return null; // Ce composant ne rend rien visuellement
};
