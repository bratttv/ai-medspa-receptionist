import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import bookRouter from "./routes/book";
import inboundSmsRouter from "./routes/inbound-sms";
import crmRouter from "./routes/crm";
import cancelRouter from "./routes/cancel";
import availabilityRouter from "./routes/availability"; // 👈 CHECK THIS LINE
import notifyRouter from "./routes/notify"; 
import rescheduleRouter from "./routes/reschedule"; 

import { startScheduler } from "./services/scheduler";

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
app.use("/", availabilityRouter); // 👈 AND THIS LINE
app.use("/", notifyRouter);
app.use("/", rescheduleRouter);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

startScheduler();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
export default app;