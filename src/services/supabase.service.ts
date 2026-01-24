// src/services/supabase.service.ts
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_KEY || ""; // Use your Service Role Key or Anon Key

export const supabase = createClient(supabaseUrl, supabaseKey);
