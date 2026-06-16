import express from "express";
import type { Request, Response, NextFunction } from "express";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true, ts: Date.now() });
});

// R2 storage proxy — lazy loaded
app.get("/r2-storage/*", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = (req.params as Record<string, string>)[0];
    if (!key) { res.status(400).send("Missing storage key"); return; }
    const { storageGetSignedUrl } = await import("../server/storage");
    const signedUrl = await storageGetSignedUrl(key);
    res.set("Cache-Control", "no-store");
    res.redirect(307, signedUrl);
  } catch (err: any) {
    console.error("[r2-storage] error:", err?.message);
    res.status(502).send("Storage proxy error");
  }
});

// tRPC — lazy loaded, mounted directly (no nested express app)
app.use("/api/trpc", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { createExpressMiddleware } = await import("@trpc/server/adapters/express");
    const { appRouter } = await import("../server/routers");
    const { createContext } = await import("../server/_core/context");
    const handler = createExpressMiddleware({ router: appRouter, createContext });
    handler(req, res, next);
  } catch (err: any) {
    console.error("[api/trpc] load error:", err?.message, err?.stack);
    res.status(500).json({
      error: "Server load failed",
      message: err?.message ?? String(err),
    });
  }
});

export default app;
