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
const PORT = Number(process.env.PORT ?? 4000);

const allowedOrigins = [
  "http://localhost:3000",
  "https://alphahunter-orpin.vercel.app",
  "https://alphahunter-9j7oxcguy-trustledger7-6929s-projects.vercel.app",
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

app.options("*", cors());

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
    console.log(`AlphaHunter API running on port ${PORT}`);

    // Self-ping every 20s
    setInterval(async () => {
      try {
        const url = `http://127.0.0.1:${PORT}/health`;

        const response = await fetch(url);

        console.log(
          JSON.stringify({
            event: "keep_alive_ping",
            status: response.status,
            success: true,
          })
        );
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "keep_alive_ping",
            success: false,
            error:
              error instanceof Error ? error.message : "unknown_error",
          })
        );
      }
    }, 20000);
  });
});

export default app;