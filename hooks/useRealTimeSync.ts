"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase/client";
import type { MidiBlock, Track } from "../lib/editor";
import type { NoteBlock, PeerPresence } from "../types/music";

const NOTES_EVENT = "notes-updated";
const CURSOR_EVENT = "cursor-moved";
const TRACK_ADDED_EVENT = "track-added";
const TRACK_RENAMED_EVENT = "track-renamed";
const TRACK_DELETED_EVENT = "track-deleted";
const BLOCK_ADDED_EVENT = "block-added";
const BLOCK_DELETED_EVENT = "block-deleted";
const BLOCK_MOVED_EVENT = "block-moved";
const PRESENCE_COLORS = [
	"#e76f51",
	"#2a9d8f",
	"#457b9d",
	"#e9c46a",
	"#8ab17d",
	"#b56576",
	"#118ab2",
	"#f4a261",
	"#6d597a",
	"#43aa8b",
	"#ef476f",
	"#577590",
];

function getPreferredColor(userId: string): string {
	let hash = 0;
	for (const character of userId) {
		hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
	}
	return PRESENCE_COLORS[hash % PRESENCE_COLORS.length];
}

function assignPresenceColor(user: PeerPresence, existingPresences: PeerPresence[]): PeerPresence {
	const usedColors = new Set(existingPresences.map((presence) => presence.color));
	const preferredColor = getPreferredColor(user.userId);
	const preferredIndex = PRESENCE_COLORS.indexOf(preferredColor);

	for (let offset = 0; offset < PRESENCE_COLORS.length; offset += 1) {
		const color = PRESENCE_COLORS[(preferredIndex + offset) % PRESENCE_COLORS.length];
		if (!usedColors.has(color)) {
			return { ...user, color };
		}
	}

	return { ...user, color: preferredColor };
}

export interface TrackAddedPayload {
	track: Track;
	block: MidiBlock;
}

export interface BlockDeletedPayload {
	blockId: string;
	trackId: string;
}

export interface UseRealTimeSyncOptions {
	roomId: string;
	user: PeerPresence;
	onNotesUpdated?: (notes: NoteBlock[]) => void;
	onCursorMoved?: (presence: PeerPresence) => void;
	onTrackAdded?: (payload: TrackAddedPayload) => void;
	onTrackRenamed?: (track: Track) => void;
	onTrackDeleted?: (trackId: string) => void;
	onBlockAdded?: (block: MidiBlock) => void;
	onBlockDeleted?: (payload: BlockDeletedPayload) => void;
	onBlockMoved?: (block: MidiBlock) => void;
}

export interface UseRealTimeSyncReturn {
	peers: PeerPresence[];
	localPresence: PeerPresence;
	isConnected: boolean;
	broadcastNotes: (notes: NoteBlock[], mover?: PeerPresence, movingNoteId?: string) => Promise<void>;
	broadcastCursor: (cursorStep: number | undefined) => Promise<void>;
	broadcastTrackAdded: (payload: TrackAddedPayload) => Promise<void>;
	broadcastTrackRenamed: (track: Track) => Promise<void>;
	broadcastTrackDeleted: (trackId: string) => Promise<void>;
	broadcastBlockAdded: (block: MidiBlock) => Promise<void>;
	broadcastBlockDeleted: (payload: BlockDeletedPayload) => Promise<void>;
	broadcastBlockMoved: (block: MidiBlock) => Promise<void>;
}

/** Syncs ephemeral editor state through one Supabase Realtime channel per room. */
export function useRealTimeSync({
	roomId,
	user,
	onNotesUpdated,
	onCursorMoved,
	onTrackAdded,
	onTrackRenamed,
	onTrackDeleted,
	onBlockAdded,
	onBlockDeleted,
	onBlockMoved,
}: UseRealTimeSyncOptions): UseRealTimeSyncReturn {
	const [peers, setPeers] = useState<PeerPresence[]>([]);
	const [isConnected, setIsConnected] = useState(false);
	const [localPresence, setLocalPresence] = useState(user);
	const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
	const callbacksRef = useRef({
		onNotesUpdated,
		onCursorMoved,
		onTrackAdded,
		onTrackRenamed,
		onTrackDeleted,
		onBlockAdded,
		onBlockDeleted,
		onBlockMoved,
	});

	useEffect(() => {
		callbacksRef.current = {
			onNotesUpdated,
			onCursorMoved,
			onTrackAdded,
			onTrackRenamed,
			onTrackDeleted,
			onBlockAdded,
			onBlockDeleted,
			onBlockMoved,
		};
	}, [onNotesUpdated, onCursorMoved, onTrackAdded, onTrackRenamed, onTrackDeleted, onBlockAdded, onBlockDeleted, onBlockMoved]);

	useEffect(() => {
		if (!roomId || !user.userId) return;

		const channel = supabase.channel(`room:${roomId}`, {
			config: { presence: { key: user.userId } },
		});
		channelRef.current = channel;

		const updatePeers = () => {
			const state = channel.presenceState<PeerPresence>();
			const nextPeers = Object.values(state)
				.flat()
				.filter((presence) => presence.userId !== user.userId);
			setPeers(nextPeers);
		};

		channel
			.on("presence", { event: "sync" }, updatePeers)
			.on("presence", { event: "join" }, updatePeers)
			.on("presence", { event: "leave" }, updatePeers)
			.on("broadcast", { event: NOTES_EVENT }, ({ payload }) => {
				if (
					payload?.senderId !== user.userId &&
					Array.isArray(payload?.notes)
				) {
					callbacksRef.current.onNotesUpdated?.(payload.notes as NoteBlock[]);
				}
			})
			.on("broadcast", { event: CURSOR_EVENT }, ({ payload }) => {
				if (payload?.senderId !== user.userId && payload?.presence) {
					callbacksRef.current.onCursorMoved?.(payload.presence as PeerPresence);
				}
			})
			.on("broadcast", { event: TRACK_ADDED_EVENT }, ({ payload }) => {
				if (
					payload?.senderId !== user.userId &&
					payload?.track &&
					payload?.block
				) {
					callbacksRef.current.onTrackAdded?.({
						track: payload.track as Track,
						block: payload.block as MidiBlock,
					});
				}
			})
			.on("broadcast", { event: TRACK_RENAMED_EVENT }, ({ payload }) => {
				if (payload?.senderId !== user.userId && payload?.track) {
					callbacksRef.current.onTrackRenamed?.(payload.track as Track);
				}
			})
			.on("broadcast", { event: TRACK_DELETED_EVENT }, ({ payload }) => {
				if (payload?.senderId !== user.userId && typeof payload?.trackId === "string") {
					callbacksRef.current.onTrackDeleted?.(payload.trackId);
				}
			})
			.on("broadcast", { event: BLOCK_ADDED_EVENT }, ({ payload }) => {
				if (payload?.senderId !== user.userId && payload?.block) {
					callbacksRef.current.onBlockAdded?.(payload.block as MidiBlock);
				}
			})
			.on("broadcast", { event: BLOCK_DELETED_EVENT }, ({ payload }) => {
				if (
					payload?.senderId !== user.userId &&
					typeof payload?.blockId === "string" &&
					typeof payload?.trackId === "string"
				) {
					callbacksRef.current.onBlockDeleted?.({
						blockId: payload.blockId,
						trackId: payload.trackId,
					});
				}
			})
			.on("broadcast", { event: BLOCK_MOVED_EVENT }, ({ payload }) => {
				if (payload?.senderId !== user.userId && payload?.block) {
					callbacksRef.current.onBlockMoved?.(payload.block as MidiBlock);
				}
			})
			.subscribe(async (status) => {
				if (status === "SUBSCRIBED") {
						const existingPresences = Object.values(channel.presenceState<PeerPresence>()).flat();
						const assignedPresence = assignPresenceColor(user, existingPresences);
						setLocalPresence(assignedPresence);
						await channel.track(assignedPresence);
					setIsConnected(true);
				} else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
					setIsConnected(false);
				}
			});

		return () => {
			channelRef.current = null;
			setIsConnected(false);
			setPeers([]);
			setLocalPresence(user);
			void supabase.removeChannel(channel);
		};
	}, [roomId, user]);

	const broadcastNotes = useCallback(async (
		notes: NoteBlock[],
		mover?: PeerPresence,
		movingNoteId?: string,
	) => {
		const channel = channelRef.current;
		if (!channel || !isConnected) return;

		const notesToBroadcast = mover && movingNoteId
			? notes.map((note) => note.id === movingNoteId && note.isDragging
				? {
					...note,
					movingUserId: mover.userId,
					movingUserEmail: mover.userName,
					movingUserColor: mover.color,
				}
				: note)
			: notes;

		await channel.send({
			type: "broadcast",
			event: NOTES_EVENT,
			payload: { senderId: user.userId, notes: notesToBroadcast },
		});
	}, [isConnected, user.userId]);

	const broadcastCursor = useCallback(async (cursorStep: number | undefined) => {
		const channel = channelRef.current;
		if (!channel || !isConnected) return;

		const presence = { ...localPresence, cursorStep };
		await channel.track(presence);
		await channel.send({
			type: "broadcast",
			event: CURSOR_EVENT,
			payload: { senderId: user.userId, presence },
		});
	}, [isConnected, localPresence, user.userId]);

	const broadcastTrackAdded = useCallback(async (payload: TrackAddedPayload) => {
		const channel = channelRef.current;
		if (!channel || !isConnected) return;

		await channel.send({
			type: "broadcast",
			event: TRACK_ADDED_EVENT,
			payload: { senderId: user.userId, ...payload },
		});
	}, [isConnected, user.userId]);

	const broadcastTrackRenamed = useCallback(async (track: Track) => {
		const channel = channelRef.current;
		if (!channel || !isConnected) return;

		await channel.send({
			type: "broadcast",
			event: TRACK_RENAMED_EVENT,
			payload: { senderId: user.userId, track },
		});
	}, [isConnected, user.userId]);

	const broadcastTrackDeleted = useCallback(async (trackId: string) => {
		const channel = channelRef.current;
		if (!channel || !isConnected) return;

		await channel.send({
			type: "broadcast",
			event: TRACK_DELETED_EVENT,
			payload: { senderId: user.userId, trackId },
		});
	}, [isConnected, user.userId]);

	const broadcastBlockAdded = useCallback(async (block: MidiBlock) => {
		const channel = channelRef.current;
		if (!channel || !isConnected) return;

		await channel.send({
			type: "broadcast",
			event: BLOCK_ADDED_EVENT,
			payload: { senderId: user.userId, block },
		});
	}, [isConnected, user.userId]);

	const broadcastBlockDeleted = useCallback(async (payload: BlockDeletedPayload) => {
		const channel = channelRef.current;
		if (!channel || !isConnected) return;

		await channel.send({
			type: "broadcast",
			event: BLOCK_DELETED_EVENT,
			payload: { senderId: user.userId, ...payload },
		});
	}, [isConnected, user.userId]);

	const broadcastBlockMoved = useCallback(async (block: MidiBlock) => {
		const channel = channelRef.current;
		if (!channel || !isConnected) return;

		await channel.send({
			type: "broadcast",
			event: BLOCK_MOVED_EVENT,
			payload: { senderId: user.userId, block },
		});
	}, [isConnected, user.userId]);

	return {
		peers,
		localPresence,
		isConnected,
		broadcastNotes,
		broadcastCursor,
		broadcastTrackAdded,
		broadcastTrackRenamed,
		broadcastTrackDeleted,
		broadcastBlockAdded,
		broadcastBlockDeleted,
		broadcastBlockMoved,
	};
}
