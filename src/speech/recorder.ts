// Recording herself saying something, to play it back straight away.
//
// This uses the microphone and MediaRecorder, which work in a home-screen app
// on the iPad (unlike speech recognition). Nothing is saved: the recording only
// lives in memory while the exercise is on screen.

export const MAX_RECORDING_MS = 30_000;

export function canRecord(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

/** The first audio format this browser can record (mp4 on the iPad, webm elsewhere). */
function mimeType(): string | undefined {
  for (const t of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']) {
    if (MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return undefined;
}

export interface Recording {
  /** Stops recording; the promise gives the audio as a URL to play. */
  stop(): Promise<string>;
  /** Stops without keeping anything. */
  cancel(): void;
}

/** Thrown with a message that can be shown as is. */
export class RecordError extends Error {}

export async function startRecording(): Promise<Recording> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    const name = (err as DOMException)?.name;
    throw new RecordError(
      name === 'NotAllowedError'
        ? 'The microphone is not allowed. On the iPad: Settings → Safari → Microphone → Allow, then try again.'
        : 'The microphone could not be started.',
    );
  }
  const type = mimeType();
  const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  // Releasing the microphone matters on the iPad: while it is held, playback
  // comes out of the earpiece, very quietly, instead of the speaker.
  const release = () => stream.getTracks().forEach((t) => t.stop());
  const done = new Promise<string>((resolve) => {
    recorder.onstop = () => {
      release();
      resolve(URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || type || 'audio/mp4' })));
    };
  });
  recorder.start();
  const limit = setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), MAX_RECORDING_MS);
  return {
    stop: () => {
      clearTimeout(limit);
      if (recorder.state !== 'inactive') recorder.stop();
      return done;
    },
    cancel: () => {
      clearTimeout(limit);
      recorder.onstop = release;
      if (recorder.state !== 'inactive') recorder.stop();
      else release();
    },
  };
}
