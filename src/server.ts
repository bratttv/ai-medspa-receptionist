import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// --- ROUTES ---
import bookRouter from "./routes/book";
import inboundSmsRouter from "./routes/inbound-sms";
import crmRouter from "./routes/crm";
import cancelRouter from "./routes/cancel";
import availabilityRouter from "./routes/availability"; 
import notifyRouter from "./routes/notify"; 
import rescheduleRouter from "./routes/reschedule"; 
import sendInsuranceRouter from './routes/send_insurance';
import lookupClientRouter from './routes/lookup_client';

// --- SERVICES ---
import { runScheduler } from "./services/scheduler.service"; 

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🔌 PLUG IN THE ROUTES
app.use("/", bookRouter);
app.use("/", inboundSmsRouter);
app.use("/", crmRouter);
app.use("/", cancelRouter);
app.use("/", availabilityRouter);
app.use("/", notifyRouter);
app.use("/", rescheduleRouter);
app.use("/", sendInsuranceRouter);
app.use("/", lookupClientRouter);

// 👋 Health Check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// 👋 Welcome Message
app.get("/", (req, res) => {
  res.send("<h1>🤖 Lumen Premium Server is Online</h1>");
});

// 🚀 START SERVER
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  
  // ⏰ START THE BACKGROUND ROBOT
  // This handles 24h reminders AND the 2h review links
  console.log("⏰ Premium Scheduler Starting...");
  runScheduler(); // Run once immediately
  
  // Run again every 1 Hour
  setInterval(() => {
    runScheduler();
  }, 60 * 60 * 1000); 
});

export default app;