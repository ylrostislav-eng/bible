'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useActiveGame } from '@/lib/active-game-context';
import { useIncomingChallenges } from '@/lib/incoming-challenges-context';
import { useIncomingRoomInvites } from '@/lib/incoming-room-invites-context';
import { ChallengePopup } from './incoming-challenge-modal';
import { InvitePopup } from './incoming-room-invite-modal';

/**
 * Single owner of the full-screen "someone wants to play with you" prompts.
 *
 * A duel challenge and a room invite are both `fixed inset-0` overlays, so
 * when they used to mount independently and both had something to show, the
 * one rendered later simply covered the other — you could answer the room
 * invite without ever learning a duel challenge had arrived. Here exactly
 * one popup is on screen at a time, the other waits its turn, and the
 * visible one says that something else is queued behind it so dismissing it
 * doesn't feel like the end of the line.
 *
 * A duel challenge goes first when both are waiting: it's a direct 1v1
 * summons from one specific person, where a room invite is an open seat that
 * keeps just as well for the few seconds it takes to answer the duel.
 *
 * Dismissals ("Позже") are tracked here rather than inside each popup so
 * that deferring one genuinely hands the screen to the other — with the
 * state living in the popups, a deferred challenge still counted as
 * "showing" and kept the room invite hidden behind it forever.
 */
export function IncomingNotifications() {
  const pathname = usePathname();
  const { activeGame } = useActiveGame();
  const { challenges } = useIncomingChallenges();
  const { invites } = useIncomingRoomInvites();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const dismiss = (id: string) =>
    setDismissedIds((ids) => {
      const next = new Set(ids);
      next.add(id);
      return next;
    });

  // Mid-game is the one time nothing may interrupt. Each screen also
  // suppresses its own kind of prompt, since it already lists them inline.
  if (activeGame?.status === 'IN_PROGRESS') return null;

  const challenge =
    pathname === '/play/duel' ? undefined : challenges.find((c) => !dismissedIds.has(c.sessionId));
  const invite =
    pathname === '/play/room' ? undefined : invites.find((i) => !dismissedIds.has(i.inviteId));

  if (challenge) {
    return (
      <ChallengePopup
        key={challenge.sessionId}
        challenge={challenge}
        onDismiss={() => dismiss(challenge.sessionId)}
        queuedNote={invite ? 'Вас также зовут в комнату — покажем следующим' : undefined}
      />
    );
  }

  if (invite) {
    return (
      <InvitePopup
        key={invite.inviteId}
        invite={invite}
        onDismiss={() => dismiss(invite.inviteId)}
      />
    );
  }

  return null;
}
