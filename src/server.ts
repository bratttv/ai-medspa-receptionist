// FILE: src/server.ts
import express from "express";
import dotenv from "dotenv";

// Import your routes
import availabilityRouter from "./routes/availability";
import bookRouter from "./routes/book"; 
import dbTestRouter from "./routes/db-test";

dotenv.config();

const app = express();

// Middleware to parse JSON
app.use(express.json());

// Mount the routes
app.use("/", availabilityRouter);
app.use("/", bookRouter);      
app.use("/", dbTestRouter);    

// Simple health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// EXPORT THE APP (This fixes the error in index.ts)
export default app;