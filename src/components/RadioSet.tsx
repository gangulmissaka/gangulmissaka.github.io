// The valley radio: a 1930s tabletop set whose knobs and keys drive a Spotify embed through
// Spotify's iFrame API. The cabinet stays mounted after the first open so music keeps playing
// while the visitor drives; a small "now playing" pill takes over when the radio is closed.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RADIO_STATIONS } from '@/data/radioStations';
import { sound } from '@/lib/audio';

// ── Spotify iFrame API (https://developer.spotify.com/documentation/embeds/references/iframe-api) ──

interface PlaybackData {
  isPaused: boolean;
  isBuffering: boolean;
  /** Milliseconds. */
  duration: number;
  position: number;
  /** The track this update is about ('' while loading). */
  playingURI?: string;
}
interface EmbedController {
  loadUri(uri: string): void;
  play(): void;
  pause(): void;
  resume(): void;
  seek(seconds: number): void;
  addListener(event: 'ready', cb: () => void): void;
  addListener(event: 'playback_update', cb: (e: { data: PlaybackData }) => void): void;
}
interface IFrameAPI {
  createController(el: HTMLElement, opts: { uri: string; width?: string | number; height?: number }, cb: (c: EmbedController) => void): void;
}

let apiPromise: Promise<IFrameAPI> | null = null;
function loadSpotifyApi(): Promise<IFrameAPI> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<IFrameAPI>((resolve, reject) => {
    const w = window as unknown as { __spotifyIFrameAPI?: IFrameAPI; onSpotifyIframeApiReady?: (api: IFrameAPI) => void };
    if (w.__spotifyIFrameAPI) {
      resolve(w.__spotifyIFrameAPI);
      return;
    }
    const timer = window.setTimeout(() => reject(new Error('timeout')), 20000);
    w.onSpotifyIframeApiReady = (api) => {
      window.clearTimeout(timer);
      w.__spotifyIFrameAPI = api;
      resolve(api);
    };
    const s = document.createElement('script');
    s.src = 'https://open.spotify.com/embed/iframe-api/v1';
    s.async = true;
    s.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('network'));
    };
    document.body.appendChild(s);
  }).catch((err) => {
    apiPromise = null; // allow a retry
    throw err;
  });
  return apiPromise;
}

// ── Dial geometry ──

const N = RADIO_STATIONS.length;
const uriOf = (i: number) => `spotify:track:${RADIO_STATIONS[i].id}`;
/** Position of a station along the dial scale, 0–100 %. */
const dialPos = (i: number) => 7 + (i / Math.max(1, N - 1)) * 86;
/** A plausible AM "frequency" (×10 kHz) for the station log. */
const freqOf = (i: number) => Math.round(55 + (dialPos(i) / 100) * 105);
const SCALE_NUMBERS = [55, 70, 80, 90, 100, 120, 140, 160];
const numPos = (f: number) => ((f - 55) / 105) * 100;
const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface Props {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** Fires when music starts or stops (used to duck the world's sound). */
  onPlayingChange: (playing: boolean) => void;
}

export default function RadioSet({ open, onOpen, onClose, onPlayingChange }: Props) {
  const [station, setStation] = useState(0);
  const [power, setPower] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const [attempt, setAttempt] = useState(0);
  const [isBrave, setIsBrave] = useState(false);

  const wrap = useRef<HTMLDivElement>(null);
  const ctrl = useRef<EmbedController | null>(null);
  const requested = useRef(false);
  /** Station currently loaded in the embed. */
  const loaded = useRef(-1);
  const stationRef = useRef(0);
  const powerRef = useRef(false);
  const posRef = useRef(0);
  /** What the visitor last asked for. */
  const intent = useRef<'play' | 'pause'>('pause');
  const pendingPlay = useRef(false);
  /** The embed ignores commands sent before its 'ready' event, so they wait for it. */
  const readyRef = useRef(false);
  const durRef = useRef(0);
  /** Furthest position reached in the loaded song (ms). Only a song that really played can "end". */
  const maxPos = useRef(0);
  /** When the playback position last moved, when play was last requested, last auto-advance (ms). */
  const movedAt = useRef(0);
  const askedAt = useRef(0);
  const advancedAt = useRef(0);
  const pausedRef = useRef(true);
  /** Spotify didn't start: the visitor has to press play inside the Spotify player once. */
  const [blocked, setBlocked] = useState(false);

  const setPowered = (on: boolean) => {
    powerRef.current = on;
    setPower(on);
  };

  const requestPlay = (c: EmbedController, resume: boolean) => {
    intent.current = 'play';
    askedAt.current = Date.now();
    setBlocked(false);
    if (resume) c.resume();
    else c.play();
  };

  /** Load station `i` into the embed and optionally start it. */
  const load = useCallback((i: number, autoplay: boolean) => {
    const c = ctrl.current;
    intent.current = autoplay ? 'play' : 'pause';
    if (autoplay) askedAt.current = Date.now();
    if (!c || !readyRef.current) {
      pendingPlay.current = autoplay; // the 'ready' handler loads the current station and plays
      return;
    }
    maxPos.current = 0;
    posRef.current = 0;
    durRef.current = 0;
    setPos(0);
    setDur(0);
    if (loaded.current !== i) {
      c.loadUri(uriOf(i));
      loaded.current = i;
    }
    if (autoplay) requestPlay(c, false);
  }, []);

  /** Auto-advance after a song ends; never twice in quick succession (no runaway skipping). */
  const advance = () => {
    if (Date.now() - advancedAt.current < 8000) return;
    advancedAt.current = Date.now();
    maxPos.current = 0;
    tuneRef.current(stationRef.current + 1, true);
  };

  const tune = useCallback((i: number, autoplay = powerRef.current) => {
    const n = ((i % N) + N) % N;
    stationRef.current = n;
    setStation(n);
    if (powerRef.current || autoplay) sound.radioStatic();
    if (autoplay) setPowered(true);
    load(n, autoplay);
  }, [load]);
  const tuneRef = useRef(tune);
  tuneRef.current = tune;

  const play = () => {
    sound.click();
    if (!powerRef.current) sound.radioStatic(0.3);
    setPowered(true);
    intent.current = 'play';
    askedAt.current = Date.now();
    const c = ctrl.current;
    if (!c || !readyRef.current) {
      pendingPlay.current = true;
      return;
    }
    if (loaded.current !== stationRef.current) load(stationRef.current, true);
    else requestPlay(c, posRef.current > 0);
  };
  const pause = () => {
    sound.click();
    intent.current = 'pause';
    setBlocked(false);
    ctrl.current?.pause();
  };
  const stop = () => {
    sound.click();
    intent.current = 'pause';
    maxPos.current = 0;
    pendingPlay.current = false;
    setBlocked(false);
    const c = ctrl.current;
    if (c) {
      c.pause();
      c.seek(0);
    }
    posRef.current = 0;
    setPos(0);
  };
  const togglePower = () => {
    if (powerRef.current) {
      stop();
      setPowered(false);
    } else {
      play();
    }
  };

  // Create the embed the first time the radio opens (nothing loads from Spotify before that).
  useEffect(() => {
    if (!open || requested.current) return;
    requested.current = true;
    setStatus('loading');
    loadSpotifyApi()
      .then((api) => {
        if (!wrap.current) return;
        const el = document.createElement('div'); // the API replaces this element with its iframe
        wrap.current.appendChild(el);
        api.createController(el, { uri: uriOf(stationRef.current), width: '100%', height: 80 }, (c) => {
          ctrl.current = c;
          loaded.current = stationRef.current;
          c.addListener('ready', () => {
            if (readyRef.current) return;
            readyRef.current = true;
            setStatus('ready');
            const wanted = pendingPlay.current;
            pendingPlay.current = false;
            if (loaded.current !== stationRef.current || wanted) load(stationRef.current, wanted);
          });
          c.addListener('playback_update', ({ data }) => {
            // Ignore late updates from the previous song while a new one loads.
            if (data.playingURI && data.playingURI !== uriOf(loaded.current)) return;
            if (data.position !== posRef.current) movedAt.current = Date.now();
            durRef.current = data.duration;
            posRef.current = data.position;
            pausedRef.current = data.isPaused;
            maxPos.current = Math.max(maxPos.current, data.position);
            setPos(data.position);
            setDur(data.duration);
            setBuffering(data.isBuffering);
            setPlaying(!data.isPaused);
            if (!data.isPaused && data.position > 0) {
              setBlocked(false);
              if (!powerRef.current) setPowered(true); // started from the embed's own button
              intent.current = 'play';
            }
            // Paused at the very end of a song that really played → next station.
            if (data.isPaused && intent.current === 'play' && maxPos.current > 3000 && data.duration > 0 && data.position >= data.duration - 1500) {
              advance();
            }
          });
        });
      })
      .catch(() => {
        requested.current = false;
        setStatus('error');
      });
  }, [open, load, attempt]);

  // Watchdog. A preview can end without a "paused" update (the embed just stops at the end), so
  // advance when a song that really played sits at its end. And if a requested song never starts
  // (browser autoplay rules, Spotify login, …), stop and ask for one press on the Spotify player
  // instead of skipping through the stations.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (intent.current !== 'play') return;
      const now = Date.now();
      const d = durRef.current;
      if (maxPos.current > 3000 && d > 0 && posRef.current >= d - 1000 && now - movedAt.current > 1800) {
        advance();
        return;
      }
      if (!readyRef.current) return; // still loading the player; nothing could have started yet
      const waited = now - askedAt.current;
      const notStarted = maxPos.current < 300;
      if (notStarted && ((pausedRef.current && waited > 5000) || waited > 25000)) {
        intent.current = 'pause';
        setBlocked(true);
      }
    }, 700);
    return () => window.clearInterval(t);
  }, []);

  // Brave Shields hide the Spotify login from the embed, so Brave visitors get a specific tip.
  useEffect(() => {
    const b = (navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } }).brave;
    b?.isBrave?.().then(setIsBrave).catch(() => undefined);
  }, []);

  const live = power && playing;
  useEffect(() => onPlayingChange(live), [live, onPlayingChange]);

  // Esc closes; ←/→ tune while the radio is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') tuneRef.current(stationRef.current - 1);
      else if (e.key === 'ArrowRight') tuneRef.current(stationRef.current + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const cur = RADIO_STATIONS[station];
  const knobWheel = (e: React.WheelEvent) => tune(station + (e.deltaY > 0 ? 1 : -1));
  const knobClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    tune(station + (e.clientX < r.left + r.width / 2 ? -1 : 1));
  };
  const statusLine = !power
    ? 'Radio off · press play or the power knob'
    : status === 'loading' || status === 'idle'
      ? 'Warming up the valves…'
      : status === 'error'
        ? 'Can’t reach Spotify right now'
        : blocked
          ? 'Press ▶ on the Spotify player'
          : buffering
          ? 'Tuning in…'
          : playing
            ? 'On air'
            : 'Paused';

  return (
    <>
      <div className={`radio-overlay ${open ? 'is-open' : ''}`} onClick={onClose} aria-hidden={!open}>
        <div className="radio-stack" onClick={(e) => e.stopPropagation()}>
          <div className={`radio ${power ? 'is-on' : ''} ${live ? 'is-playing' : ''}`} role="dialog" aria-label="Valley radio">
            <button className="radio-close" onClick={onClose} aria-label="Close the radio">
              <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>

            <div className="radio-grille" aria-hidden>
              <div className="radio-cloth" />
              <div className="radio-fret">
                {[54, 76, 90, 100, 90, 76, 54].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}
              </div>
              <div className="radio-badge">GM · Valley Radio</div>
            </div>

            <div className="radio-dial">
              <div className="radio-scale">
                {SCALE_NUMBERS.map((f) => (
                  <span key={f} className="radio-num" style={{ left: `${numPos(f)}%` }}>{f}</span>
                ))}
                <div className="radio-ticks" />
                {RADIO_STATIONS.map((s, i) => (
                  <button
                    key={s.id}
                    className={`radio-mark ${i === station ? 'is-current' : ''}`}
                    style={{ left: `${dialPos(i)}%` }}
                    onClick={() => tune(i, true)}
                    title={`${s.title} — ${s.artists}`}
                    aria-label={`Tune to ${s.title}`}
                  />
                ))}
                <div className="radio-needle" style={{ left: `${dialPos(station)}%` }} />
                <span className="radio-unit">KC</span>
              </div>
              <div className="radio-readout">
                <div className="radio-eye" aria-hidden />
                <div className="radio-np">
                  <div className="radio-np-title">{cur.title}</div>
                  <div className="radio-np-sub">{cur.artists}{cur.from ? ` · ${cur.from}` : ''}</div>
                </div>
                <div className="radio-time">
                  <span>{statusLine}</span>
                  {power && dur > 0 && <b>{fmt(pos)} / {fmt(dur)}</b>}
                </div>
              </div>
            </div>

            <div className={`radio-embed ${blocked ? 'is-blocked' : ''}`}>
              <div ref={wrap} className="radio-embed-host" />
              {status !== 'ready' && (
                <div className="radio-embed-msg">
                  {status === 'error' ? (
                    <button className="radio-retry" onClick={() => setAttempt((a) => a + 1)}>
                      Spotify didn’t load · try again
                    </button>
                  ) : (
                    'Connecting to Spotify…'
                  )}
                </div>
              )}
            </div>

            <div className="radio-controls">
              <div className="radio-knob-wrap">
                <button
                  className="radio-knob"
                  style={{ ['--a' as string]: `${station * 33 - 150}deg` }}
                  onClick={knobClick}
                  onWheel={knobWheel}
                  aria-label="Tuning knob: click the left or right half to change station"
                  title="Tuning · click left / right, or scroll"
                >
                  <i />
                </button>
                <span>Tuning</span>
              </div>

              <div className="radio-keys">
                <button className="radio-key" onClick={() => tune(station - 1, powerRef.current)} aria-label="Previous station" title="Previous station (←)">
                  <svg viewBox="0 0 24 24"><path d="M6 6v12M18 6l-9 6 9 6z" /></svg>
                </button>
                {live ? (
                  <button className="radio-key is-down" onClick={pause} aria-label="Pause" title="Pause">
                    <svg viewBox="0 0 24 24"><path d="M8 6v12M16 6v12" /></svg>
                  </button>
                ) : (
                  <button className="radio-key" onClick={play} aria-label="Play" title="Play">
                    <svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z" /></svg>
                  </button>
                )}
                <button className="radio-key" onClick={stop} aria-label="Stop" title="Stop">
                  <svg viewBox="0 0 24 24"><path d="M7 7h10v10H7z" /></svg>
                </button>
                <button className="radio-key" onClick={() => tune(station + 1, powerRef.current)} aria-label="Next station" title="Next station (→)">
                  <svg viewBox="0 0 24 24"><path d="M18 6v12M6 6l9 6-9 6z" /></svg>
                </button>
              </div>

              <div className="radio-knob-wrap">
                <button
                  className={`radio-knob is-power ${power ? 'is-on' : ''}`}
                  style={{ ['--a' as string]: power ? '40deg' : '-40deg' }}
                  onClick={togglePower}
                  aria-label={power ? 'Turn the radio off' : 'Turn the radio on'}
                  aria-pressed={power}
                  title={power ? 'Power: on' : 'Power: off'}
                >
                  <i />
                </button>
                <span>{power ? 'On' : 'Off'}</span>
              </div>
            </div>
            <div className="radio-feet" aria-hidden><i /><i /></div>
          </div>

          <div className="radio-side">
            <div className="radio-log">
              <div className="radio-log-head">
                <span>Station log</span>
                <small>{N} stations</small>
              </div>
              <ol>
                {RADIO_STATIONS.map((s, i) => (
                  <li key={s.id}>
                    <button className={i === station ? 'is-current' : ''} onClick={() => tune(i, true)}>
                      <span className="freq">{freqOf(i)}</span>
                      <span className="song">
                        <b>{s.title}</b>
                        <small>{s.artists}</small>
                      </span>
                      {i === station && live && <span className="eq" aria-label="Playing"><i /><i /><i /></span>}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
            <p className="radio-note">
              Songs stream from Spotify. If you aren’t logged in to Spotify in this browser, you’ll hear short previews.
              {blocked && ' If a song won’t start, press ▶ once on the Spotify player in the radio.'}
            </p>
            {isBrave && (
              <p className="radio-note radio-note-tip">
                <b>Using Brave?</b> Shields block Spotify’s login inside other sites, so you’ll hear previews even when
                you’re logged in. For full songs: click the lion icon → allow cross-site cookies for this site, and turn
                on <b>Widevine</b> in Settings → Extensions.
              </p>
            )}
          </div>
        </div>
      </div>

      {!open && power && (
        <div className="radio-mini glass">
          <button className="radio-mini-open" onClick={onOpen} title="Open the radio">
            <span className={`eq ${live ? '' : 'is-still'}`} aria-hidden><i /><i /><i /></span>
            <span className="radio-mini-text">
              <b>{cur.title}</b>
              <small>{cur.artists}</small>
            </span>
          </button>
          {live ? (
            <button className="radio-mini-btn" onClick={pause} aria-label="Pause">
              <svg viewBox="0 0 24 24"><path d="M8 6v12M16 6v12" /></svg>
            </button>
          ) : (
            <button className="radio-mini-btn" onClick={play} aria-label="Play">
              <svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z" /></svg>
            </button>
          )}
          <button className="radio-mini-btn" onClick={() => tune(station + 1, true)} aria-label="Next station">
            <svg viewBox="0 0 24 24"><path d="M18 6v12M6 6l9 6-9 6z" /></svg>
          </button>
          <button className="radio-mini-btn" onClick={togglePower} aria-label="Turn the radio off">
            <svg viewBox="0 0 24 24"><path d="M12 3v8" /><path d="M6.3 7.3a8 8 0 1 0 11.4 0" /></svg>
          </button>
        </div>
      )}
    </>
  );
}
