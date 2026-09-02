/**
 * A one-shot "your invite was declined" notice, delivered to the person who
 * sent a duel challenge or room invite that got turned down. Declining used
 * to just make the invite quietly disappear for the sender with no way to
 * find out — this is what surfaces it, as a brief toast rather than a
 * blocking popup, since there's nothing left to decide.
 */
export interface DeclineNoticeView {
  id: string;
  kind: 'DUEL_CHALLENGE' | 'ROOM_INVITE';
  declinedByNickname: string | null;
  /** Only set for a ROOM_INVITE notice. */
  roomName: string | null;
}
