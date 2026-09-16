import "reflect-metadata";

import path from "node:path";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import dotenv from "dotenv";

// Load `apps/api/.env` (local dev only — production injects real env vars,
// and a missing file is silently ignored). The path is anchored to the
// compiled file, not the process cwd, so `pnpm --filter api start` from the
// repo root and `node dist/main` from any directory behave identically.
dotenv.config({ path: path.join(__dirname, "..", ".env") });

import { AppModule } from "./app.module";
import { API_CONFIG, DbModule } from "./db/db.module";
import type { ApiConfig } from "./common/config";

/**
 * API bootstrap (Express adapter — the NestJS default).
 *
 * `rawBody: true` is load-bearing for the future billing webhook: Stripe's
 * signature covers the exact request bytes, so the route must read the raw
 * buffer (`request.text()` equivalent) instead of a re-serialized body.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.select(DbModule).get<ApiConfig>(API_CONFIG);
  await app.listen(config.PORT);
  Logger.log(`API listening on :${config.PORT} (${config.NODE_ENV})`, "Bootstrap");
}

void bootstrap();
