// src/index.ts
import app from "./server"; // This now works because server.ts exports 'app'

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});