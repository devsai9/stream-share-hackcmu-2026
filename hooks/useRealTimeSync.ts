"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase/client";
import type { MidiBlock, Track } from "../lib/editor";
import type { NoteBlock, PeerPresence } from "../types/music";

const NOTES_EVENT = "notes-updated";
const CURSOR_EVENT = "cursor-moved";
const TRACK_ADDED_EVENT = "track-added";

export interface TrackAddedPayload {
	track: Track;
	block: MidiBlock;
}

export interface UseRealTimeSyncOptions {
	roomId: string;
	user: PeerPresence;
	onNotesUpdated?: (notes: NoteBlock[]) => void;
	onCursorMoved?: (presence: PeerPresence) => void;
	onTrackAdded?: (payload: TrackAddedPayload) => void;
}

export interface UseRealTimeSyncReturn {
	peers: PeerPresence[];
	isConnected: boolean;
	broadcastNotes: (notes: NoteBlock[]) => Promise<void>;
	broadcastCursor: (cursorStep: number | undefined) => Promise<void>;
	broadcastTrackAdded: (payload: TrackAddedPayload) => Promise<void>;
}

/** Syncs ephemeral editor state through one Supabase Realtime channel per room. */
export function useRealTimeSync({
	roomId,
	user,
	onNotesUpdated,
	onCursorMoved,
	onTrackAdded,
}: UseRealTimeSyncOptions): UseRealTimeSyncReturn {
	const [peers, setPeers] = useState<PeerPresence[]>([]);
	const [isConnected, setIsConnected] = useState(false);
	const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
	const callbacksRef = useRef({ onNotesUpdated, onCursorMoved, onTrackAdded });

	useEffect(() => {
		callbacksRef.current = { onNotesUpdated, onCursorMoved, onTrackAdded };
	}, [onNotesUpdated, onCursorMoved, onTrackAdded]);

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
				if (payload?.senderId !== user.userId && Array.isArray(payload?.notes)) {
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
			.subscribe(async (status) => {
				if (status === "SUBSCRIBED") {
					await channel.track(user);
					setIsConnected(true);
				} else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
					setIsConnected(false);
				}
			});

		return () => {
			channelRef.current = null;
			setIsConnected(false);
			setPeers([]);
			void supabase.removeChannel(channel);
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

	const broadcastTrackAdded = useCallback(async (payload: TrackAddedPayload) => {
		const channel = channelRef.current;
		if (!channel || !isConnected) return;

		await channel.send({
			type: "broadcast",
			event: TRACK_ADDED_EVENT,
			payload: { senderId: user.userId, ...payload },
		});
	}, [isConnected, user.userId]);

	return { peers, isConnected, broadcastNotes, broadcastCursor, broadcastTrackAdded };
}
