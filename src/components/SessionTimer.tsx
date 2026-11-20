import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Timer, Volume2, VolumeX, X } from 'lucide-react';

const PRESET_MINUTES = [15, 25, 45, 60] as const;
const MIN_DURATION_MINUTES = 1;
const MAX_DURATION_MINUTES = 180;
const DEFAULT_DURATION_MINUTES = 25;
const STORAGE_KEY_MINUTES = 'sable_studio_session_minutes';

function loadSavedDurationMinutes(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_MINUTES);
    if (!raw) return DEFAULT_DURATION_MINUTES;
    const parsed = Number.parseInt(raw, 10);
    if (
      Number.isFinite(parsed) &&
      parsed >= MIN_DURATION_MINUTES &&
      parsed <= MAX_DURATION_MINUTES
    ) {
      return parsed;
    }
  } catch {
    // Ignore storage access errors in restricted iframe environments
  }
  return DEFAULT_DURATION_MINUTES;
}

function saveDurationMinutes(minutes: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY_MINUTES, String(minutes));
  } catch {
    // Ignore storage access errors
  }
}

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

function playGentleDarkroomChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes = [523.25, 659.25]; // C5 -> E5 soft studio bell interval
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.16);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.16 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.16 + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.16);
      osc.stop(now + idx * 0.16 + 0.58);
    });

    window.setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 1000);
  } catch {
    // Silent fallback when audio playback is restricted
  }
}

export const SessionTimer: React.FC = () => {
  const initialMinutes = useRef<number>(loadSavedDurationMinutes()).current;

  const [durationMinutes, setDurationMinutes] = useState<number>(initialMinutes);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(initialMinutes * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isPopoverOpen, setIsPopoverOpen] = useState<boolean>(false);
  const [customInput, setCustomInput] = useState<string>(String(initialMinutes));
  const [inputError, setInputError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const endTimestampRef = useRef<number | null>(null);
  const soundEnabledRef = useRef<boolean>(soundEnabled);
  const remainingSecondsRef = useRef<number>(remainingSeconds);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    remainingSecondsRef.current = remainingSeconds;
  }, [remainingSeconds]);

  const totalDurationSeconds = durationMinutes * 60;
  const elapsedFraction =
    totalDurationSeconds > 0
      ? Math.max(0, Math.min(1, 1 - remainingSeconds / totalDurationSeconds))
      : 0;

  // Drift-resistant countdown ticker (single interval per active run)
  useEffect(() => {
    if (!isRunning) {
      endTimestampRef.current = null;
      return;
    }

    if (endTimestampRef.current === null) {
      endTimestampRef.current = Date.now() + remainingSecondsRef.current * 1000;
    }

    const tick = () => {
      if (endTimestampRef.current === null) return;
      const msLeft = endTimestampRef.current - Date.now();
      const nextSeconds = Math.max(0, Math.ceil(msLeft / 1000));
      setRemainingSeconds(nextSeconds);

      if (nextSeconds <= 0) {
        endTimestampRef.current = null;
        setIsRunning(false);
        setIsCompleted(true);
        if (soundEnabledRef.current) {
          playGentleDarkroomChime();
        }
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 250);
    return () => window.clearInterval(intervalId);
  }, [isRunning]);

  // Dismiss popover on outside click or Escape
  useEffect(() => {
    if (!isPopoverOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsPopoverOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPopoverOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPopoverOpen]);

  const handleToggleRun = useCallback(() => {
    setInputError(null);
    if (isRunning) {
      endTimestampRef.current = null;
      setIsRunning(false);
      return;
    }

    const startSeconds = remainingSeconds <= 0 ? durationMinutes * 60 : remainingSeconds;
    setRemainingSeconds(startSeconds);
    setIsCompleted(false);
    endTimestampRef.current = Date.now() + startSeconds * 1000;
    setIsRunning(true);
  }, [isRunning, remainingSeconds, durationMinutes]);

  const handleReset = useCallback(() => {
    endTimestampRef.current = null;
    setIsRunning(false);
    setIsCompleted(false);
    setRemainingSeconds(durationMinutes * 60);
    setInputError(null);
  }, [durationMinutes]);

  const applyDurationMinutes = useCallback((minutes: number, autoStart = false) => {
    const clamped = Math.max(MIN_DURATION_MINUTES, Math.min(MAX_DURATION_MINUTES, minutes));
    setDurationMinutes(clamped);
    setCustomInput(String(clamped));
    setRemainingSeconds(clamped * 60);
    setIsCompleted(false);
    setInputError(null);
    saveDurationMinutes(clamped);

    if (autoStart) {
      endTimestampRef.current = Date.now() + clamped * 60 * 1000;
      setIsRunning(true);
    } else {
      endTimestampRef.current = null;
      setIsRunning(false);
    }
  }, []);

  const handleExtendFiveMinutes = useCallback(() => {
    const addedSeconds = 5 * 60;
    const nextSeconds = Math.min(MAX_DURATION_MINUTES * 60, remainingSeconds + addedSeconds);
    setRemainingSeconds(nextSeconds);
    setIsCompleted(false);
    if (nextSeconds > durationMinutes * 60) {
      const nextMins = Math.min(MAX_DURATION_MINUTES, Math.ceil(nextSeconds / 60));
      setDurationMinutes(nextMins);
      setCustomInput(String(nextMins));
      saveDurationMinutes(nextMins);
    }
    if (isRunning) {
      endTimestampRef.current = Date.now() + nextSeconds * 1000;
    }
  }, [remainingSeconds, durationMinutes, isRunning]);

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number.parseInt(customInput.trim(), 10);
    if (!Number.isFinite(parsed) || parsed < MIN_DURATION_MINUTES || parsed > MAX_DURATION_MINUTES) {
      setInputError(`Enter ${MIN_DURATION_MINUTES}–${MAX_DURATION_MINUTES} minutes`);
      return;
    }
    applyDurationMinutes(parsed, false);
  };

  const statusText = isCompleted
    ? 'Session complete'
    : isRunning
      ? 'In session'
      : remainingSeconds < totalDurationSeconds
        ? 'Paused'
        : 'Ready';

  const isLowTime = isRunning && remainingSeconds > 0 && remainingSeconds <= 60;

  return (
    <div ref={containerRef} className="relative flex items-center shrink-0">
      {/* Screen-reader status update on completion */}
      <span className="sr-only" role="status" aria-live="polite">
        {isCompleted ? 'Studio session timer complete.' : ''}
      </span>

      {/* Compact TopBar Timer Control */}
      <div
        className={`inline-flex min-h-[40px] items-center rounded-md border bg-[#141416] transition-colors duration-150 ${
          isCompleted
            ? 'border-[#6CC091]/60'
            : isRunning
              ? 'border-[#D4A853]/55'
              : 'border-white/[0.1] hover:border-white/20'
        }`}
      >
        <button
          type="button"
          onClick={() => setIsPopoverOpen((prev) => !prev)}
          aria-expanded={isPopoverOpen}
          aria-haspopup="dialog"
          aria-label={`Studio session timer: ${formatCountdown(remainingSeconds)}, ${statusText}. Open timer settings`}
          className="inline-flex min-h-[38px] items-center gap-2 rounded-l-[5px] px-3 py-1.5 text-xs whitespace-nowrap shrink-0 transition-colors duration-150 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D4A853] cursor-pointer"
        >
          <Timer
            className={`h-3.5 w-3.5 shrink-0 ${
              isCompleted
                ? 'text-[#6CC091]'
                : isRunning
                  ? 'text-[#D4A853]'
                  : 'text-[#9B968C]'
            }`}
            aria-hidden="true"
          />
          <span
            className={`font-mono text-xs font-medium tabular-nums ${
              isCompleted
                ? 'text-[#6CC091]'
                : isLowTime
                  ? 'text-[#E07A5F]'
                  : 'text-[#F5F1E8]'
            }`}
          >
            {formatCountdown(remainingSeconds)}
          </span>
          {isCompleted && (
            <span className="hidden sm:inline text-[11px] font-medium text-[#6CC091]">
              Done
            </span>
          )}
        </button>

        <span className="h-4 w-px bg-white/[0.08]" aria-hidden="true" />

        <button
          type="button"
          onClick={handleToggleRun}
          aria-label={isRunning ? 'Pause studio session timer' : 'Start studio session timer'}
          title={isRunning ? 'Pause session timer' : 'Start session timer'}
          className="flex h-[38px] w-9 items-center justify-center rounded-r-[5px] text-[#9B968C] transition-colors duration-150 hover:bg-white/[0.04] hover:text-[#F5F1E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D4A853] cursor-pointer"
        >
          {isRunning ? (
            <Pause className="h-3.5 w-3.5 text-[#D4A853]" aria-hidden="true" />
          ) : (
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Studio Session Timer Settings Popover */}
      {isPopoverOpen && (
        <div
          role="dialog"
          aria-label="Studio session timer controls"
          className="absolute top-full right-0 z-50 mt-2.5 w-72 rounded-xl border border-white/[0.12] bg-[#141416] p-4 shadow-[0_20px_48px_rgba(0,0,0,0.78)] sm:w-80"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-serif text-lg font-semibold leading-tight text-[#F5F1E8]">
                Studio Session Timer
              </p>
              <p className="mt-0.5 text-xs text-[#9B968C]">
                <span>{statusText}</span>
                <span aria-hidden="true"> · </span>
                <span className="font-mono tabular-nums">{durationMinutes}m block</span>
              </p>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSoundEnabled((prev) => !prev)}
                aria-pressed={soundEnabled}
                aria-label={soundEnabled ? 'Mute completion chime' : 'Enable completion chime'}
                title={soundEnabled ? 'Chime enabled' : 'Chime muted'}
                className="flex h-7 w-7 items-center justify-center rounded text-[#9B968C] transition-colors hover:bg-white/[0.07] hover:text-[#F5F1E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
              >
                {soundEnabled ? (
                  <Volume2 className="h-3.5 w-3.5 text-[#D4A853]" aria-hidden="true" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsPopoverOpen(false)}
                aria-label="Close studio session timer"
                className="flex h-7 w-7 items-center justify-center rounded text-[#9B968C] transition-colors hover:bg-white/[0.07] hover:text-[#F5F1E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Large Tabular Readout & Progress Track */}
          <div className="mt-3.5 rounded-lg border border-white/[0.07] bg-[#0B0B0C] px-3.5 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span
                className={`font-mono text-2xl font-semibold tracking-tight tabular-nums ${
                  isCompleted
                    ? 'text-[#6CC091]'
                    : isLowTime
                      ? 'text-[#E07A5F]'
                      : 'text-[#F5F1E8]'
                }`}
              >
                {formatCountdown(remainingSeconds)}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-[#9B968C]">
                {Math.round(elapsedFraction * 100)}% elapsed
              </span>
            </div>
            <div
              aria-hidden="true"
              className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.08]"
            >
              <div
                className={`h-full w-full origin-left rounded-full transition-transform duration-200 ${
                  isCompleted ? 'bg-[#6CC091]' : 'bg-[#D4A853]'
                }`}
                style={{ transform: `scaleX(${elapsedFraction})` }}
              />
            </div>
          </div>

          {/* Quick Session Presets */}
          <div className="mt-3.5">
            <p className="mb-1.5 text-[11px] font-medium text-[#9B968C]">Quick Presets</p>
            <div className="grid grid-cols-4 gap-1.5">
              {PRESET_MINUTES.map((mins) => {
                const isSelected = durationMinutes === mins;
                return (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => applyDurationMinutes(mins, false)}
                    aria-pressed={isSelected}
                    className={`min-h-[32px] rounded-md border px-2 py-1 font-mono text-xs tabular-nums whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer ${
                      isSelected
                        ? 'border-[#D4A853] bg-[#D4A853]/15 text-[#F5F1E8]'
                        : 'border-white/[0.08] bg-[#0B0B0C] text-[#9B968C] hover:border-white/20 hover:text-[#F5F1E8]'
                    }`}
                  >
                    {mins}m
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Duration Input */}
          <form onSubmit={handleCustomSubmit} className="mt-3.5">
            <label
              htmlFor="studio-session-custom-minutes"
              className="mb-1.5 block text-[11px] font-medium text-[#9B968C]"
            >
              Custom Duration (minutes)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="studio-session-custom-minutes"
                type="number"
                inputMode="numeric"
                min={MIN_DURATION_MINUTES}
                max={MAX_DURATION_MINUTES}
                step={1}
                value={customInput}
                onChange={(e) => {
                  setCustomInput(e.target.value);
                  setInputError(null);
                }}
                className="min-h-[36px] w-full rounded-md border border-white/[0.1] bg-[#0B0B0C] px-3 py-1.5 font-mono text-xs tabular-nums text-[#F5F1E8] focus:border-[#D4A853] focus:outline-none"
              />
              <button
                type="submit"
                className="min-h-[36px] rounded-md border border-white/[0.12] bg-[#1C1C1F] px-3.5 py-1.5 text-xs font-semibold text-[#F5F1E8] whitespace-nowrap shrink-0 transition-colors duration-150 hover:border-[#D4A853]/60 hover:bg-[#26262B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
              >
                Set
              </button>
            </div>
            {inputError && (
              <p role="alert" className="mt-1 text-[11px] text-amber-300">
                {inputError}
              </p>
            )}
          </form>

          {/* Session Playback Controls */}
          <div className="mt-4 flex items-center gap-2 border-t border-white/[0.07] pt-3.5">
            <button
              type="button"
              onClick={handleToggleRun}
              className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-md bg-[#F5F1E8] px-3 py-1.5 text-xs font-semibold text-[#0B0B0C] whitespace-nowrap transition-colors duration-150 hover:bg-[#E7E0D0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
            >
              {isRunning ? (
                <>
                  <Pause className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{isCompleted ? 'Restart' : 'Start Session'}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleExtendFiveMinutes}
              disabled={remainingSeconds >= MAX_DURATION_MINUTES * 60}
              title="Add 5 minutes to current studio session"
              className="inline-flex min-h-[38px] items-center justify-center rounded-md border border-white/[0.1] bg-[#0B0B0C] px-2.5 py-1.5 font-mono text-xs tabular-nums text-[#F5F1E8] whitespace-nowrap shrink-0 transition-colors duration-150 hover:border-[#D4A853]/60 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
            >
              +5m
            </button>

            <button
              type="button"
              onClick={handleReset}
              aria-label="Reset studio session timer"
              title="Reset timer"
              className="flex h-[38px] w-9 items-center justify-center rounded-md border border-white/[0.1] bg-[#0B0B0C] text-[#9B968C] shrink-0 transition-colors duration-150 hover:border-white/25 hover:text-[#F5F1E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853] cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
