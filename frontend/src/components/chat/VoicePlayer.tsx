import React, { useState, useRef, useEffect } from 'react';
import { useToastStore } from '../../stores/toastStore';
import './VoicePlayer.css';

interface VoicePlayerProps {
  src: string;
  duration?: number;
}

export function VoicePlayer({ src }: VoicePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Normalize relative backend URLs if needed
  const audioSrc = src.startsWith('/uploads')
    ? `${window.location.protocol}//${window.location.hostname}:5000${src}`
    : src;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoaded = () => {
      if (audio.duration === Infinity) {
        // Chromium WebM Recording Blob Infinity duration fix
        audio.currentTime = 1e101;
        audio.ontimeupdate = () => {
          audio.ontimeupdate = null;
          if (isFinite(audio.duration)) {
            setTotalDuration(audio.duration);
          }
          audio.currentTime = 0;
        };
      } else if (audio.duration && isFinite(audio.duration) && !isNaN(audio.duration)) {
        setTotalDuration(audio.duration);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
      if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        setTotalDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = (e: Event) => {
      console.error('Audio playback error:', e);
      setIsPlaying(false);
    };

    audio.addEventListener('loadedmetadata', handleLoaded);
    audio.addEventListener('loadeddata', handleLoaded);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoaded);
      audio.removeEventListener('loadeddata', handleLoaded);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [audioSrc]);

  // Smooth 60 FPS requestAnimationFrame loop for live circular ring & waveform progress
  useEffect(() => {
    let animId: number;

    const updateLoop = () => {
      const audio = audioRef.current;
      if (audio && !audio.paused) {
        setCurrentTime(audio.currentTime || 0);
        if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
          setTotalDuration(audio.duration);
        }
        animId = requestAnimationFrame(updateLoop);
      }
    };

    if (isPlaying) {
      animId = requestAnimationFrame(updateLoop);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isPlaying]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch (err) {
        console.error('Audio play error:', err);
        useToastStore.getState().addToast({
          type: 'danger',
          title: 'Audio Error',
          message: 'Unable to play voice audio file',
        });
        setIsPlaying(false);
      }
    }
  };

  const handleSeek = (barIndex: number) => {
    const audio = audioRef.current;
    if (!audio || !totalDuration || !isFinite(totalDuration)) return;

    const seekRatio = (barIndex + 1) / BARS.length;
    const targetTime = seekRatio * totalDuration;
    audio.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const toggleSpeed = () => {
    const audio = audioRef.current;
    if (!audio) return;

    let nextRate = 1;
    if (playbackRate === 1) nextRate = 1.5;
    else if (playbackRate === 1.5) nextRate = 2;
    else nextRate = 1;

    audio.playbackRate = nextRate;
    setPlaybackRate(nextRate);
  };

  const formatTime = (secs: number) => {
    if (!secs || !isFinite(secs) || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const safeDuration = (totalDuration && isFinite(totalDuration) && totalDuration > 0)
    ? totalDuration
    : (audioRef.current?.duration && isFinite(audioRef.current.duration))
    ? audioRef.current.duration
    : 0;

  const progressPercent = safeDuration > 0 ? Math.min(100, Math.max(0, (currentTime / safeDuration) * 100)) : 0;

  // Radius 20 in 48px box -> Circumference = 2 * PI * 20 = 125.66
  const CIRCUMFERENCE = 125.66;
  const strokeDashoffset = CIRCUMFERENCE - (progressPercent / 100) * CIRCUMFERENCE;

  // Waveform Bar Heights (Normalized visual audio spectrum)
  const BARS = [30, 45, 60, 80, 55, 70, 90, 40, 65, 85, 50, 75, 95, 60, 40, 80, 70, 50, 85, 40, 60, 75, 45, 30];

  return (
    <div className="voice-player">
      <audio ref={audioRef} src={audioSrc} preload="metadata" />

      {/* Live Circular SVG Progress Wrapper */}
      <div className="voice-player__btn-wrapper">
        <svg className="voice-player__circle-svg" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" className="voice-player__circle-bg" />
          <circle
            cx="24"
            cy="24"
            r="20"
            className="voice-player__circle-fill"
            style={{
              strokeDasharray: CIRCUMFERENCE,
              strokeDashoffset: strokeDashoffset,
            }}
          />
        </svg>

        <button
          type="button"
          className="voice-player__play-btn"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '2px' }}>
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
        </button>
      </div>

      <div className="voice-player__content">
        <div className="voice-player__waveform">
          {BARS.map((heightPercent, index) => {
            const barProgress = (index / BARS.length) * 100;
            const isPlayed = barProgress <= progressPercent;

            return (
              <span
                key={index}
                className={`voice-player__bar ${isPlayed ? 'voice-player__bar--played' : ''}`}
                style={{ height: `${heightPercent}%`, cursor: 'pointer' }}
                onClick={() => handleSeek(index)}
              />
            );
          })}
        </div>

        <div className="voice-player__info">
          <span className="voice-player__time">
            {isPlaying ? formatTime(currentTime) : formatTime(safeDuration || currentTime)}
          </span>
          <button type="button" className="voice-player__speed-btn" onClick={toggleSpeed}>
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
}
