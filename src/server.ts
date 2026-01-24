// src/server.ts
import express from "express";
import dotenv from "dotenv";
import availabilityRouter from "./routes/availability";

// 1. ADD THESE IMPORTS
import bookRouter from "./routes/book";
import dbTestRouter from "./routes/db-test";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// 2. ADD THESE ROUTES
app.use("/", availabilityRouter);
app.use("/", bookRouter);      // <--- Enables Booking
app.use("/", dbTestRouter);    // <--- Enables DB Testing

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

export default app;