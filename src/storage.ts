const NICKNAME_KEY = '数字牌局:nickname';

export function getSavedNickname(): string {
  return localStorage.getItem(NICKNAME_KEY) ?? '';
}

export function saveNickname(nickname: string): void {
  localStorage.setItem(NICKNAME_KEY, nickname);
}

export function getRoomToken(code: string): string {
  return localStorage.getItem(`数字牌局:room:${code}:token`) ?? '';
}

export function saveRoomToken(code: string, token: string): void {
  localStorage.setItem(`数字牌局:room:${code}:token`, token);
}
