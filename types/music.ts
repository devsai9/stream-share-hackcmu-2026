export interface NoteBlock {
  id: string;
  pitch: string;      // e.g. "C4"
  startStep: number;  // Grid column index
  duration: number;   // Length in grid steps
  userId?: string;
  isDragging?: boolean;
}

export interface CursorPosition {
  x: number;
  y: number;
}

export interface PeerPresence {
  userId: string;
  userName: string;
  email?: string;
  color: string;
  cursor?: CursorPosition;
}