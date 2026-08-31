/** Same readable alphabet as invite codes (no visually ambiguous characters),
 * but generated and checked separately so a room's password never collides
 * with another currently-active PRIVATE room's password — see
 * `RoomsService.create`. */
const ROOM_PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_PASSWORD_LENGTH = 6;

export function generateRoomPassword(): string {
  let password = '';
  for (let i = 0; i < ROOM_PASSWORD_LENGTH; i++) {
    password +=
      ROOM_PASSWORD_ALPHABET[
        Math.floor(Math.random() * ROOM_PASSWORD_ALPHABET.length)
      ];
  }
  return password;
}
