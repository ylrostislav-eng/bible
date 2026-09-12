'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useActiveGame } from '@/lib/active-game-context';
import { useIncomingChallenges } from '@/lib/incoming-challenges-context';
import { useIncomingDiceChallenges } from '@/lib/incoming-dice-challenges-context';
import { useIncomingRoomInvites } from '@/lib/incoming-room-invites-context';
import { DiceChallengePopup } from './incoming-dice-challenge-modal';
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
 * A duel challenge goes first when several are waiting, then a dice
 * challenge, then a room invite: duel and dice are both a direct 1-on-1
 * summons from one specific person, where a room invite is an open seat that
 * keeps just as well for the few seconds it takes to answer the other one.
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
  const { challenges: diceChallenges } = useIncomingDiceChallenges();
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
  // Не глушится по `pathname === '/play/dice'`, в отличие от дуэли и
  // комнаты: там весь экран — один режим, и список входящих виден всегда.
  // «Кости» — один адрес на несколько подэкранов (меню, приглашение, стол,
  // итог партии), список приглашений инлайн виден только на одном из них
  // («Кого пригласить?»), а на экране итога партии не виден вовсе.
  // Подавление по адресу тогда прятало новый вызов совсем — ни попапа, ни
  // списка. _Нашлось живой проверкой: приглашение, отправленное игроку,
  // который остался смотреть на «Победа» после прошлой партии, не
  // появлялось нигде, пока он не уходил в меню руками._
  const diceChallenge = diceChallenges.find((c) => !dismissedIds.has(c.matchId));
  const invite =
    pathname === '/play/room' ? undefined : invites.find((i) => !dismissedIds.has(i.inviteId));

  if (challenge) {
    return (
      <ChallengePopup
        key={challenge.sessionId}
        challenge={challenge}
        onDismiss={() => dismiss(challenge.sessionId)}
        queuedNote={
          diceChallenge
            ? 'Вас также зовут в кости — покажем следующим'
            : invite
              ? 'Вас также зовут в комнату — покажем следующим'
              : undefined
        }
      />
    );
  }

  if (diceChallenge) {
    return (
      <DiceChallengePopup
        key={diceChallenge.matchId}
        challenge={diceChallenge}
        onDismiss={() => dismiss(diceChallenge.matchId)}
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
