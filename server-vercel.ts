import express from "express";
import type { Request, Response } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./server/routers";
import { createContext } from "./server/_core/context";
import { storageGetSignedUrl } from "./server/storage";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true, ts: Date.now() });
});

app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

app.get("/r2-storage/*", async (req: Request, res: Response) => {
  try {
    const key = (req.params as Record<string, string>)[0];
    if (!key) { res.status(400).send("Missing storage key"); return; }
    const signedUrl = await storageGetSignedUrl(key);
    res.set("Cache-Control", "no-store").redirect(307, signedUrl);
  } catch (err: any) {
    console.error("[r2-storage] error:", err?.message);
    res.status(502).send("Storage proxy error");
  }
});

export default app;
