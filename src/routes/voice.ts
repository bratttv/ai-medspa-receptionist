import { Router } from "express";

const router = Router();

router.post("/voice/inbound", (req, res) => {

  console.log("VAPI INBOUND CALL");

  res.type("text/xml");

  res.send(`
    <Response>
        <Say voice="alice">Please wait while we connect your call.</Say>
    </Response>
  `);
});

export default router;
