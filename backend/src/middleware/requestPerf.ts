import type { NextFunction, Request, Response } from "express";

import { perfMetrics } from "../services/perfMetrics";

export function requestPerfMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const walletAddress =
      typeof req.body?.walletAddress === "string"
        ? req.body.walletAddress.trim()
        : undefined;

    perfMetrics.recordEndpoint(req.method, req.path, durationMs, walletAddress);
  });

  next();
}
