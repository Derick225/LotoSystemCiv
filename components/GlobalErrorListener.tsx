import React, { useEffect } from "react";
import { useToast } from "./ui/Toast";
import { getUserFriendlyError } from "../utils/errorHandler";
import { logError, AppError } from "../utils/AppError";

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

      const rawMsg = event.message || (event.error instanceof Error ? event.error.message : String(event.error || ""));
      const isNetwork =
        rawMsg.toLowerCase().includes("fetch") ||
        rawMsg.toLowerCase().includes("network") ||
        rawMsg.toLowerCase().includes("failed to fetch") ||
        rawMsg.toLowerCase().includes("timeout") ||
        rawMsg.toLowerCase().includes("timed out") ||
        rawMsg.toLowerCase().includes("abort");

      // Prévenir la propagation d'erreur non capturée au runtime global du conteneur
      event.preventDefault();

      const friendlyMsg = getUserFriendlyError(event.error || event.message);
      logError(event.error || new AppError(event.message, "GLOBAL_ERROR", isNetwork ? "low" : "medium"), {
        source: "GlobalErrorListener",
        severity: isNetwork ? "low" : "medium",
      });

      if (!isNetwork) {
        showToast(friendlyMsg, "error");
      }
    };

    // Gestionnaire pour les Promesses rejetées non gérées (Async)
    const handlePromiseRejection = (event: PromiseRejectionEvent) => {
      // Indispensable : marquer la réjection comme traitée pour empêcher le conteneur
      // ou la console du navigateur d'émettre une erreur fatale uncaught (ex: error 0: Failed to fetch)
      event.preventDefault();

      const reason = event.reason;
      const rawMsg = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "";
      const isNetwork =
        rawMsg.toLowerCase().includes("fetch") ||
        rawMsg.toLowerCase().includes("network") ||
        rawMsg.toLowerCase().includes("failed to fetch") ||
        rawMsg.toLowerCase().includes("timeout") ||
        rawMsg.toLowerCase().includes("timed out") ||
        rawMsg.toLowerCase().includes("abort");

      if (isNetwork) {
        console.warn("[GlobalErrorListener] Rejet asynchrone réseau neutralisé :", rawMsg);
        return;
      }

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
