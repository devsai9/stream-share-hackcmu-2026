"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	broadcastNoteAdded,
	broadcastNoteRemoved,
	broadcastTrackAdded,
	broadcastTrackDeleted,
	joinProjectChannel,
	leaveChannel,
	type NoteAddedPayload,
	type NoteRemovedPayload,
	type TrackAddedPayload,
	type TrackDeletedPayload,
} from "../lib/broadcast";
import type { Track } from "../lib/editor";
import type { NoteBlock, PeerPresence } from "../types/music";

export interface UseRealTimeSyncOptions {
	roomId: string;
	user: PeerPresence;
	onTrackAdded?: (track: Track) => void;
	onTrackDeleted?: (trackId: string) => void;
	onNoteAdded?: (trackId: string, note: NoteBlock) => void;
	onNoteRemoved?: (trackId: string, noteId: string) => void;
}

export interface UseRealTimeSyncReturn {
	peers: PeerPresence[];
	isConnected: boolean;
	broadcastTrackAdded: (track: Track) => Promise<void>;
	broadcastTrackDeleted: (trackId: string) => Promise<void>;
	broadcastNoteAdded: (trackId: string, note: NoteBlock) => Promise<void>;
	broadcastNoteRemoved: (trackId: string, noteId: string) => Promise<void>;
}

/** Syncs project editing events through one Supabase Realtime channel per project. */
export function useRealTimeSync({
	roomId,
	user,
	onTrackAdded,
	onTrackDeleted,
	onNoteAdded,
	onNoteRemoved,
}: UseRealTimeSyncOptions): UseRealTimeSyncReturn {
	const [peers, setPeers] = useState<PeerPresence[]>([]);
	const [isConnected, setIsConnected] = useState(false);
	const channelRef = useRef<Awaited<ReturnType<typeof joinProjectChannel>> | null>(null);
	const callbacksRef = useRef({ onTrackAdded, onTrackDeleted, onNoteAdded, onNoteRemoved });

	useEffect(() => {
		callbacksRef.current = { onTrackAdded, onTrackDeleted, onNoteAdded, onNoteRemoved };
	}, [onTrackAdded, onTrackDeleted, onNoteAdded, onNoteRemoved]);

	useEffect(() => {
		if (!roomId || !user.userId) return;

		let cancelled = false;

		void joinProjectChannel(roomId, {
			onTrackAdded: (payload) => {
				const event = payload as { payload?: TrackAddedPayload };
				const eventPayload = event.payload;
				if (eventPayload?.senderId !== user.userId && eventPayload?.track) {
					callbacksRef.current.onTrackAdded?.(eventPayload.track);
				}
			},
			onTrackDeleted: (payload) => {
				const event = payload as { payload?: TrackDeletedPayload };
				const eventPayload = event.payload;
				if (eventPayload?.senderId !== user.userId && eventPayload?.trackId) {
					callbacksRef.current.onTrackDeleted?.(eventPayload.trackId);
				}
			},
			onNoteAdded: (payload) => {
				const event = payload as { payload?: NoteAddedPayload };
				const eventPayload = event.payload;
				if (eventPayload?.senderId !== user.userId && eventPayload?.note) {
					callbacksRef.current.onNoteAdded?.(eventPayload.trackId, eventPayload.note);
				}
			},
			onNoteRemoved: (payload) => {
				const event = payload as { payload?: NoteRemovedPayload };
				const eventPayload = event.payload;
				if (eventPayload?.senderId !== user.userId && eventPayload?.noteId) {
					callbacksRef.current.onNoteRemoved?.(eventPayload.trackId, eventPayload.noteId);
				}
			},
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

	const broadcastTrackAddedEvent = useCallback(async (track: Track) => {
		if (channelRef.current && isConnected) {
			await broadcastTrackAdded(channelRef.current, user.userId, track);
		}
	}, [isConnected, user.userId]);

	const broadcastTrackDeletedEvent = useCallback(async (trackId: string) => {
		if (channelRef.current && isConnected) {
			await broadcastTrackDeleted(channelRef.current, user.userId, trackId);
		}
	}, [isConnected, user.userId]);

	const broadcastNoteAddedEvent = useCallback(async (trackId: string, note: NoteBlock) => {
		if (channelRef.current && isConnected) {
			await broadcastNoteAdded(channelRef.current, user.userId, trackId, note);
		}
	}, [isConnected, user.userId]);

	const broadcastNoteRemovedEvent = useCallback(async (trackId: string, noteId: string) => {
		if (channelRef.current && isConnected) {
			await broadcastNoteRemoved(channelRef.current, user.userId, trackId, noteId);
		}
	}, [isConnected, user.userId]);

	return {
		peers,
		isConnected,
		broadcastTrackAdded: broadcastTrackAddedEvent,
		broadcastTrackDeleted: broadcastTrackDeletedEvent,
		broadcastNoteAdded: broadcastNoteAddedEvent,
		broadcastNoteRemoved: broadcastNoteRemovedEvent,
	};
}
