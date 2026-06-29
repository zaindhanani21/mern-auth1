import express from "express";
import http from "http";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";
import User from "./models/User.js";
import UbpsBill from "./models/UbpsBill.js";
import OneLinkBank from "./models/OneLinkBank.js";

import authRoutes from "./auth.js";
import walletRoutes from "./routes/wallet.js"; // 🟢 New Wallet/Transaction Routes
import profileRoutes from "./routes/profile.js"; // 🟢 Profile Management Routes

dotenv.config();

const app = express();
const server = http.createServer(app); // 🟢 Wrap Express with HTTP Server

// 🟢 Initialize Socket.IO
const io = new Server(server, {
    cors: {
        origin: ["http://192.168.43.54:5173", "http://127.0.0.1:5173", "http://localhost:5173", "https://mern-auth1-flame.vercel.app"],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Middleware
app.use(express.json({ limit: '10mb' })); // Increased limit for base64 images
app.use(express.urlencoded({ extended: true })); // 🟢 Safepay POST data parser
app.use(cors({
    origin: ["http://192.168.43.54:5173", "http://127.0.0.1:5173", "http://localhost:5173", "https://mern-auth1-flame.vercel.app"],
    credentials: true,
}));

// 🟢 Attach IO to request so controllers can use it
app.use((req, res, next) => {
    req.io = io;
    next();
});

const seedKarachiBills = async () => {
    try {
        const count = await UbpsBill.countDocuments();
        if (count < 44) {
            console.log("🔌 Re-seeding Karachi utility bills in UbpsBill collection (clearing old ones)...");
            await UbpsBill.deleteMany({});
            const bills = [
                {
                    consumerNumber: "1300023459157",
                    contractNumber: "31707347",
                    billType: "Electricity Bill",
                    provider: "K-Electric",
                    ownerName: "MUHAMMAD SIDDIQ KHAN",
                    billMonth: "June 2026",
                    unitsConsumed: "336 Units",
                    amountDue: 28457,
                    lateFee: 1380,
                    amountAfterDueDate: 29837,
                    dueDate: new Date("2026-07-08"),
                    status: "UNPAID"
                },
                {
                    consumerNumber: "41998765432",
                    contractNumber: "88992211",
                    billType: "Gas Bill",
                    provider: "SSGC",
                    ownerName: "SARAH KHAN",
                    billMonth: "June 2026",
                    unitsConsumed: "12.4 HM3",
                    amountDue: 3450,
                    lateFee: 250,
                    amountAfterDueDate: 3700,
                    dueDate: new Date("2026-07-12"),
                    status: "UNPAID"
                },
                {
                    consumerNumber: "50998765432",
                    contractNumber: "77443322",
                    billType: "Water Bill",
                    provider: "KWSB",
                    ownerName: "KASHIF MAHMOOD",
                    billMonth: "June 2026",
                    unitsConsumed: "Flat Rate",
                    amountDue: 1800,
                    lateFee: 150,
                    amountAfterDueDate: 1950,
                    dueDate: new Date("2026-07-15"),
                    status: "UNPAID"
                },
                {
                    consumerNumber: "10008765432",
                    contractNumber: "55667788",
                    billType: "Internet Bill",
                    provider: "PTCL",
                    ownerName: "ZAIN DHANANI",
                    billMonth: "June 2026",
                    unitsConsumed: "Unlimited 50Mbps",
                    amountDue: 4500,
                    lateFee: 300,
                    amountAfterDueDate: 4800,
                    dueDate: new Date("2026-07-18"),
                    status: "UNPAID"
                }
            ];

            // Generate 40 additional mixed bills (10 of each type)
            const providersInfo = [
                { type: "Electricity Bill", provider: "K-Electric", consumerPrefix: "1300000000", unitsPattern: "Units", baseAmount: 8000, lateFactor: 0.05 },
                { type: "Gas Bill", provider: "SSGC", consumerPrefix: "4100000000", unitsPattern: "HM3", baseAmount: 1500, lateFactor: 0.08 },
                { type: "Water Bill", provider: "KWSB", consumerPrefix: "5000000000", unitsPattern: "Gallons", baseAmount: 900, lateFactor: 0.08 },
                { type: "Internet Bill", provider: "PTCL", consumerPrefix: "1000000000", unitsPattern: "Mbps", baseAmount: 2500, lateFactor: 0.07 }
            ];

            const holdersList = [
                "Muhammad Ali", "Sana Sheikh", "Ayesha Khan", "Sarah Khan", 
                "Hamza Malik", "Usman Ahmad", "Ahmad Ali", "Danish Zaidi", 
                "Fatima Bibi", "Kashif Mahmood"
            ];

            providersInfo.forEach((info) => {
                for (let k = 1; k <= 10; k++) {
                    const consumerNo = `${info.consumerPrefix}${String(k).padStart(3, "0")}`;
                    const contractNo = `99${String(k).padStart(3, "0")}778`;
                    const owner = holdersList[(k - 1) % holdersList.length];
                    const amountDue = info.baseAmount + (k * 400);
                    const lateFee = Math.round(amountDue * info.lateFactor);
                    const amountAfterDueDate = amountDue + lateFee;
                    
                    // Pehle 4 bills pass due ho gaye hain (June 11-14, 2026) taake late payment check kr sakein
                    let dueDate;
                    let billMonth = "June 2026";
                    if (k <= 4) {
                        dueDate = new Date(`2026-06-${10 + k}`); // Past due dates (June 11-14, 2026)
                        billMonth = "May 2026";
                    } else {
                        dueDate = new Date(`2026-07-${20 + k}`); // Future due dates (July 25-30, 2026)
                    }

                    const units = info.type === "Electricity Bill" ? `${200 + k * 15} Units` :
                                  info.type === "Gas Bill" ? `${8.5 + k * 0.8} HM3` :
                                  info.type === "Water Bill" ? "Flat Rate" : `Unlimited ${20 + k * 10}Mbps`;

                    bills.push({
                        consumerNumber: consumerNo,
                        contractNumber: contractNo,
                        billType: info.type,
                        provider: info.provider,
                        ownerName: owner,
                        billMonth: billMonth,
                        unitsConsumed: units,
                        amountDue: amountDue,
                        lateFee: lateFee,
                        amountAfterDueDate: amountAfterDueDate,
                        dueDate: dueDate,
                        status: "UNPAID"
                    });
                }
            });

            await UbpsBill.insertMany(bills);
            console.log("✅ Karachi utility bills successfully seeded (44 bills total)!");
        }
    } catch (err) {
        console.error("❌ Error seeding bills:", err.message);
    }
};

// Bank Directory Seeding Helper
const seedBankDirectory = async () => {
    try {
        const count = await OneLinkBank.countDocuments();
        if (count < 92) {
            console.log("🔌 Re-seeding complete Pakistani Bank Directory in MongoDB (clearing old ones)...");
            await OneLinkBank.deleteMany({});
            
            const banks = [
                { name: "Meezan Bank", prefix: "0201", type: "bank", ibanMnemonic: "MEZN" },
                { name: "HBL Bank", prefix: "0014", type: "bank", ibanMnemonic: "HABB" },
                { name: "United Bank Limited (UBL)", prefix: "0206", type: "bank", ibanMnemonic: "UNIL" },
                { name: "National Bank of Pakistan (NBP)", prefix: "0112", type: "bank", ibanMnemonic: "NBPA" },
                { name: "Allied Bank Limited (ABL)", prefix: "0010", type: "bank", ibanMnemonic: "ALED" },
                { name: "Bank Alfalah", prefix: "0042", type: "bank", ibanMnemonic: "ALFH" },
                { name: "MCB Bank", prefix: "0015", type: "bank", ibanMnemonic: "MCBB" },
                { name: "Habib Metropolitan Bank", prefix: "0123", type: "bank", ibanMnemonic: "HABB" },
                { name: "Soneri Bank", prefix: "0095", type: "bank", ibanMnemonic: "SONR" },
                { name: "Askari Bank", prefix: "0036", type: "bank", ibanMnemonic: "ASBK" },
                { name: "Faysal Bank", prefix: "0021", type: "bank", ibanMnemonic: "FAYS" },
                { name: "Bank Al Habib", prefix: "0079", type: "bank", ibanMnemonic: "BAHL" },
                { name: "The Bank of Punjab (BOP)", prefix: "0088", type: "bank", ibanMnemonic: "BPUN" },
                { name: "JS Bank", prefix: "0044", type: "bank", ibanMnemonic: "JSBL" },
                { name: "Standard Chartered Bank (SCB)", prefix: "0116", type: "bank", ibanMnemonic: "SCBL" },
                { name: "BankIslami Pakistan", prefix: "1005", type: "bank", ibanMnemonic: "ISLA" },
                { name: "Dubai Islamic Bank (DIB)", prefix: "0056", type: "bank", ibanMnemonic: "DIBK" },
                { name: "Al Baraka Bank", prefix: "0099", type: "bank", ibanMnemonic: "ALBR" },
                { name: "Easypaisa", prefix: "034", type: "wallet", ibanMnemonic: "EPAS" },
                { name: "JazzCash", prefix: "030", type: "wallet", ibanMnemonic: "JAZZ" },
                { name: "NayaPay", prefix: "031", type: "wallet", ibanMnemonic: "NPAY" },
                { name: "SadaPay", prefix: "033", type: "wallet", ibanMnemonic: "SPAY" }
            ];

            const holders = [
                "Zain Dhanani", "Sarah Khan", "Ahmad Ali", "John Doe",
                "Fatima Bibi", "Muhammad Yousuf", "Kashif Mahmood", "Muhammad Ali",
                "Tariq Mahmood", "Ayesha Khan", "Usman Ahmad", "Bilal Ahmad",
                "Aftab Qureshi", "Imran Shah", "Hamza Malik", "Sana Sheikh",
                "Hina Butt", "Sadaf Siddiqui", "Danish Zaidi", "Aamir Abbasi",
                "Raza Sheikh", "Ayesha Butt"
            ];

            const accounts = [];

            banks.forEach((bank, bankIndex) => {
                for (let i = 1; i <= 4; i++) {
                    let accountNumber = "";
                    let iban = "";
                    
                    if (bank.type === "wallet") {
                        let subPrefix = "";
                        if (bank.prefix === "034") { // Telenor (Easypaisa)
                            subPrefix = ["0345", "0346", "0347", "0340"][i - 1];
                        } else if (bank.prefix === "030") { // Jazz/Mobilink (JazzCash)
                            subPrefix = ["0300", "0301", "0302", "0303"][i - 1];
                        } else if (bank.prefix === "031") { // Zong (NayaPay)
                            subPrefix = ["0311", "0312", "0313", "0314"][i - 1];
                        } else if (bank.prefix === "033") { // Ufone (SadaPay)
                            subPrefix = ["0331", "0332", "0333", "0334"][i - 1];
                        }
                        accountNumber = `${subPrefix}000${i}${i}${i}${i}`;
                    } else {
                        const indexStr = String(bankIndex + 1).padStart(2, "0");
                        accountNumber = `${bank.prefix}${indexStr}000${i}${i}${i}${i}`;
                    }

                    // Standard Pakistani IBAN is exactly 24 characters. Pad accountNumber to 16 characters.
                    iban = `PK73${bank.ibanMnemonic}${accountNumber.padStart(16, "0")}`;
                    const holderName = holders[(bankIndex * 4 + i - 1) % holders.length];
                    const balance = 50000 * i + (bankIndex * 10000);

                    accounts.push({
                        bankName: bank.name,
                        accountNumber: accountNumber,
                        accountHolder: holderName,
                        iban: iban,
                        balance: balance
                    });
                }
            });

             // User's custom test accounts for digital wallets (Strictly 24-character IBANs)
            accounts.push(
                {
                    bankName: "Easypaisa",
                    accountNumber: "03152608455",
                    accountHolder: "Zain Zain",
                    iban: "PK73EPAS0000003152608455",
                    balance: 250000
                },
                {
                    bankName: "JazzCash",
                    accountNumber: "03152608455",
                    accountHolder: "Zain",
                    iban: "PK73JAZZ0000003152608455",
                    balance: 250000
                },
                {
                    bankName: "NayaPay",
                    accountNumber: "03152608455",
                    accountHolder: "Zain",
                    iban: "PK73NPAY0000003152608455",
                    balance: 250000
                },
                {
                    bankName: "SadaPay",
                    accountNumber: "03152608455",
                    accountHolder: "Zain",
                    iban: "PK73SPAY0000003152608455",
                    balance: 250000
                }
            );

            await OneLinkBank.insertMany(accounts);
            console.log("✅ Complete Pakistani Bank Directory (88 accounts) successfully seeded!");
        }
    } catch (err) {
        console.error("❌ Error seeding bank directory:", err.message);
    }
};

// Database Connection with Retry Policy
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ MongoDB Atlas Connected");
        // Seed bills automatically after database connection
        await seedKarachiBills();
        // Seed bank directories automatically
        await seedBankDirectory();
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
const socketUserMap = new Map(); // socketId -> userId

io.on("connection", (socket) => {
    console.log(`🔌 Client Connected: ${socket.id}`);

    socket.on("join_user_room", async (userId) => {
        if (userId) {
            socket.join(userId);
            socketUserMap.set(socket.id, userId);
            console.log(`👤 User ${userId} joined their notification room.`);
        }
    });

    socket.on("disconnect", async () => {
        const userId = socketUserMap.get(socket.id);
        socketUserMap.delete(socket.id);
        console.log(`🔌 Client Disconnected${userId ? ` (User: ${userId})` : ""}`);
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
    console.log(`🚀 Server running on http://192.168.43.54:${PORT}`);
});