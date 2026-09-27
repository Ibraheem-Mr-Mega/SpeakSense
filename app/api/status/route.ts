export async function GET() {
  const { env } = await import("cloudflare:workers");
  const settings = env as unknown as { ELEVENLABS_API_KEY?: string };
  return Response.json(
    {
      transcriptionConfigured: !!settings.ELEVENLABS_API_KEY,
      model: "scribe_v2",
      realtimeModel: "scribe_v2_realtime",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
