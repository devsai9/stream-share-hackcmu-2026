"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as Tone from "tone";
import { NoteBlock } from "../types/music";

export interface UseAudioEngineReturn {
  isPlaying: boolean;
  bpm: number;
  currentStep: number;
  currentTimelineStep: number;
  isLoaded: boolean;
  setBpm: (bpm: number) => void;
  playPreview: (pitch: string, duration?: string) => Promise<void>;
  togglePlayback: () => Promise<void>;
  stopPlayback: () => void;
  scheduleNotes: (notes: NoteBlock[]) => void;
}

export function useAudioEngine(initialBpm = 120): UseAudioEngineReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpmState] = useState(initialBpm);
  const [currentStep, setCurrentStep] = useState(-1);
  const [currentTimelineStep, setCurrentTimelineStep] = useState(-1);
  const [isLoaded, setIsLoaded] = useState(false);

  const initialBpmRef = useRef(initialBpm);

  // References to Tone.js objects to survive component re-renders
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const scheduledEventsRef = useRef<number[]>([]);
  const tickEventIdRef = useRef<number | null>(null);

  // 1. Initialize Tone.js objects safely on the client side
  useEffect(() => {
    // Only run in the browser
    if (typeof window === "undefined") return;

    // Set initial getTransport() BPM
    Tone.getTransport().bpm.value = initialBpmRef.current;
    Tone.getTransport().loop = true;
    // Loop over the full 100-bar track timeline.
    Tone.getTransport().loopStart = 0;
    Tone.getTransport().loopEnd = "100m";

    // Initialize PolySynth for playing chords and multiple tracks
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: {
        type: "triangle", // Soft and retro sound
      },
      envelope: {
        attack: 0.02,
        decay: 0.1,
        sustain: 0.3,
        release: 0.5,
      },
    }).toDestination();

    synthRef.current = synth;

    // Defer setting loaded state to avoid synchronous state updates in effect body
    const loadTimeout = setTimeout(() => {
      setIsLoaded(true);
    }, 0);

    // Set up a repeating 16th-note callback to track the exact current playhead step
    const ticksPerStep = Tone.getTransport().PPQ / 4; // 16th note step tick duration
    const tickEventId = Tone.getTransport().scheduleRepeat(() => {
      // Track both the local 16-step position and the absolute 100-bar position.
      const timelineStep = Math.floor(Tone.getTransport().ticks / ticksPerStep) % 400;
      const step = timelineStep % 16;
      setCurrentStep(step);
      setCurrentTimelineStep(timelineStep);
    }, "16n");

    tickEventIdRef.current = tickEventId;

    // Cleanup when hook unmounts
    return () => {
      clearTimeout(loadTimeout);
      synth.dispose();
      if (tickEventId !== null) {
        Tone.getTransport().clear(tickEventId);
      }
      // Clear any other scheduled events
      scheduledEventsRef.current.forEach((id) => Tone.getTransport().clear(id));
      Tone.getTransport().stop();
    };
  }, []);

  // 2. Update BPM whenever state changes
  const setBpm = useCallback((newBpm: number) => {
    const safeBpm = Math.max(20, Math.min(300, newBpm)); // keep BPM in reasonable range
    setBpmState(safeBpm);
    if (typeof window !== "undefined") {
      Tone.getTransport().bpm.value = safeBpm;
    }
  }, []);

  // 3. Play a single note preview (for key clicks or note placement)
  const playPreview = useCallback(async (pitch: string, duration = "8n") => {
    if (typeof window === "undefined" || !synthRef.current) return;

    // Web browsers require user interaction to start the AudioContext
    if (Tone.getContext().state !== "running") {
      await Tone.start();
    }

    synthRef.current.triggerAttackRelease(pitch, duration);
  }, []);

  // 4. Toggle getTransport() playback
  const togglePlayback = useCallback(async () => {
    if (typeof window === "undefined") return;

    if (Tone.getContext().state !== "running") {
      await Tone.start();
    }

    if (isPlaying) {
      Tone.getTransport().pause();
      setIsPlaying(false);
    } else {
      Tone.getTransport().start();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  // 5. Stop getTransport() playback and reset the playhead
  const stopPlayback = useCallback(() => {
    if (typeof window === "undefined") return;

    Tone.getTransport().stop();
    setIsPlaying(false);
    setCurrentStep(-1);
    setCurrentTimelineStep(-1);
  }, []);

  // 6. Dynamically schedule the sequence of note blocks on the getTransport() timeline
  const scheduleNotes = useCallback((notes: NoteBlock[]) => {
    if (typeof window === "undefined" || !synthRef.current) return;

    // Clear previously scheduled note playback events
    scheduledEventsRef.current.forEach((id) => Tone.getTransport().clear(id));
    scheduledEventsRef.current = [];

    // Schedule each note block based on startStep and duration
    notes.forEach((note) => {
      // 1 sixteenth note = "16n"
      // Convert start step and duration to seconds dynamically
      const startSeconds = note.startStep * Tone.Time("16n").toSeconds();
      const durationSeconds = note.duration * Tone.Time("16n").toSeconds();

      const eventId = Tone.getTransport().schedule((time) => {
        if (synthRef.current) {
          synthRef.current.triggerAttackRelease(
            note.pitch,
            durationSeconds,
            time
          );
        }
      }, startSeconds);

      scheduledEventsRef.current.push(eventId);
    });
  }, []);

  return {
    isPlaying,
    bpm,
    currentStep,
    currentTimelineStep,
    isLoaded,
    setBpm,
    playPreview,
    togglePlayback,
    stopPlayback,
    scheduleNotes,
  };
}
