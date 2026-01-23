import express from "express";
import cors from "cors";

import healthRoutes from "./routes/health";
import dbTestRoutes from "./routes/db-test";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/", healthRoutes);
app.use("/", dbTestRoutes);

export default app;
