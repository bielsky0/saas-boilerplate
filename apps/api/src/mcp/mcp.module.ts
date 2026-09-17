import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { McpController } from "./mcp.controller";
import { McpService } from "./mcp.service";

/**
 * MCP module (spec 26 — AI Agent, faza 2.7) — the four read-only tools
 * (`list_organizations`, `list_members`, `count_unread_notifications`,
 * `list_recent_notifications`) over the shared tenant primitives, the OAuth
 * bearer boundary (`withMcpAuth`), and the origin-root `/.well-known/*`
 * discovery documents.
 *
 * `McpService` is exported so the test-only `DevController` can drive the
 * same resolution + reads from an email instead of a token (the E2E
 * isolation seam), exactly like the web dev route did.
 */
@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [McpController],
  providers: [McpService],
  exports: [McpService],
})
export class McpModule {}
