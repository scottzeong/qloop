import express from "express";
import type { Request, Response, NextFunction } from "express";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Step 1: verify function loads
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true, ts: Date.now() });
});

// Step 2: lazy-load entire server and proxy request
app.use(async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { createExpressMiddleware } = await import("@trpc/server/adapters/express");
    const { registerStorageProxy } = await import("../server/_core/storageProxy");
    const { appRouter } = await import("../server/routers");
    const { createContext } = await import("../server/_core/context");

    const inner = express();
    inner.use(express.json({ limit: "50mb" }));
    inner.use(express.urlencoded({ limit: "50mb", extended: true }));
    registerStorageProxy(inner);
    inner.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

    inner(req, res, () => {
      res.status(404).json({ error: "Not found" });
    });
  } catch (err: any) {
    console.error("[api/server] load error:", err?.message, err?.stack);
    res.status(500).json({
      error: "Server load failed",
      message: err?.message ?? String(err),
      stack: process.env.NODE_ENV !== "production" ? err?.stack : undefined,
    });
  }
});

export default app;
