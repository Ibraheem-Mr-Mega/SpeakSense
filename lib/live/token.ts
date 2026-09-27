export async function issueToken(
  key: string | undefined,
  fetcher: typeof fetch = fetch,
) {
  if (!key)
    return {
      status: 503,
      error:
        "Live coaching is not configured. Add ELEVENLABS_API_KEY on the server.",
    };
  try {
    const response = await fetcher(
      "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
      {
        method: "POST",
        headers: { "xi-api-key": key },
        signal: AbortSignal.timeout(12000),
      },
    );
    if (!response.ok)
      return {
        status: 502,
        error: `ElevenLabs declined live authorization (${response.status}). Check Speech to Text access, credits, and accepted Scribe terms.`,
      };
    const data = (await response.json()) as { token?: string };
    if (!data.token || typeof data.token !== "string")
      throw new Error("Invalid token");
    return { status: 200, token: data.token };
  } catch {
    return {
      status: 502,
      error: "Live authorization could not connect to ElevenLabs. Try again.",
    };
  }
}
