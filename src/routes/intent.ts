import { Router } from "express";

const router = Router();

router.post("/intent", async (req, res) => {
  const { intent, name } = req.body;

  console.log("INTENT RECEIVED:", req.body);

  if (intent === "book_appointment") {
    return res.json({
      ok: true,
      message: `Thanks ${name}. I can help you with booking an appointment.`
    });
  }

  return res.json({
    ok: true,
    message: "Thanks for reaching out. A team member will assist you shortly."
  });
});

export default router;
