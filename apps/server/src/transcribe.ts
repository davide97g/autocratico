/**
 * Speech to text, on this machine only: audio never leaves the server.
 * ffmpeg turns any input (Telegram voice notes are Ogg/Opus) into 16 kHz mono WAV, then
 * `parakeet-cli` (whisper.cpp's Parakeet TDT runner, multilingual) prints the transcript.
 */
import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

import type { Config } from "./config.ts"
import { locks } from "./files.ts"

const exec = promisify(execFile)
const MAX_SECONDS = 600

export class Transcriber {
  readonly #asr: Config["asr"]

  constructor(config: Config) {
    this.#asr = config.asr
  }

  get available(): boolean {
    return this.#asr !== null
  }

  /** Transcript of an audio file; runs one at a time (the model takes all cores it is given). */
  transcribe(audio: Uint8Array, name = "audio.ogg"): Promise<string> {
    const asr = this.#asr
    if (!asr) return Promise.reject(new Error("speech to text is not configured (ASR_BIN, ASR_MODEL)"))
    return locks.run("asr", async () => {
      const dir = await mkdtemp(join(tmpdir(), "autocratico-asr-"))
      try {
        const input = join(dir, `input${name.match(/\.\w{1,5}$/)?.[0] ?? ""}`)
        const wav = join(dir, "audio.wav")
        await writeFile(input, audio)
        await exec("ffmpeg", ["-nostdin", "-loglevel", "error", "-i", input, "-t", String(MAX_SECONDS), "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav], {
          timeout: 60_000,
        })
        const { stdout, stderr } = await exec(asr.bin, ["-m", asr.model, "-f", wav, "-np", "-t", String(asr.threads)], {
          timeout: 180_000,
          maxBuffer: 4 * 1024 * 1024,
        })
        return parseTranscript(stdout, stderr)
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    })
  }
}

/** parakeet-cli prints the plain transcript on stdout and exits 0 even when it could not read the file. */
export function parseTranscript(stdout: string, stderr: string): string {
  const failure = stderr.split("\n").find((l) => /^error:|failed to (read|load)/i.test(l.trim()))
  if (failure) throw new Error(failure.trim())
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
}
