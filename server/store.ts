import type { RoomRecord } from './types.js';

export interface RoomStore {
  get(code: string): RoomRecord | undefined;
  set(room: RoomRecord): void;
  delete(code: string): void;
  values(): IterableIterator<RoomRecord>;
}

export class MemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, RoomRecord>();

  get(code: string): RoomRecord | undefined {
    return this.rooms.get(code);
  }

  set(room: RoomRecord): void {
    this.rooms.set(room.code, room);
  }

  delete(code: string): void {
    this.rooms.delete(code);
  }

  values(): IterableIterator<RoomRecord> {
    return this.rooms.values();
  }
}
