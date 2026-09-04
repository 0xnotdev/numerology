export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { configureProductionRuntimes } = await import("./server/production-bootstrap");
    configureProductionRuntimes();
  }
}
