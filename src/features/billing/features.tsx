/**
 * Server-side feature check (for Server Actions / API routes).
 * Must be called within a request scope that has organization context.
 */
export async function checkFeatureServer(organizationId: string, featureKey: string): Promise<boolean> {
  const { hasFeature } = await import("./limits");
  return hasFeature(organizationId, featureKey);
}

/**
 * Server-side limit check (for Server Actions / API routes).
 * Throws with user-facing message if limit exceeded.
 */
export async function checkLimitServer(organizationId: string, limitKey: string): Promise<void> {
  const { checkLimit } = await import("./limits");
  return checkLimit(organizationId, limitKey as any);
}