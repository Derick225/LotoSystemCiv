import { corsHeaders } from "../_shared/cors.ts";
import { handleAdminUsers } from "./handlers/admin-users.ts";
import { handleAnalyzeDraw } from "./handlers/analyze-draw.ts";
import { handleAnalyzeDrift } from "./handlers/analyze-drift.ts";
import { handleAskOracle } from "./handlers/ask-oracle.ts";
import { handleComputeNexusAnalytics } from "./handlers/compute-nexus-analytics.ts";
import { handleCronSync } from "./handlers/cron-sync.ts";
import { handleForensicAutopsy } from "./handlers/forensic-autopsy.ts";
import { handleGenerateForensicReport } from "./handlers/generate-forensic-report.ts";
import { handleHybridPrediction } from "./handlers/hybrid-prediction.ts";
import { handleInitPayment } from "./handlers/init-payment.ts";
import { handleOptimizeWeights } from "./handlers/optimize-weights.ts";
import { handlePaymentWebhook } from "./handlers/payment-webhook.ts";
import { handlePredictElite } from "./handlers/predict-elite.ts";
import { handleProcessRlhf } from "./handlers/process-rlhf.ts";
import { handleProxyResults } from "./handlers/proxy-results.ts";
import { handleRunMlModels } from "./handlers/run-ml-models.ts";
import { handleRunSimulation } from "./handlers/run-simulation.ts";
import { handleSelfLearn } from "./handlers/self-learn.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const actionParam = url.searchParams.get("action");

    let body: any = {};
    const contentType = req.headers.get("content-type") || "";

    if (req.method !== "GET" && req.method !== "HEAD") {
      if (
        contentType.includes("multipart/form-data") ||
        contentType.includes("application/x-www-form-urlencoded")
      ) {
        body = await req.formData().catch(() => ({}));
      } else {
        body = await req.json().catch(() => ({}));
      }
    }

    const action =
      body?.action ||
      body?.endpoint ||
      actionParam ||
      url.pathname.split("/").pop();

    switch (action) {
      case "admin-users":
        return await handleAdminUsers(req, body);
      case "analyze-draw":
        return await handleAnalyzeDraw(req, body);
      case "analyze-drift":
        return await handleAnalyzeDrift(req, body);
      case "ask-oracle":
        return await handleAskOracle(req, body);
      case "compute-nexus-analytics":
        return await handleComputeNexusAnalytics(req, body);
      case "cron-sync":
        return await handleCronSync(req, body);
      case "forensic-autopsy":
        return await handleForensicAutopsy(req, body);
      case "generate-forensic-report":
        return await handleGenerateForensicReport(req, body);
      case "hybrid-prediction":
        return await handleHybridPrediction(req, body);
      case "init-payment":
        return await handleInitPayment(req, body);
      case "optimize-weights":
        return await handleOptimizeWeights(req, body);
      case "payment-webhook":
        return await handlePaymentWebhook(req, body);
      case "predict-elite":
        return await handlePredictElite(req, body);
      case "process-rlhf":
        return await handleProcessRlhf(req, body);
      case "proxy-results":
        return await handleProxyResults(req, body);
      case "run-ml-models":
        return await handleRunMlModels(req, body);
      case "run-simulation":
        return await handleRunSimulation(req, body);
      case "self-learn":
        return await handleSelfLearn(req, body);
      default:
        return new Response(
          JSON.stringify({
            error: `Action ou endpoint inconnu: ${action || "non spécifié"}`,
            supportedActions: [
              "admin-users",
              "analyze-draw",
              "analyze-drift",
              "ask-oracle",
              "compute-nexus-analytics",
              "cron-sync",
              "forensic-autopsy",
              "generate-forensic-report",
              "hybrid-prediction",
              "init-payment",
              "optimize-weights",
              "payment-webhook",
              "predict-elite",
              "process-rlhf",
              "proxy-results",
              "run-ml-models",
              "run-simulation",
              "self-learn",
            ],
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
    }
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: error?.message || "Erreur interne gateway Edge Function",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
