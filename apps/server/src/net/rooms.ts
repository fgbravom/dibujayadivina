// Registro de salas: código único, tope de salas simultáneas y el estado de red de cada una.

import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@dya/shared';
import type { GameState } from '../game/index.js';
import { StrokeHistory } from './strokes.js';
import type { StrokeLimits } from './strokes.js';

export interface Room {
  code: string;
  state: GameState;
  /** Único temporizador de la sala: se reprograma tras cada `reduce` según `nextWakeAt`. */
  timer: ReturnType<typeof setTimeout> | null;
  strokes: StrokeHistory;
}

export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();

  constructor(
    private readonly maxRooms: number,
    private readonly rng: () => number,
    private readonly strokeLimits: Partial<StrokeLimits>,
  ) {}

  get size(): number {
    return this.rooms.size;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  all(): IterableIterator<Room> {
    return this.rooms.values();
  }

  /** Crea una sala con código nuevo; null si se alcanzó el tope de salas. */
  create(state: GameState): Room | null {
    if (this.rooms.size >= this.maxRooms) return null;
    const room: Room = {
      code: this.newCode(),
      state,
      timer: null,
      strokes: new StrokeHistory(this.strokeLimits),
    };
    this.rooms.set(room.code, room);
    return room;
  }

  /** Borra la sala y cancela su temporizador. */
  delete(room: Room): void {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    if (this.rooms.get(room.code) === room) this.rooms.delete(room.code);
  }

  clear(): void {
    for (const room of [...this.rooms.values()]) this.delete(room);
  }

  private newCode(): string {
    for (let attempt = 0; attempt < 1000; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        const index = Math.floor(this.rng() * ROOM_CODE_ALPHABET.length);
        code += ROOM_CODE_ALPHABET[index] ?? ROOM_CODE_ALPHABET[0];
      }
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('No se pudo generar un código de sala libre');
  }
}
