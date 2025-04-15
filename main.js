import express from "express";
import { Server } from "socket.io";
import { createServer } from "http";
import cors from "cors";
import axios from "axios";
import { configDotenv } from "dotenv";

configDotenv(); // Make sure this is called after import

const port = 3000;

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(cors());

app.get("/", (req, res) => {
  res.send("hello world");
});

let users = new Map();

io.on("connection", (socket) => {
  console.log("User Connected:", socket.id);

  socket.on("sendSocketID", async (data) => {
    try {
      await axios.post(`${process.env.API_URL}/user/setonline`, {
        phoneNumber: data.phoneNumber,
      });
      console.log("Successfully setOnline");
    } catch (err) {
      console.error("Error on setOnline:", err.message);
    }

    users.set(data.phoneNumber, socket.id);
    console.log("User Registered:", data.phoneNumber, "→", socket.id);

    try {
      io.emit("activeUsers", Array.from(users.keys()));
    } catch (err) {
      console.error("Error broadcasting active users:", err.message);
    }
  });

  socket.on("sendMessage", (data) => {
    try {
      const receiverSocketId = users.get(data.receiver);
      console.log(`${data.sender} → Message → ${data.receiver}`);

      if (receiverSocketId) {
        io.to(receiverSocketId).emit("receiveMessage", data);
        console.log(data);
      } else {
        console.log("Receiver is offline:", data.receiver);
      }
    } catch (err) {
      console.error("Error sending message:", err.message);
    }
  });

  socket.on("deleteMessage", (data) => {
    try {
      const receiverSocketId = users.get(data.receiver);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("deleteReceiveMessage", data);
      }
    } catch (err) {
      console.error("Error deleting message:", err.message);
    }
  });

  socket.on("call-user", (data) => {
    try {
      const receiverSocketId = users.get(data.to);
      if (receiverSocketId) {
        console.log(`${data.from} → Call → ${data.to}`);
        io.to(receiverSocketId).emit("receive-call", {
          signal: data.signal,
          from: data.from,
        });
      } else {
        io.to(socket.id).emit("call-rejected");
      }
    } catch (err) {
      console.error("Error during call-user:", err.message);
    }
  });

  socket.on("answer-call", (data) => {
    try {
      const receiverSocketId = users.get(data.to);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("call-answered", {
          signal: data.signal,
        });
      }
    } catch (err) {
      console.error("Error answering call:", err.message);
    }
  });

  socket.on("reject-call", (data) => {
    try {
      const receiverSocketId = users.get(data.to);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("call-rejected");
      }
    } catch (err) {
      console.error("Error rejecting call:", err.message);
    }
  });

  socket.on("disconnect", async () => {
    let disconnectedPhone = null;

    try {
      for (let [phoneNumber, socketId] of users.entries()) {
        if (socketId === socket.id) {
          disconnectedPhone = phoneNumber;
          users.delete(phoneNumber);
          break;
        }
      }

      if (disconnectedPhone) {
        await axios.post(`${process.env.API_URL}/user/setoffline`, {
          phoneNumber: disconnectedPhone,
        });
        console.log("User Disconnected:", disconnectedPhone);

        io.emit("activeUsers", Array.from(users.keys()));
      }
    } catch (err) {
      console.error("Error on disconnect:", err.message);
    }
  });
});

// GLOBAL ERROR HANDLERS
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err.message);
  // Don't exit process, just log it
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", reason);
});

server.listen(port, () => {
  console.log(`Server running on ${port}`);
});
