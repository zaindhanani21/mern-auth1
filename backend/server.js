// Import required packages
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./auth.js";
import ExternalBank from "./models/ExternalBank.js";
// 🟢 NEW: Import the transaction routes
import transactionRoutes from "./transaction.js"; 

// Initialize environment variables
dotenv.config();

const app = express();

// Middleware setup
app.use(express.json());
app.use(
    cors({
        origin: "http://localhost:5173",
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true,
    })
);

// MongoDB Connection
mongoose
.connect(process.env.MONGO_URI) 
.then(() => console.log("MongoDB Atlas Connected Successfully! ✅"))
.catch((err) => console.error("MongoDB Connection Error: ❌", err));

// --- API Routes Registration ---

// User Authentication (Signup, Login, OTP)
app.use("/api/auth", authRoutes);

// 🟢 NEW: Transaction Management (Send Money, History)
app.use("/api/transactions", transactionRoutes); 

// Root Route
app.get("/", (req, res) => {
    res.send("Wallexa Backend is Running 🌍 - Database connected to Atlas");
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});