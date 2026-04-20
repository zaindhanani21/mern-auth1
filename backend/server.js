import express from "express";
import http from "http";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";

import authRoutes from "./auth.js";
import walletRoutes from "./routes/wallet.js"; // 🟢 New Wallet/Transaction Routes
import profileRoutes from "./routes/profile.js"; // 🟢 Profile Management Routes

dotenv.config();

const app = express();
const server = http.createServer(app); // 🟢 Wrap Express with HTTP Server

// 🟢 Initialize Socket.IO
const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Middleware
app.use(express.json({ limit: '10mb' })); // Increased limit for base64 images
app.use(cors({
    origin: "http://localhost:5173",
    credentials: true,
}));

// 🟢 Attach IO to request so controllers can use it
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Database Connection with Retry Policy
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ MongoDB Atlas Connected");
    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err.message);
        console.log("🔄 Retrying connection in 5 seconds...");
        setTimeout(connectDB, 5000);
    }
};

connectDB();

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/wallet", walletRoutes); // 🟢 Renamed from transactions
app.use("/api/profile", profileRoutes); // 🟢 Profile Management

// Socket.IO Events
io.on("connection", (socket) => {
    console.log(`🔌 Client Connected: ${socket.id}`);

    // Join a private room based on User ID for secure personal notifications
    socket.on("join_user_room", (userId) => {
        if (userId) {
            socket.join(userId);
            console.log(`👤 User ${userId} joined their notification room.`);
        }
    });

    socket.on("disconnect", () => {
        console.log("🔌 Client Disconnected");
    });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error("💥 Global Error:", err.stack);
    res.status(500).json({ message: "Something went wrong on the server!", error: err.message });
});

// Prevent process crash
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => { // 🟢 Listen on SERVER, not APP
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});