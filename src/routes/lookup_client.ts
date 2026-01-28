import { Router } from "express";
import { supabase } from "../services/supabase.service";

const router = Router();

router.post("/lookup_client", async (req, res) => {
  try {
    console.log("--- CLIENT LOOKUP ---");

    const toolCallId = req.body.message.toolCalls?.[0]?.id;
    let params = {};
    const rawArgs = req.body.message.functionCall?.parameters || req.body.message.toolCalls?.[0]?.function?.arguments;
    if (rawArgs) params = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;

    const { phone } = params as any;

    if (!phone) {
        return res.json({
            results: [{
                toolCallId: toolCallId,
                result: "No phone number provided."
            }]
        });
    }

    console.log(`🔎 Looking up: ${phone}`);

    // Check DB for the most recent appointment for this phone number
    const { data, error } = await supabase
        .from('appointments')
        .select('client_name, service')
        .eq('client_phone', phone)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (error || !data) {
        // New Client (Not found)
        console.log("👤 Unknown Client");
        return res.json({
            results: [{
                toolCallId: toolCallId,
                result: "new_client"
            }]
        });
    }

    // Returning Client (Found)
    console.log(`👤 Found: ${data.client_name}`);
    return res.json({
        results: [{
            toolCallId: toolCallId,
            result: `found_client: ${data.client_name}`
        }]
    });

  } catch (error: any) {
    console.error("Lookup Error:", error);
    return res.json({
        results: [{
            toolCallId: req.body.message.toolCalls?.[0]?.id,
            result: "error"
        }]
    });
  }
});

export default router;