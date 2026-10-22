/** Warm read-mostly preview data without delaying server startup. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { warmPreviewCache } = await import("@/server/backend-preview");
  warmPreviewCache();
}
