export type Word = { text: string; start: number; end: number; type: string };
export type Transcript = { text: string; words: Word[]; language_code: string };
export type Exercise = "investor" | "keynote" | "leadership";
export type Recording = {
  blob: Blob;
  duration: number;
  source: "microphone" | "pin" | "file";
  interrupted?: boolean;
  microphoneLabel?: string;
};
export type Attempt = {
  id: string;
  kind: "live" | "sample";
  exercise: Exercise;
  audience: string;
  duration: number;
  audioUrl: string;
  blob?: Blob;
  microphoneLabel?: string;
  transcript?: Transcript;
  error?: string;
};
export type Evidence = { text: string; start: number; end: number };
