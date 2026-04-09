import { useCallback, useEffect, useRef, useState } from "react";
import { getVoiceToken } from "@/lib/api";

type VoiceStatus = "idle" | "recording" | "transcribing" | "error";

type UseElevenLabsVoiceRecorderOptions = {
  onTranscript: (text: string) => void | Promise<void>;
  onError?: (message: string) => void;
  onRecordingStart?: () => void;
  autoStopOnSilence?: boolean;
};

const TARGET_SAMPLE_RATE = 16_000;
const WS_CHUNK_SAMPLES = 3_200;
const SILENCE_RMS_THRESHOLD = 0.012;
const SILENCE_HOLD_MS = 1_300;
const MIN_RECORDING_MS = 900;
const MAX_RECORDING_MS = 15_000;

function int16ToWavBlob(pcm: Int16Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  let offset = 0;
  const writeAscii = (value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
    offset += value.length;
  };

  writeAscii("RIFF");
  view.setUint32(offset, 36 + dataSize, true);
  offset += 4;
  writeAscii("WAVE");
  writeAscii("fmt ");
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, byteRate, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, 16, true);
  offset += 2;
  writeAscii("data");
  view.setUint32(offset, dataSize, true);
  offset += 4;

  for (let i = 0; i < pcm.length; i += 1) {
    view.setInt16(offset, pcm[i], true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function downsampleBuffer(buffer: Float32Array, inputSampleRate: number, outputSampleRate: number): Float32Array {
  if (outputSampleRate === inputSampleRate) {
    return buffer.slice();
  }

  if (outputSampleRate > inputSampleRate) {
    throw new Error("Output sample rate must be lower than input sample rate.");
  }

  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accumulated = 0;
    let count = 0;

    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
      accumulated += buffer[i];
      count += 1;
    }

    result[offsetResult] = count > 0 ? accumulated / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function floatTo16BitPcm(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

function concatInt16Arrays(chunks: Int16Array[]): Int16Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Int16Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}

function splitInt16Array(buffer: Int16Array, chunkSize: number): Int16Array[] {
  if (buffer.length <= chunkSize) return [buffer];
  const chunks: Int16Array[] = [];
  for (let i = 0; i < buffer.length; i += chunkSize) {
    chunks.push(buffer.subarray(i, i + chunkSize));
  }
  return chunks;
}

function int16ArrayToBase64(buffer: Int16Array): string {
  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || null;
}

export function useElevenLabsVoiceRecorder({
  onTranscript,
  onError,
  onRecordingStart,
  autoStopOnSilence = true,
}: UseElevenLabsVoiceRecorderOptions) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  const onRecordingStartRef = useRef(onRecordingStart);
  const recordingRef = useRef(false);
  const chunksRef = useRef<Int16Array[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const recordingStartedAtRef = useRef(0);
  const lastSpeechAtRef = useRef(0);
  const hadSpeechRef = useRef(false);
  const autoStopRequestedRef = useRef(false);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onRecordingStartRef.current = onRecordingStart;
  }, [onRecordingStart]);

  const cleanupRecording = useCallback(async () => {
    recordingRef.current = false;
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    gainRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    gainRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      await audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
  }, []);

  const fail = useCallback(
    async (message: string) => {
      setError(message);
      setStatus("error");
      onErrorRef.current?.(message);
      await cleanupRecording();
      window.setTimeout(() => {
        setStatus("idle");
      }, 0);
    },
    [cleanupRecording]
  );

  const stop = useCallback(async () => {
    if (status !== "recording") return;

    setStatus("transcribing");
    recordingRef.current = false;

    const chunks = chunksRef.current;
    chunksRef.current = [];

    await cleanupRecording();

    if (!chunks.length) {
      await fail("No speech was captured. Try speaking a little longer.");
      return;
    }

    let wavUrl: string | null = null;
    try {
      const { token, model_id: modelId } = await getVoiceToken();
      const realtimeModelId = modelId === "scribe_v2" ? "scribe_v2_realtime" : modelId;
      const pcmAudio = concatInt16Arrays(chunks);
      const pcmChunks = splitInt16Array(pcmAudio, WS_CHUNK_SAMPLES);
      const wavBlob = int16ToWavBlob(pcmAudio, TARGET_SAMPLE_RATE);
      wavUrl = URL.createObjectURL(wavBlob);
      const durationSeconds = pcmAudio.length / TARGET_SAMPLE_RATE;
      console.info("Recorded audio captured", {
        sampleRate: TARGET_SAMPLE_RATE,
        samples: pcmAudio.length,
        wsChunks: pcmChunks.length,
        durationSeconds: Number(durationSeconds.toFixed(2)),
        pcmBytes: pcmAudio.byteLength,
        wavBytes: wavBlob.size,
        modelId,
        realtimeModelId,
      });
      console.info("Recorded audio preview URL", wavUrl);

      const transcriptText = await new Promise<string>((resolve, reject) => {
        const ws = new WebSocket(
          `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=${encodeURIComponent(realtimeModelId)}&token=${encodeURIComponent(token)}&audio_format=pcm_16000&commit_strategy=manual`
        );
        let settled = false;
        let sentAudio = false;
        const timeoutId = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          ws.close();
          reject(new Error("Timed out waiting for ElevenLabs transcription."));
        }, 45_000);

        ws.onopen = () => {
          console.info("ElevenLabs STT websocket opened", { realtimeModelId });
        };

        ws.onmessage = (event) => {
          let data: { message_type?: string; text?: string; detail?: string };
          try {
            data = JSON.parse(String(event.data));
          } catch {
            return;
          }

          if (data.message_type === "session_started" && !sentAudio) {
            sentAudio = true;
            for (let i = 0; i < pcmChunks.length; i += 1) {
              ws.send(
                JSON.stringify({
                  message_type: "input_audio_chunk",
                  audio_base_64: int16ArrayToBase64(pcmChunks[i]),
                  commit: i === pcmChunks.length - 1,
                  sample_rate: TARGET_SAMPLE_RATE,
                })
              );
            }
            return;
          }

          if (data.message_type === "partial_transcript" && typeof data.text === "string") {
            setTranscript(data.text);
            return;
          }

          if (
            data.message_type === "committed_transcript" ||
            data.message_type === "committed_transcript_with_timestamps"
          ) {
            const finalText = (data.text ?? "").trim();
            if (!finalText) return;
            if (settled) return;
            settled = true;
            window.clearTimeout(timeoutId);
            ws.close();
            setTranscript(finalText);
            resolve(finalText);
            return;
          }

          if (typeof data.message_type === "string" && data.message_type.includes("error")) {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeoutId);
            ws.close();
            reject(new Error(data.detail || `ElevenLabs returned ${data.message_type}.`));
          }
        };

        ws.onerror = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          ws.close();
          reject(new Error("Could not reach ElevenLabs transcription."));
        };

        ws.onclose = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          reject(new Error("ElevenLabs transcription closed before a transcript was returned."));
        };
      });

      setStatus("idle");
      onTranscriptRef.current(transcriptText);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await fail(message);
    } finally {
      if (wavUrl) {
        URL.revokeObjectURL(wavUrl);
      }
    }
  }, [cleanupRecording, fail, status]);

  const start = useCallback(async () => {
    if (status !== "idle") return;

    const AudioContextCtor = getAudioContextConstructor();
    if (!AudioContextCtor) {
      await fail("Your browser does not support audio recording.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      await fail("Microphone access is not available in this browser.");
      return;
    }

    setError(null);
    setTranscript("");
    setStatus("recording");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContextCtor();
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const gain = audioContext.createGain();

      gain.gain.value = 0;
      recordingRef.current = true;
      chunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      lastSpeechAtRef.current = recordingStartedAtRef.current;
      hadSpeechRef.current = false;
      autoStopRequestedRef.current = false;
      onRecordingStartRef.current?.();

      processor.onaudioprocess = (event) => {
        if (!recordingRef.current) return;
        const input = event.inputBuffer.getChannelData(0);
        const downsampled = downsampleBuffer(input, audioContext.sampleRate, TARGET_SAMPLE_RATE);
        let energy = 0;
        for (let i = 0; i < input.length; i += 1) {
          energy += input[i] * input[i];
        }
        const rms = Math.sqrt(energy / Math.max(1, input.length));
        const now = Date.now();

        if (rms >= SILENCE_RMS_THRESHOLD) {
          hadSpeechRef.current = true;
          lastSpeechAtRef.current = now;
        }

        if (autoStopOnSilence && !autoStopRequestedRef.current) {
          const elapsed = now - recordingStartedAtRef.current;
          const silenceDuration = now - lastSpeechAtRef.current;
          const reachedMaxDuration = elapsed >= MAX_RECORDING_MS;
          const reachedSilenceTail = hadSpeechRef.current && elapsed >= MIN_RECORDING_MS && silenceDuration >= SILENCE_HOLD_MS;
          if (reachedMaxDuration || reachedSilenceTail) {
            autoStopRequestedRef.current = true;
            window.setTimeout(() => {
              void stop();
            }, 0);
          }
        }

        if (downsampled.length > 0) {
          chunksRef.current.push(floatTo16BitPcm(downsampled));
        }
      };

      source.connect(processor);
      processor.connect(gain);
      gain.connect(audioContext.destination);

      streamRef.current = stream;
      audioContextRef.current = audioContext;
      sourceRef.current = source;
      processorRef.current = processor;
      gainRef.current = gain;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await fail(`Could not start microphone recording: ${message}`);
    }
  }, [autoStopOnSilence, fail, status, stop]);

  const toggle = useCallback(async () => {
    if (status === "recording") {
      await stop();
      return;
    }
    if (status === "transcribing") return;
    await start();
  }, [start, status, stop]);

  useEffect(() => {
    return () => {
      void cleanupRecording();
    };
  }, [cleanupRecording]);

  return {
    start,
    stop,
    toggle,
    status,
    transcript,
    error,
    isRecording: status === "recording",
    isBusy: status === "recording" || status === "transcribing",
  };
}
