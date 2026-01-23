import express from "express";
import cors from "cors";

import healthRoutes from "./routes/health";
import dbTestRoutes from "./routes/db-test";
import voiceRoutes from "./routes/voice";

const app = express();

app.use(cors());
app.use(express.json());

// routes
app.use("/", healthRoutes);
app.use("/", dbTestRoutes);
app.use("/", voiceRoutes);

export default app;
