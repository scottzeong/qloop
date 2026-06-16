import express from "express";
import type { Request, Response } from "express";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Single catch-all: dispatch manually so we never miss regardless of how Vercel passes the URL
app.use(async (req: Request, res: Response) => {
  const url = req.url ?? "";

  // ── Health check ──────────────────────────────────────────────────────────
  if (url.endsWith("/api/health") || url === "/api/health") {
    res.json({ ok: true, ts: Date.now() });
    return;
  }

  // ── R2 storage proxy ──────────────────────────────────────────────────────
  if (url.includes("/r2-storage/")) {
    try {
      const keyMatch = url.match(/\/r2-storage\/(.+)/);
      const key = keyMatch?.[1];
      if (!key) { res.status(400).send("Missing storage key"); return; }
      const { storageGetSignedUrl } = await import("../server/storage");
      const signedUrl = await storageGetSignedUrl(key);
      res.set("Cache-Control", "no-store").redirect(307, signedUrl);
    } catch (err: any) {
      console.error("[r2-storage] error:", err?.message);
      res.status(502).send("Storage proxy error");
    }
    return;
  }

  // ── tRPC ──────────────────────────────────────────────────────────────────
  if (url.includes("/api/trpc")) {
    try {
      const { createExpressMiddleware } = await import("@trpc/server/adapters/express");
      const { appRouter } = await import("../server/routers");
      const { createContext } = await import("../server/_core/context");

      // Strip everything up to and including /api/trpc so tRPC sees /auth.login etc.
      req.url = url.replace(/^.*\/api\/trpc/, "") || "/";

      const handler = createExpressMiddleware({ router: appRouter, createContext });
      handler(req, res, () => {
        if (!res.headersSent) res.status(404).json({ error: "tRPC route not found" });
      });
    } catch (err: any) {
      console.error("[api/trpc] load error:", err?.message, err?.stack);
      if (!res.headersSent) {
        res.status(500).json({ error: "Server load failed", message: err?.message ?? String(err) });
      }
    }
    return;
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  res.status(404).json({ error: "Not found", url, method: req.method });
});

export default app;
