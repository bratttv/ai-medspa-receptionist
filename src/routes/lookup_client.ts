import { Router } from "express";
import { supabase } from "../services/supabase.service";

const router = Router();

router.post("/lookup_client", async (req, res) => {
  try {
    console.log("--- NUCLEAR CLIENT LOOKUP ---");

    // 1. Get the Raw Number from AI
    let params = {};
    const rawArgs = req.body.message.functionCall?.parameters || req.body.message.toolCalls?.[0]?.function?.arguments;
    if (rawArgs) params = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;
    
    const { phone } = params as any;
    
    // 2. CLEAN THE INPUT (Remove +1, dashes, spaces)
    // Input: "+1 (437) 555-0199" -> "4375550199"
    const searchPhone = phone.replace(/\D/g, '').replace(/^1/, ''); 
    console.log(`🔎 Scrubbed Input: ${searchPhone}`);

    // 3. FETCH RECENT CLIENTS (The Nuclear Strategy)
    // We fetch the last 1000 appointments to ensure we catch them
    const { data: recentClients, error } = await supabase
        .from('appointments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);

    if (error) throw error;

    // 4. MANUAL MATCHING
    // We loop through DB results and clean them one by one to compare
    let foundClient = null;

    if (recentClients) {
        foundClient = recentClients.find(client => {
            if (!client.client_phone) return false;
            // Clean the DB number exactly like we cleaned the input
            const dbPhoneClean = client.client_phone.replace(/\D/g, '').replace(/^1/, '');
            
            // Check if they match
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
        console.log("❌ No match found after scrubbing.");
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