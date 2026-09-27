export async function GET() {
  const { env } = await import("cloudflare:workers");
  const settings = env as unknown as {
    ELEVENLABS_API_KEY?: string;
    PRESAGE_BRIDGE_URL?: string;
  };
  return Response.json(
    {
      transcriptionConfigured: !!settings.ELEVENLABS_API_KEY,
      model: "scribe_v2",
      realtimeModel: "scribe_v2_realtime",
      // Local SmartSpectra bridge (not a secret). The Presage key stays in the bridge.
      presageBridgeUrl: settings.PRESAGE_BRIDGE_URL || "ws://127.0.0.1:8790/presage",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
