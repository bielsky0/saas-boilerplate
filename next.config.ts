import type { NextConfig } from "next";

// Validate environment variables at build/startup time (fail-fast).
// Importing the env module runs the Zod schema against process.env, so a
// missing/invalid variable aborts `next dev`/`next build` with a clear error
// instead of failing later at runtime. See src/lib/env/server.ts (spec 19.1).
import "./src/lib/env/server";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle so the app runs on Vercel *and* as a
  // standalone Node.js server / Docker container (spec 19.1).
  output: "standalone",
  experimental: {
    // Enable `forbidden()` / `unauthorized()` so RBAC failures render real
    // 403/401 responses from server components, actions, and route handlers
    // (spec 4.2). See src/features/organizations/context.ts.
    authInterrupts: true,
  },
};

export default nextConfig;
