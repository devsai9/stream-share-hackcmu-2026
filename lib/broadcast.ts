import { supabase } from './supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Track } from './editor'
import type { NoteBlock, PeerPresence } from '../types/music'

export type TrackAddedPayload = {
  senderId: string
  track: Track
}

export type TrackDeletedPayload = {
  senderId: string
  trackId: string
}

export type NoteAddedPayload = {
  senderId: string
  trackId: string
  note: NoteBlock
}

export type NoteRemovedPayload = {
  senderId: string
  trackId: string
  noteId: string
}

export async function joinProjectChannel(
  projectId: string,
  handlers: {
    onTrackAdded?: (payload: unknown) => void
    onTrackDeleted?: (payload: unknown) => void
    onNoteAdded?: (payload: unknown) => void
    onNoteRemoved?: (payload: unknown) => void
    onPresenceUpdated?: (presences: PeerPresence[]) => void
  },
  presence?: { key: string; value: PeerPresence },
): Promise<RealtimeChannel> {
  const channel = supabase.channel(
    `project:${projectId}:editor`,
    {
      config: {
        private: true,
        ...(presence ? { presence: { key: presence.key } } : {}),
      },
    }
  )

  const updatePresence = () => {
    const state = channel.presenceState<PeerPresence>()
    handlers.onPresenceUpdated?.(Object.values(state).flat())
  }

  channel
    .on('presence', { event: 'sync' }, updatePresence)
    .on('presence', { event: 'join' }, updatePresence)
    .on('presence', { event: 'leave' }, updatePresence)
    .on('broadcast', { event: 'track_added' }, (payload) => {
      handlers.onTrackAdded?.(payload)
    })
    .on('broadcast', { event: 'track_deleted' }, (payload) => {
      handlers.onTrackDeleted?.(payload)
    })
    .on('broadcast', { event: 'note_added' }, (payload) => {
      handlers.onNoteAdded?.(payload)
    })
    .on('broadcast', { event: 'note_removed' }, (payload) => {
      handlers.onNoteRemoved?.(payload)
    })

  await supabase.realtime.setAuth()

  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        if (presence) {
          void channel.track(presence.value).then(() => resolve())
        } else {
          resolve()
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(error ?? new Error(`Channel status: ${status}`))
      }
    })
  })

  return channel
}

export function leaveChannel(channel: RealtimeChannel) {
  return supabase.removeChannel(channel)
}

async function broadcast(channel: RealtimeChannel, event: string, payload: unknown) {
  await channel.send({ type: 'broadcast', event, payload })
}

export function broadcastTrackAdded(
  channel: RealtimeChannel,
  senderId: string,
  track: Track,
) {
  return broadcast(channel, 'track_added', { senderId, track } satisfies TrackAddedPayload)
}

export function broadcastTrackDeleted(
  channel: RealtimeChannel,
  senderId: string,
  trackId: string,
) {
  return broadcast(channel, 'track_deleted', { senderId, trackId } satisfies TrackDeletedPayload)
}

export function broadcastNoteAdded(
  channel: RealtimeChannel,
  senderId: string,
  trackId: string,
  note: NoteBlock,
) {
  return broadcast(channel, 'note_added', { senderId, trackId, note } satisfies NoteAddedPayload)
}

export function broadcastNoteRemoved(
  channel: RealtimeChannel,
  senderId: string,
  trackId: string,
  noteId: string,
) {
  return broadcast(channel, 'note_removed', { senderId, trackId, noteId } satisfies NoteRemovedPayload)
}