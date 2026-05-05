// ─── Types ───────────────────────────────────────────────────────────────────

export type Player = {
  id: string;         // socket.id
  name: string;
  progress: number;   // 0–100 percent of prompt completed
  wpm: number;
  finished: boolean;
  finishedAt?: number; // Date.now() timestamp when they finish
};

export type Room = {
  code: string;
  hostId: string;
  players: Map<string, Player>;
  prompt: string;
  status: "waiting" | "countdown" | "playing" | "finished";
  createdAt: number;
  gameTimer?: NodeJS.Timeout;   // 60s game timeout ref
  cleanupTimer?: NodeJS.Timeout; // 10min room cleanup ref
};

// ─── In-memory store ──────────────────────────────────────────────────────────

export const rooms = new Map<string, Room>();

// ─── Helper: generate unique 6-char code ─────────────────────────────────────

export function generateCode(): string {
  let code: string;
  do {
    code = Math.random().toString(36).substring(2, 8).toUpperCase();
  } while (rooms.has(code));
  return code;
}

// ─── createRoom ──────────────────────────────────────────────────────────────

export function createRoom(socketId: string, name: string): Room {
  const code = generateCode();

  const host: Player = {
    id: socketId,
    name,
    progress: 0,
    wpm: 0,
    finished: false,
  };

  const players = new Map<string, Player>();
  players.set(socketId, host);

  const room: Room = {
    code,
    hostId: socketId,
    players,
    prompt: "",
    status: "waiting",
    createdAt: Date.now(),
  };

  // Auto-delete room after 10 minutes of inactivity
  room.cleanupTimer = setTimeout(() => {
    if (rooms.has(code)) {
      rooms.delete(code);
      console.log(`[Room ${code}] Auto-deleted after 10-minute timeout`);
    }
  }, 10 * 60 * 1000);

  rooms.set(code, room);
  console.log(`[Room ${code}] Created by "${name}" (${socketId})`);
  return room;
}

// ─── joinRoom ────────────────────────────────────────────────────────────────

export function joinRoom(
  code: string,
  socketId: string,
  name: string
): { room: Room | null; error?: string } {
  const room = rooms.get(code);
  if (!room) return { room: null, error: "Room not found" };
  if (room.players.size >= 4) return { room: null, error: "Room is full" };
  if (room.status !== "waiting") return { room: null, error: "Game already in progress" };

  const player: Player = {
    id: socketId,
    name,
    progress: 0,
    wpm: 0,
    finished: false,
  };

  room.players.set(socketId, player);
  console.log(`[Room ${code}] "${name}" (${socketId}) joined`);
  return { room };
}

// ─── getRoom ──────────────────────────────────────────────────────────────────

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

// ─── getRoomBySocketId ────────────────────────────────────────────────────────

export function getRoomBySocketId(socketId: string): Room | undefined {
  for (const room of rooms.values()) {
    if (room.players.has(socketId)) return room;
  }
  return undefined;
}

// ─── removePlayer ─────────────────────────────────────────────────────────────

export function removePlayer(
  socketId: string
): { room: Room; wasHost: boolean } | null {
  const room = getRoomBySocketId(socketId);
  if (!room) return null;

  const wasHost = room.hostId === socketId;
  room.players.delete(socketId);
  console.log(`[Room ${room.code}] Player ${socketId} removed (wasHost: ${wasHost})`);
  return { room, wasHost };
}

// ─── serializePlayers ────────────────────────────────────────────────────────

export function serializePlayers(room: Room): Player[] {
  return Array.from(room.players.values());
}
