import "./loadEnv";

import cors from "cors";
import express from "express";

import { requestPerfMiddleware } from "./middleware/requestPerf";
import {
  logStartupDiagnostics,
  validateTonCenterKeyAtStartup,
} from "./services/startupDiagnostics";
import analyzeRouter from "./routes/analyze";
import debugToncenterRouter from "./routes/debugToncenter";
import healthRouter from "./routes/health";
import miraRouter from "./routes/mira";
import miraReportRouter from "./routes/miraReport";
import opportunitiesRouter from "./routes/opportunities";
import routeRouter from "./routes/route";
import walletIntelligenceRouter from "./routes/walletIntelligence";

const app = express();
const PORT = process.env.PORT ?? 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3000";

app.use(
  cors({
    origin: CORS_ORIGIN,
  })
);
app.use(express.json());
app.use(requestPerfMiddleware);

app.use(healthRouter);
app.use(debugToncenterRouter);
app.use(walletIntelligenceRouter);
app.use(analyzeRouter);
app.use(opportunitiesRouter);
app.use(routeRouter);
app.use(miraRouter);
app.use(miraReportRouter);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: "Not found",
  });
});

logStartupDiagnostics();

validateTonCenterKeyAtStartup().finally(() => {
  app.listen(PORT, () => {
    console.log(`AlphaHunter API running on http://localhost:${PORT}`);

    setInterval(async () => {
      try {
        await fetch(`http://localhost:${PORT}/health`);
        console.log("keep_alive_ping_success");
      } catch {
        console.log("keep_alive_ping_failed");
      }
    }, 20000);
  });
});

export default app;
