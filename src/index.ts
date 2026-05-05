import express from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";

import {
  rooms,
  createRoom,
  joinRoom,
  getRoom,
  getRoomBySocketId,
  removePlayer,
  serializePlayers,
} from "./roomManager";
import { getRandomPrompt } from "./gameLogic";

// ─── Express + HTTP server setup ─────────────────────────────────────────────

const app = express();

const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3000";

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// Health check endpoint
app.get("/", (_req, res) => {
  res.json({ status: "ok", rooms: rooms.size });
});

const httpServer = http.createServer(app);

// ─── Socket.io setup ─────────────────────────────────────────────────────────

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"],
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emitError(socket: Socket, message: string) {
  socket.emit("room_error", { message });
}

function isValidName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.trim().length > 0 &&
    name.trim().length <= 20
  );
}

function isValidCode(code: unknown): code is string {
  return typeof code === "string" && code.trim().length > 0;
}

/** Sleep for ms milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Socket.io event handlers ────────────────────────────────────────────────

io.on("connection", (socket: Socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // ── 1. create_room ──────────────────────────────────────────────────────────
  socket.on("create_room", (payload: unknown) => {
    try {
      const data = payload as { name?: unknown };
      if (!isValidName(data?.name)) {
        return emitError(socket, "Invalid request");
      }

      const name = (data.name as string).trim();
      const room = createRoom(socket.id, name);
      socket.join(room.code);

      socket.emit("room_created", {
        code: room.code,
        players: serializePlayers(room),
      });
    } catch (err) {
      console.error("[create_room] Error:", err);
      emitError(socket, "Internal server error");
    }
  });

  // ── 2. join_room ────────────────────────────────────────────────────────────
  socket.on("join_room", (payload: unknown) => {
    try {
      const data = payload as { code?: unknown; name?: unknown };
      if (!isValidCode(data?.code) || !isValidName(data?.name)) {
        return emitError(socket, "Invalid request");
      }

      const code = (data.code as string).trim().toUpperCase();
      const name = (data.name as string).trim();

      const { room, error } = joinRoom(code, socket.id, name);
      if (!room) {
        return emitError(
          socket,
          error ?? "Room not found / full / already started",
        );
      }

      socket.join(room.code);

      io.to(room.code).emit("room_updated", {
        players: serializePlayers(room),
        status: room.status,
      });
    } catch (err) {
      console.error("[join_room] Error:", err);
      emitError(socket, "Internal server error");
    }
  });

  // ── 3. start_game ───────────────────────────────────────────────────────────
  socket.on("start_game", async (payload: unknown) => {
    try {
      const data = payload as { code?: unknown };
      if (!isValidCode(data?.code)) {
        return emitError(socket, "Invalid request");
      }

      const code = (data.code as string).trim().toUpperCase();
      const room = getRoom(code);

      if (!room) return emitError(socket, "Room not found");
      if (room.hostId !== socket.id)
        return emitError(socket, "Only the host can start the game");
      if (room.players.size < 2)
        return emitError(socket, "Need at least 2 players to start");
      if (room.status !== "waiting")
        return emitError(socket, "Game already started");

      // Begin countdown
      room.status = "countdown";
      room.prompt = getRandomPrompt();

      io.to(code).emit("room_updated", {
        players: serializePlayers(room),
        status: "countdown",
      });

      console.log(`[Room ${code}] Countdown started`);

      for (let count = 3; count >= 1; count--) {
        io.to(code).emit("countdown", { count });
        await sleep(1000);
      }

      // Guard: room might have been deleted during countdown
      if (!rooms.has(code)) return;

      room.status = "playing";
      io.to(code).emit("game_start", { prompt: room.prompt });
      console.log(`[Room ${code}] Game started`);

      // 60-second game timer — force-finish any remaining players
      room.gameTimer = setTimeout(() => {
        if (!rooms.has(code) || room.status !== "playing") return;

        room.players.forEach((player) => {
          if (!player.finished) {
            player.finished = true;
            player.finishedAt = Date.now();
          }
        });

        room.status = "finished";

        const sorted = serializePlayers(room).sort((a, b) => {
          if (a.finishedAt && b.finishedAt) return a.finishedAt - b.finishedAt;
          if (a.finishedAt) return -1;
          if (b.finishedAt) return 1;
          return b.wpm - a.wpm;
        });

        io.to(code).emit("game_finished", { players: sorted });
        console.log(`[Room ${code}] Game ended by 60s timeout`);
      }, 60 * 1000);
    } catch (err) {
      console.error("[start_game] Error:", err);
      emitError(socket, "Internal server error");
    }
  });

  // ── 4. progress_update ──────────────────────────────────────────────────────
  socket.on("progress_update", (payload: unknown) => {
    try {
      const data = payload as {
        code?: unknown;
        progress?: unknown;
        wpm?: unknown;
      };
      if (
        !isValidCode(data?.code) ||
        typeof data?.progress !== "number" ||
        typeof data?.wpm !== "number"
      ) {
        return emitError(socket, "Invalid request");
      }

      const code = (data.code as string).trim().toUpperCase();
      const room = getRoom(code);

      // Silently ignore if not playing
      if (!room || room.status !== "playing") return;

      const player = room.players.get(socket.id);
      if (!player || player.finished) return;

      player.progress = Math.min(100, Math.max(0, data.progress as number));
      player.wpm = Math.max(0, data.wpm as number);

      io.to(code).emit("player_progress", { players: serializePlayers(room) });
    } catch (err) {
      console.error("[progress_update] Error:", err);
      emitError(socket, "Internal server error");
    }
  });

  // ── 5. player_finished ──────────────────────────────────────────────────────
  socket.on("player_finished", (payload: unknown) => {
    try {
      const data = payload as { code?: unknown; wpm?: unknown };
      if (!isValidCode(data?.code) || typeof data?.wpm !== "number") {
        return emitError(socket, "Invalid request");
      }

      const code = (data.code as string).trim().toUpperCase();
      const room = getRoom(code);

      if (!room || room.status !== "playing") return;

      const player = room.players.get(socket.id);
      if (!player || player.finished) return;

      player.finished = true;
      player.finishedAt = Date.now();
      player.wpm = Math.max(0, data.wpm as number);
      player.progress = 100;

      console.log(
        `[Room ${code}] Player "${player.name}" finished at ${player.wpm} WPM`,
      );

      io.to(code).emit("player_progress", { players: serializePlayers(room) });

      // Check if ALL players finished
      const allFinished = Array.from(room.players.values()).every(
        (p) => p.finished,
      );
      if (allFinished) {
        clearTimeout(room.gameTimer);
        room.status = "finished";

        const sorted = serializePlayers(room).sort((a, b) => {
          if (a.finishedAt && b.finishedAt) return a.finishedAt - b.finishedAt;
          if (a.finishedAt) return -1;
          if (b.finishedAt) return 1;
          return b.wpm - a.wpm;
        });

        io.to(code).emit("game_finished", { players: sorted });
        console.log(`[Room ${code}] All players finished — game over`);
      }
    } catch (err) {
      console.error("[player_finished] Error:", err);
      emitError(socket, "Internal server error");
    }
  });

  // ── 6. leave_room ───────────────────────────────────────────────────────────
  socket.on("leave_room", (payload: unknown) => {
    try {
      handlePlayerLeave(socket);
    } catch (err) {
      console.error("[leave_room] Error:", err);
    }
  });

  // ── 7. disconnect ───────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    try {
      console.log(`[Socket] Disconnected: ${socket.id}`);
      handlePlayerLeave(socket);
    } catch (err) {
      console.error("[disconnect] Error:", err);
    }
  });
});

// ─── Shared leave/disconnect handler ─────────────────────────────────────────

function handlePlayerLeave(socket: Socket) {
  const roomRef = getRoomBySocketId(socket.id);
  if (!roomRef) return;

  const code = roomRef.code;
  const statusBefore = roomRef.status;
  const result = removePlayer(socket.id);
  if (!result) return;

  const { room, wasHost } = result;

  // No players left → clean up
  if (room.players.size === 0) {
    clearTimeout(room.gameTimer);
    clearTimeout(room.cleanupTimer);
    rooms.delete(code);
    console.log(`[Room ${code}] Deleted — no players remaining`);
    return;
  }

  // Host left during waiting → dissolve room
  if (wasHost && statusBefore === "waiting") {
    clearTimeout(room.gameTimer);
    clearTimeout(room.cleanupTimer);
    rooms.delete(code);
    io.to(code).emit("room_error", { message: "Host left the room" });
    console.log(`[Room ${code}] Deleted — host left during waiting`);
    return;
  }

  // Someone left during "playing"
  if (statusBefore === "playing") {
    // Notify remaining players of the updated list
    io.to(code).emit("player_progress", { players: serializePlayers(room) });

    // Only end the game if just 1 player is left
    if (room.players.size <= 1) {
      clearTimeout(room.gameTimer);
      room.status = "finished";

      // Mark the sole remaining player as finished (winner)
      room.players.forEach((p) => {
        if (!p.finished) {
          p.finished = true;
          p.finishedAt = Date.now();
        }
      });

      io.to(code).emit("game_finished", { players: serializePlayers(room) });
      console.log(
        `[Room ${code}] Game ended — only 1 player remaining after disconnect`,
      );
    } else {
      console.log(
        `[Room ${code}] A player disconnected during play; ${room.players.size} players remain`,
      );
    }
    return;
  }

  // Guest left during waiting
  if (!wasHost && statusBefore === "waiting") {
    io.to(code).emit("room_updated", {
      players: serializePlayers(room),
      status: "waiting",
    });
    return;
  }
}

// ─── Start server ─────────────────────────────────────────────────────────────

const PORT = 3102;
httpServer.listen(PORT, () => {
  console.log(`✅  VersusTyping backend running on http://localhost:${PORT}`);
});
