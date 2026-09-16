import { Controller, Get } from "@nestjs/common";

/**
 * Liveness probe — no auth, no database. Load balancers, Docker healthchecks
 * and `turbo dev` readiness checks hit this, never an authenticated route.
 */
@Controller("v1/health")
export class HealthController {
  @Get()
  check() {
    return { ok: true };
  }
}
