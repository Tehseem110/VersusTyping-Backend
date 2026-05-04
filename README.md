# VersusTyping Backend

Real-time multiplayer typing speed game backend built with **Node.js + Express + Socket.io + TypeScript**.

---

## Prerequisites

- **Node.js 18+**
- npm

---

## Getting Started

```bash
# Install dependencies
npm install

# Start development server (auto-restarts on file change)
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

The server starts on **http://localhost:3001**.

---

## Health Check

```
GET /
→ { "status": "ok", "rooms": <number of active rooms> }
```

---

## Socket.io Events

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `create_room` | `{ name: string }` | Create a new room. Host is added automatically. |
| `join_room` | `{ code: string, name: string }` | Join an existing room by 6-char code. |
| `start_game` | `{ code: string }` | Host starts the game (requires ≥ 2 players). |
| `progress_update` | `{ code: string, progress: number, wpm: number }` | Send typing progress (0–100%) and WPM while playing. |
| `player_finished` | `{ code: string, wpm: number }` | Notify server player completed the prompt. |
| `leave_room` | `{ code: string }` | Explicitly leave a room. |

---

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `room_created` | `{ code: string, players: Player[] }` | Emitted to creator after room is made. |
| `room_updated` | `{ players: Player[], status: RoomStatus }` | Emitted to whole room when players join/leave or status changes. |
| `countdown` | `{ count: number }` | Emitted 3 times (3, 2, 1) with 1s gaps before game start. |
| `game_start` | `{ prompt: string }` | Emitted when game begins — includes the typing prompt. |
| `player_progress` | `{ players: Player[] }` | Broadcast whenever a player's progress/WPM updates. |
| `game_finished` | `{ players: Player[] }` | Emitted when all players finish or 60s timer expires. Players sorted by finish time (winner first). |
| `room_error` | `{ message: string }` | Emitted on invalid actions (room full, wrong host, etc.). |

---

## Types

```typescript
type Player = {
  id: string;
  name: string;
  progress: number;   // 0–100
  wpm: number;
  finished: boolean;
  finishedAt?: number; // timestamp
};

type RoomStatus = "waiting" | "countdown" | "playing" | "finished";
```

---

## Game Flow

```
create_room → [host waits] → join_room (guest) → start_game (host)
  → countdown 3,2,1 → game_start
  → [players type, sending progress_update]
  → player_finished → game_finished (when all done or 60s elapsed)
```

---

## Room Rules

- Max **2 players** per room
- Room codes are **6-char uppercase alphanumeric** (e.g. `X4KP2A`)
- Rooms auto-delete after **10 minutes**
- Game auto-ends after **60 seconds**
- If host disconnects during `waiting`, room is dissolved
- If a player disconnects during `playing`, the remaining player wins automatically
