import { Router } from "express";
import { supabase } from "../services/supabase.service";

const router = Router();

router.post("/lookup_client", async (req, res) => {
  try {
    console.log("--- CLIENT LOOKUP ---");

    // 1. Get the Raw Number
    let params = {};
    const rawArgs = req.body.message.functionCall?.parameters || req.body.message.toolCalls?.[0]?.function?.arguments;
    if (rawArgs) params = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;
    
    const { phone } = params as any;
    
    // 2. CLEAN THE NUMBER (The Fix)
    // Remove everything that isn't a number. Remove leading '1' if present.
    // This makes "+1 (437)..." match "437..."
    const cleanPhone = phone.replace(/\D/g, '').replace(/^1/, ''); 

    console.log(`🔎 Searching for: ${cleanPhone} (Raw: ${phone})`);

    // 3. FUZZY SEARCH
    // We search for phone numbers that *contain* these last 10 digits
    const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .ilike('client_phone', `%${cleanPhone}%`) // Find partial match
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) throw error;

    if (data && data.length > 0) {
        const client = data[0];
        console.log(`👤 Found: ${client.client_name}`);
        return res.json({
            results: [{
                toolCallId: req.body.message.toolCalls?.[0]?.id,
                result: `found_client: ${client.client_name} (Last service: ${client.service})`
            }]
        });
    } else {
        console.log("👤 New Client");
        return res.json({
            results: [{
                toolCallId: req.body.message.toolCalls?.[0]?.id,
                result: "new_client"
            }]
        });
    }

  } catch (error: any) {
    console.error("Lookup Error:", error.message);
    return res.json({
        results: [{
            toolCallId: req.body.message.toolCalls?.[0]?.id,
            result: "error_looking_up_client"
        }]
    });
  }
});

export default router;