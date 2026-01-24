import express from "express";
import cors from "cors";

import availabilityRoutes from "./routes/availability";
import intentRoutes from "./routes/intent";
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
app.use("/", intentRoutes);
app.use("/", availabilityRoutes);

export default app;
