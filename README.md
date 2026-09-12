# StreamShare
StreamShare is a collaborative MIDI editor, inspired from Bandlab and Google Docs-like live editing.

## Tech Stack:
- Next.js
- TypeScript
- NO TailwindCSS
- /app, no /src
- Supabase (Database, Realtime, Authentication)

## Context:
This is a hackathon project idea for a real time collaborative music maker, which I've struggled to find for free in the past. There's no collaborative music platform that actually supports real time editing in a way similar to google docs, so I thought that would be a really cool idea to implement.

## Focus Areas:
Create music
Collaboration
Storing music
User Interface

## Other Features:
AI Music Generator
AI Music Harmonizer

## Flow Diagram for Implementation:
Technical Implementation
[ Physical MIDI Keyboard ] (Optional)
           │
           ▼ (Web MIDI API)
[ Next.js UI / Tone.js Engine ] ◄──── (Broadcast Note Events) ────► [ Supabase Realtime ]
           │                                                                  │
           ▼ (Save Track State)                                               ▼
[ Supabase Postgres Database ]                                  [ Room Peer Browsers ]