import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// IMPORT ALL ROUTES
import bookRouter from "./routes/book";
import inboundSmsRouter from "./routes/inbound-sms";
import crmRouter from "./routes/crm";
import cancelRouter from "./routes/cancel";
import availabilityRouter from "./routes/availability"; // <--- THIS WAS LIKELY MISSING

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// REGISTER ROUTES
app.use("/", bookRouter);
app.use("/", inboundSmsRouter);
app.use("/", crmRouter);
app.use("/", cancelRouter);
app.use("/", availabilityRouter); // <--- THIS PLUGS IT IN

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
export default app;