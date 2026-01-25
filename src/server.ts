import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// IMPORT ALL YOUR ROUTES HERE
import bookRouter from "./routes/book";
import inboundSmsRouter from "./routes/inbound-sms";
import crmRouter from "./routes/crm";
import cancelRouter from "./routes/cancel";
import availabilityRouter from "./routes/availability"; // <--- This was missing before

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// REGISTER ALL ROUTES
app.use("/", bookRouter);         // Function: book_appointment
app.use("/", inboundSmsRouter);   // Function: Handles SMS replies
app.use("/", crmRouter);          // Function: lookup_client
app.use("/", cancelRouter);       // Function: cancel_appointment
app.use("/", availabilityRouter); // Function: check_availability

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
export default app;