import { Router } from "express";
import { supabase } from "../services/supabase.service";

const router = Router();

router.post("/lookup_client", async (req, res) => {
  try {
    console.log("--- NUCLEAR CLIENT LOOKUP ---");

    // 1. Get Params
    let params = {};
    const rawArgs = req.body.message.functionCall?.parameters || req.body.message.toolCalls?.[0]?.function?.arguments;
    if (rawArgs) params = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;
    
    const { phone } = params as any;

    // 🚨 SAFETY CHECK: If no phone, stop here. Don't crash.
    if (!phone) {
        console.log("⚠️ No phone provided. Treating as new client.");
        return res.json({
            results: [{
                toolCallId: req.body.message.toolCalls?.[0]?.id,
                result: "new_client" 
            }]
        });
    }
    
    // 2. CLEAN THE INPUT (Remove +1, dashes, spaces)
    const searchPhone = phone.replace(/\D/g, '').replace(/^1/, ''); 
    console.log(`🔎 Scrubbed Input: ${searchPhone}`);

    // 3. FETCH RECENT CLIENTS (Limit 1000)
    const { data: recentClients, error } = await supabase
        .from('appointments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);

    if (error) throw error;

    // 4. MANUAL MATCHING (The Nuclear Scrub)
    let foundClient = null;

    if (recentClients) {
        foundClient = recentClients.find(client => {
            if (!client.client_phone) return false;
            // Clean DB phone to match input
            const dbPhoneClean = client.client_phone.replace(/\D/g, '').replace(/^1/, '');
            return dbPhoneClean === searchPhone || dbPhoneClean.includes(searchPhone) || searchPhone.includes(dbPhoneClean);
        });
    }

    if (foundClient) {
        console.log(`✅ MATCH FOUND: ${foundClient.client_name}`);
        return res.json({
            results: [{
                toolCallId: req.body.message.toolCalls?.[0]?.id,
                result: `found_client: ${foundClient.client_name} (Last service: ${foundClient.service})`
            }]
        });
    } else {
        console.log("❌ No match found.");
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