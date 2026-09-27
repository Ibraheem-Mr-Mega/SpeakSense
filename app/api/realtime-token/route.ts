import { issueToken } from "@/lib/live/token";
export async function POST(request: Request) {
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json(
      { error: "Only requests from SpeakSense are accepted." },
      { status: 403, headers },
    );
  const { env } = await import("cloudflare:workers");
  const result = await issueToken(
    (env as unknown as { ELEVENLABS_API_KEY?: string }).ELEVENLABS_API_KEY,
  );
  return Response.json(
    result.token ? { token: result.token } : { error: result.error },
    { status: result.status, headers },
  );
}
