"use client";

import React, { useState } from "react";
import { Play, Pause, Square, Mic, Music2, Plus, Users } from "lucide-react";

interface NoteBlock {
  id: string;
  pitch: string;
  startStep: number;
  duration: number;
  userId?: string;
  isDragging?: boolean;
}

const PITCHES = ["C5", "B4", "A4", "G4", "F4", "E4", "D4", "C4"];
const TOTAL_STEPS = 16;

export default function EditorPage() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [activeTrack, setActiveTrack] = useState(1);

  const [notes] = useState<NoteBlock[]>([
    { id: "1", pitch: "E4", startStep: 0, duration: 2 },
    { id: "2", pitch: "G4", startStep: 2, duration: 2 },
    { id: "3", pitch: "C5", startStep: 4, duration: 4, isDragging: true, userId: "peer1" },
  ]);

  return (
    <div style={styles.pageContainer}>
      {/* 1. TOP CONTROL BAR */}
      <header style={styles.header}>
        {/* Transport Controls */}
        <div style={styles.flexCenterGap3}>
          <button 
            onClick={() => setIsPlaying(!isPlaying)}
            style={styles.playButton}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: "2px" }} />}
          </button>
          <button style={styles.iconButton}>
            <Square size={16} />
          </button>
          <button style={{ ...styles.iconButton, color: "#ef4444" }}>
            <Mic size={18} />
          </button>
          
          <div style={styles.divider} />

          {/* BPM Input */}
          <div style={styles.bpmContainer}>
            <span style={{ color: "var(--accent)" }}>BPM</span>
            <input 
              type="number" 
              value={bpm} 
              onChange={(e) => setBpm(Number(e.target.value))}
              style={styles.bpmInput}
            />
          </div>
        </div>

        {/* Project Details */}
        <div style={{ fontSize: "14px", fontWeight: 600, letterSpacing: "0.025em" }}>
          Realtime Session <span style={{ color: "var(--accent)" }}>#001</span>
        </div>

        {/* Multiplayer Presence */}
        <div style={styles.flexCenterGap3}>
          <div style={styles.presenceBadge}>
            <Users size={14} style={{ color: "var(--accent)" }} />
            <span>2 Active</span>
          </div>
          <div style={{ display: "flex", marginInline: "-4px" }}>
            <div style={{ ...styles.avatar, background: "var(--primary)" }}>You</div>
            <div style={{ ...styles.avatar, background: "var(--accent)", marginLeft: "-8px" }}>P2</div>
          </div>
        </div>
      </header>

      {/* MAIN WORKSPACE */}
      <div style={styles.workspace}>
        
        {/* 2. TRACKS TIMELINE VIEW */}
        <div style={styles.tracksSection}>
          {[1, 2].map((trackId) => (
            <div 
              key={trackId}
              onClick={() => setActiveTrack(trackId)}
              style={{
                ...styles.trackRow,
                backgroundColor: activeTrack === trackId ? "rgba(255, 255, 255, 0.03)" : "transparent"
              }}
            >
              {/* Track Info Side Panel */}
              <div 
                style={{ 
                  ...styles.trackSidePanel,
                  backgroundColor: activeTrack === trackId ? "var(--secondary-accent)" : "transparent" 
                }}
              >
                <div style={styles.flexCenterGap2}>
                  <Music2 size={14} style={{ color: "var(--accent)" }} />
                  <span style={{ fontSize: "12px", fontWeight: "bold" }}>Track {trackId}</span>
                </div>
                <div style={styles.trackControls}>
                  <span>M</span> <span>S</span>
                  <input type="range" style={styles.slider} />
                </div>
              </div>

              {/* Timeline Track Lane */}
              <div style={styles.timelineLane}>
                <div 
                  style={{ 
                    ...styles.midiClip,
                    left: `${trackId * 10}%`, 
                    background: trackId === 1 ? "var(--secondary)" : "var(--primary)",
                  }}
                >
                  MIDI Clip {trackId}
                </div>
              </div>
            </div>
          ))}

          <button style={styles.addTrackButton}>
            <Plus size={14} /> Add Track
          </button>
        </div>

        {/* 3. PIANO ROLL EDITOR */}
        <div style={styles.pianoRollSection}>
          
          {/* Piano Keys Column */}
          <div style={styles.pianoKeysColumn}>
            {PITCHES.map((pitch) => (
              <div 
                key={pitch}
                style={{
                  ...styles.pianoKey,
                  backgroundColor: pitch.includes("#") ? "#0a0302" : "transparent"
                }}
              >
                {pitch}
              </div>
            ))}
          </div>

          {/* Piano Grid Canvas */}
          <div style={styles.gridCanvas}>
            {PITCHES.map((pitch) => (
              <div key={pitch} style={styles.gridRow}>
                {Array.from({ length: TOTAL_STEPS }).map((_, stepIndex) => (
                  <div key={stepIndex} style={styles.gridCell} />
                ))}
              </div>
            ))}

            {/* Render Draggable Note Blocks */}
            {notes.map((note) => {
              const rowIndex = PITCHES.indexOf(note.pitch);
              if (rowIndex === -1) return null;

              return (
                <div
                  key={note.id}
                  style={{
                    ...styles.noteBlock,
                    top: `${(rowIndex / PITCHES.length) * 100}%`,
                    height: `${(1 / PITCHES.length) * 100}%`,
                    left: `${(note.startStep / TOTAL_STEPS) * 100}%`,
                    width: `${(note.duration / TOTAL_STEPS) * 100}%`,
                    background: note.isDragging ? "var(--accent)" : "var(--primary)",
                    boxShadow: note.isDragging ? "0 0 0 2px #facc15" : "0 2px 4px rgba(0,0,0,0.3)",
                    cursor: note.isDragging ? "grabbing" : "grab",
                    opacity: note.isDragging ? 0.8 : 1,
                  }}
                >
                  {note.userId && <span style={styles.userTag}>{note.userId}</span>}
                  {note.pitch}
                </div>
              );
            })}
          </div>

        </div>

      </div>
    </div>
  );
}

// STYLES OBJECT
const styles: Record<string, React.CSSProperties> = {
  pageContainer: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    width: "100vw",
    overflow: "hidden",
    userSelect: "none",
    background: "var(--background)",
    color: "var(--foreground)",
  },
  header: {
    height: "56px",
    borderBottom: "1px solid var(--secondary-accent)",
    backgroundColor: "rgba(70, 12, 0, 0.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: "16px",
    paddingRight: "16px",
  },
  flexCenterGap3: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  flexCenterGap2: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  playButton: {
    padding: "8px",
    borderRadius: "50%",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--primary)",
    color: "var(--foreground)",
  },
  iconButton: {
    padding: "8px",
    borderRadius: "50%",
    border: "none",
    background: "transparent",
    color: "var(--foreground)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    height: "20px",
    width: "1px",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    margin: "0 8px",
  },
  bpmContainer: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "12px",
    fontFamily: "monospace",
  },
  bpmInput: {
    width: "56px",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "4px",
    padding: "4px 6px",
    textAlign: "center",
    fontWeight: "bold",
    color: "var(--foreground)",
  },
  presenceBadge: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    padding: "4px 10px",
    borderRadius: "9999px",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  avatar: {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    border: "2px solid #000",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    fontWeight: "bold",
  },
  workspace: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  tracksSection: {
    height: "40%",
    borderBottom: "1px solid var(--secondary-accent)",
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
  },
  trackRow: {
    display: "flex",
    height: "80px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
  trackSidePanel: {
    width: "192px",
    padding: "12px",
    borderRight: "1px solid var(--secondary-accent)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  trackControls: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "10px",
    opacity: 0.6,
  },
  slider: {
    width: "64px",
    height: "4px",
    accentColor: "var(--primary)",
  },
  timelineLane: {
    flex: 1,
    position: "relative",
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    display: "flex",
    alignItems: "center",
  },
  midiClip: {
    position: "absolute",
    height: "48px",
    width: "30%",
    borderRadius: "4px",
    border: "1px solid var(--accent)",
    padding: "8px",
    fontSize: "12px",
    display: "flex",
    alignItems: "center",
    color: "var(--foreground)",
  },
  addTrackButton: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px",
    fontSize: "12px",
    fontWeight: "bold",
    opacity: 0.7,
    background: "none",
    border: "none",
    color: "inherit",
    cursor: "pointer",
  },
  pianoRollSection: {
    flex: 1,
    display: "flex",
    overflow: "hidden",
  },
  pianoKeysColumn: {
    width: "96px",
    borderRight: "1px solid var(--secondary-accent)",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  pianoKey: {
    flex: 1,
    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingRight: "8px",
    fontSize: "10px",
    fontFamily: "monospace",
    opacity: 0.6,
  },
  gridCanvas: {
    flex: 1,
    position: "relative",
    overflowX: "auto",
    display: "flex",
    flexDirection: "column",
  },
  gridRow: {
    flex: 1,
    display: "flex",
    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
    position: "relative",
  },
  gridCell: {
    flex: 1,
    borderRight: "1px solid rgba(255, 255, 255, 0.05)",
  },
  noteBlock: {
    position: "absolute",
    borderRadius: "4px",
    display: "flex",
    alignItems: "center",
    paddingLeft: "4px",
    paddingRight: "4px",
    fontSize: "9px",
    fontWeight: "bold",
    color: "var(--foreground)",
    transition: "box-shadow 0.1s",
  },
  userTag: {
    fontSize: "8px",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    padding: "0 4px",
    borderRadius: "2px",
    marginRight: "4px",
  },
};