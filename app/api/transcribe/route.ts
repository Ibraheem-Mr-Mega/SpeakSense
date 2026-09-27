import {
  transcribeAudio,
  ServiceError,
  type ServiceEnv,
} from "@/lib/speech/transcription";
const MAX_BYTES = 10 * 1024 * 1024;
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin)
      throw new ServiceError("Only requests from this app are accepted.", 403);
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
      throw new ServiceError("Audio must be sent as a recording upload.", 415);
    if (Number(request.headers.get("content-length")) > MAX_BYTES)
      throw new ServiceError("Recording exceeds the 10 MB limit.", 413);
    // Bound the actual stream too; Content-Length is not a trusted size check.
    const reader = request.body?.getReader();
    if (!reader) throw new ServiceError("No recording was supplied.", 400);
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new ServiceError("Recording exceeds the 10 MB limit.", 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const form = await new Response(bytes, {
      headers: { "Content-Type": request.headers.get("content-type")! },
    }).formData();
    const file = form.get("audio");
    const duration = Number(form.get("duration"));
    if (
      !(file instanceof File) ||
      !file.size ||
      !/^(audio\/(webm|mp4|ogg|wav|x-wav|mpeg)|video\/webm)(;|$)/.test(
        file.type,
      )
    )
      throw new ServiceError(
        "A supported, non-empty audio recording is required.",
        400,
      );
    if (!Number.isFinite(duration) || duration < 0.5 || duration > 65)
      throw new ServiceError(
        "Use a recording between 0.5 and 65 seconds.",
        400,
      );
    const { env } = await import("cloudflare:workers");
    const transcript = await transcribeAudio(
      file,
      duration,
      env as unknown as ServiceEnv,
    );
    return Response.json(
      { transcript, provider: "ElevenLabs Scribe v2" },
      { headers },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof ServiceError
            ? e.message
            : "The recording could not be processed. Please try again.",
      },
      { status: e instanceof ServiceError ? e.status : 400, headers },
    );
  }
}
