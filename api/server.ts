import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";

const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Health check - tests if function loads correctly
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true, env: !!process.env.DATABASE_URL });
});

// Lazy-init the full router to catch startup errors gracefully
app.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { createExpressMiddleware } = await import("@trpc/server/adapters/express");
    const { registerStorageProxy } = await import("../server/_core/storageProxy");
    const { appRouter } = await import("../server/routers");
    const { createContext } = await import("../server/_core/context");

    const router = express.Router();
    registerStorageProxy(router as any);
    router.use(
      "/api/trpc",
      createExpressMiddleware({ router: appRouter, createContext })
    );

    router(req, res, next);
  } catch (err: any) {
    console.error("[api/server] init error:", err);
    res.status(500).json({ error: "Server initialization failed", detail: err?.message });
  }
});

export default app;
