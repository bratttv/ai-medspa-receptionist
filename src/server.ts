import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bookRouter from "./routes/book";
// 👇 1. Import the new router
import inboundSmsRouter from "./routes/inbound-sms";
import crmRouter from "./routes/crm"; 

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 👇 2. ADD THIS LINE (Required for Twilio Webhooks to work)
app.use(express.urlencoded({ extended: true })); 

// Routes
app.use("/", bookRouter);
// 👇 3. Mount the new router
app.use("/", inboundSmsRouter); 
app.use("/", crmRouter);


app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
export default app;