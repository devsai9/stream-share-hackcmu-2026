"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	broadcastTrackAdded,
	broadcastTrackDeleted,
	broadcastTrackRenamed,
	joinProjectChannel,
	leaveChannel,
} from "../lib/broadcast";
import type { Track } from "../lib/editor";
import type { NoteBlock, PeerPresence } from "../types/music";

const NOTES_EVENT = "notes-updated";
const CURSOR_EVENT = "cursor-moved";

export interface UseRealTimeSyncOptions {
	roomId: string;
	user: PeerPresence;
	onNotesUpdated?: (notes: NoteBlock[]) => void;
	onCursorMoved?: (presence: PeerPresence) => void;
	onTrackAdded?: (payload: unknown) => void;
	onTrackDeleted?: (payload: unknown) => void;
	onTrackRenamed?: (payload: unknown) => void;
}

export interface UseRealTimeSyncReturn {
	peers: PeerPresence[];
	isConnected: boolean;
	broadcastNotes: (notes: NoteBlock[]) => Promise<void>;
	broadcastCursor: (cursorStep: number | undefined) => Promise<void>;
	broadcastTrackAdded: (track: Track) => Promise<void>;
	broadcastTrackDeleted: (trackId: string) => Promise<void>;
	broadcastTrackRenamed: (track: Track) => Promise<void>;
}

/** Syncs ephemeral editor state through one Supabase Realtime channel per room. */
export function useRealTimeSync({
	roomId,
	user,
	onNotesUpdated,
	onCursorMoved,
	onTrackAdded,
	onTrackDeleted,
	onTrackRenamed,
}: UseRealTimeSyncOptions): UseRealTimeSyncReturn {
	const [peers, setPeers] = useState<PeerPresence[]>([]);
	const [isConnected, setIsConnected] = useState(false);
	const channelRef = useRef<Awaited<ReturnType<typeof joinProjectChannel>> | null>(null);
	const callbacksRef = useRef({ onNotesUpdated, onCursorMoved, onTrackAdded, onTrackDeleted, onTrackRenamed });

	useEffect(() => {
		callbacksRef.current = { onNotesUpdated, onCursorMoved, onTrackAdded, onTrackDeleted, onTrackRenamed };
	}, [onNotesUpdated, onCursorMoved, onTrackAdded, onTrackDeleted, onTrackRenamed]);

	useEffect(() => {
		if (!roomId || !user.userId) return;

		let cancelled = false;
		void joinProjectChannel(roomId, {
			onNotesUpdated: (event) => {
				const payload = event as { payload?: { senderId?: string; notes?: unknown } };
				const eventPayload = payload.payload;
				if (eventPayload?.senderId !== user.userId && Array.isArray(eventPayload?.notes)) {
					callbacksRef.current.onNotesUpdated?.(eventPayload.notes as NoteBlock[]);
				}
			},
			onCursorMoved: (event) => {
				const payload = event as { payload?: { senderId?: string; presence?: PeerPresence } };
				const eventPayload = payload.payload;
				if (eventPayload?.senderId !== user.userId && eventPayload?.presence) {
					callbacksRef.current.onCursorMoved?.(eventPayload.presence);
				}
			},
			onTrackAdded: (event) => callbacksRef.current.onTrackAdded?.(event),
			onTrackDeleted: (event) => callbacksRef.current.onTrackDeleted?.(event),
			onTrackRenamed: (event) => callbacksRef.current.onTrackRenamed?.(event),
			onPresenceUpdated: (presences) => {
				setPeers(presences.filter((presence) => presence.userId !== user.userId));
			},
		}, { key: user.userId, value: user }).then((channel) => {
			if (cancelled) {
				void leaveChannel(channel);
				return;
			}
			channelRef.current = channel;
			setIsConnected(true);
		}).catch(() => {
			if (!cancelled) setIsConnected(false);
		});

		return () => {
			cancelled = true;
			const channel = channelRef.current;
			channelRef.current = null;
			setIsConnected(false);
			setPeers([]);
			if (channel) void leaveChannel(channel);
		};
	}, [roomId, user]);

	const broadcastNotes = useCallback(async (notes: NoteBlock[]) => {
		const channel = channelRef.current;
		if (!channel || !isConnected) return;

		await channel.send({
			type: "broadcast",
			event: NOTES_EVENT,
			payload: { senderId: user.userId, notes },
		});
	}, [isConnected, user.userId]);

	const broadcastCursor = useCallback(async (cursorStep: number | undefined) => {
		const channel = channelRef.current;
		if (!channel || !isConnected) return;

		const presence = { ...user, cursorStep };
		await channel.track(presence);
		await channel.send({
			type: "broadcast",
			event: CURSOR_EVENT,
			payload: { senderId: user.userId, presence },
		});
	}, [isConnected, user]);

	const sendTrackAdded = useCallback(async (track: Track) => {
		if (channelRef.current && isConnected) {
			await broadcastTrackAdded(channelRef.current, user.userId, track);
		}
	}, [isConnected, user.userId]);

	const sendTrackDeleted = useCallback(async (trackId: string) => {
		if (channelRef.current && isConnected) {
			await broadcastTrackDeleted(channelRef.current, user.userId, trackId);
		}
	}, [isConnected, user.userId]);

	const sendTrackRenamed = useCallback(async (track: Track) => {
		if (channelRef.current && isConnected) {
			await broadcastTrackRenamed(channelRef.current, user.userId, track);
		}
	}, [isConnected, user.userId]);

	return {
		peers,
		isConnected,
		broadcastNotes,
		broadcastCursor,
		broadcastTrackAdded: sendTrackAdded,
		broadcastTrackDeleted: sendTrackDeleted,
		broadcastTrackRenamed: sendTrackRenamed,
	};
}
