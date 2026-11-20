import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import type { AudioInfo } from "../lib/vault-audio";

interface Props {
  info: AudioInfo;
  /** Downloads and decrypts the audio. Called on the first Play only, never on mount. */
  load: () => Promise<Blob>;
  onRemove?: () => void;
  busy?: boolean;
}

/** `65` -> `1:05`, `3725` -> `1:02:05`. */
export function formatDuration(total: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** One vault audio file: custom play/pause and seek over a hidden native `<audio>`. */
export function AudioPlayer({ info, load, onRemove, busy }: Props) {
  const el = useRef<HTMLAudioElement>(null);
  const alive = useRef(true);
  const autoplay = useRef(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(info.duration);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // The object URL lives exactly as long as it is in state; unmounting (or locking the vault,
  // which unmounts the section) revokes it and so stops playback.
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  useEffect(() => {
    if (url && autoplay.current) {
      autoplay.current = false;
      el.current?.play()?.catch(() => setPlaying(false));
    }
  }, [url]);

  const fetchAudio = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const blob = await load();
      if (!alive.current) return;
      autoplay.current = true;
      setUrl(URL.createObjectURL(blob));
    } catch {
      if (alive.current) setFailed(true);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [load]);

  const toggle = () => {
    if (!url) { void fetchAudio(); return; }
    const a = el.current;
    if (!a) return;
    if (a.paused) a.play()?.catch(() => setPlaying(false));
    else a.pause();
  };

  const seek = (value: number) => {
    setTime(value);
    if (el.current) el.current.currentTime = value;
  };

  const max = length > 0 ? length : Math.max(time, 1);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-bg px-3 py-2.5">
      <button type="button" className="btn btn-icon" onClick={toggle} disabled={loading || busy}
        aria-label={playing ? "Pause" : "Play"}>
        <Icon name={playing ? "pause" : "play"} size={16} />
      </button>
      <div className="min-w-[140px] flex-1">
        <div className="truncate text-[13.5px] font-semibold" title={info.name}>{info.name}</div>
        {failed ? (
          <div className="flex items-center gap-2 text-[12.5px] text-muted">
            <span>Unavailable</span>
            <button type="button" className="btn !h-7 !px-2.5 text-[12px]" onClick={() => void fetchAudio()} disabled={loading}>
              <Icon name="refresh" size={13} /> Retry
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <input type="range" min={0} max={max} step={0.1} value={Math.min(time, max)}
              onChange={(e) => seek(Number(e.target.value))} disabled={!url}
              aria-label={`Seek ${info.name}`} className="h-1 min-w-0 flex-1 accent-current" />
            <span className="font-mono text-[12px] tabular-nums text-faint">
              {loading ? "Decrypting…" : url ? `${formatDuration(time)} / ${formatDuration(length)}` : formatDuration(length)}
            </span>
          </div>
        )}
      </div>
      {onRemove && (
        <button type="button" className="btn btn-icon" onClick={onRemove} disabled={busy} aria-label={`Remove ${info.name}`}>
          <Icon name="trash" size={16} />
        </button>
      )}
      <audio ref={el} src={url ?? undefined} hidden preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setTime(0); }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setLength(d); }} />
    </div>
  );
}
