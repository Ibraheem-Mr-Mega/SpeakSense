import { validateTranscript } from "./analysis.ts";
export type ServiceEnv = {
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_ZERO_RETENTION?: string;
};
export class ServiceError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function transcribeAudio(
  file: Blob,
  duration: number,
  env: ServiceEnv,
  fetcher: typeof fetch = fetch,
) {
  if (!env.ELEVENLABS_API_KEY)
    throw new ServiceError(
      "Live transcription is not configured. Your recording stays available for playback. Explore the labeled sample, or ask the host to configure ElevenLabs API access.",
      503,
    );
  const body = new FormData();
  body.set(
    "file",
    file,
    "attempt." +
      (file.type.includes("mp4")
        ? "mp4"
        : file.type.includes("wav")
          ? "wav"
          : "webm"),
  );
  body.set("model_id", "scribe_v2");
  body.set("timestamps_granularity", "word");
  body.set("no_verbatim", "false");
  body.set("tag_audio_events", "true");
  body.set("diarize", "false");
  let response: Response;
  try {
    response = await fetcher(
      "https://api.elevenlabs.io/v1/speech-to-text" +
        (env.ELEVENLABS_ZERO_RETENTION === "true"
          ? "?enable_logging=false"
          : ""),
      {
        method: "POST",
        headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
        body,
        signal: AbortSignal.timeout(55000),
      },
    );
  } catch {
    throw new ServiceError(
      "The transcription service timed out or could not connect. Your recording is still available. Try again.",
      504,
    );
  }
  if (!response.ok) {
    const status = response.status;
    throw new ServiceError(
      status === 401 || status === 403
        ? "ElevenLabs API access was rejected. The host should check the key, speech-to-text permission, and API plan."
        : status === 402 || status === 429
          ? "ElevenLabs credits or request limits prevented transcription. Try later or check API credits."
          : "ElevenLabs could not transcribe this recording. Please try again.",
      status === 401 || status === 403 ? 502 : status === 429 ? 429 : 502,
    );
  }
  try {
    return validateTranscript(await response.json(), duration);
  } catch (e) {
    throw new ServiceError(
      e instanceof Error ? e.message : "Invalid transcript response.",
      502,
    );
  }
}
