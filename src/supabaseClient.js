// --------------------------------------------------------------------------
// Paste your Supabase project's credentials below.
//
// Where to find them:
//   1. Go to https://supabase.com and open your project.
//   2. In the left sidebar, click the gear icon -> "Project Settings".
//   3. Click "API" in that settings page.
//   4. Copy "Project URL" into SUPABASE_URL below.
//   5. Copy the "anon public" key (NOT the "service_role" key — never put
//      that one in this file or anywhere in the app) into SUPABASE_ANON_KEY.
// --------------------------------------------------------------------------
export const SUPABASE_URL = "https://eekidqwwkxswvuhbaswx.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVla2lkcXd3a3hzd3Z1aGJhc3d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyMDcxOTQsImV4cCI6MjEwMDc4MzE5NH0.Jm-JizLwi3GtfixlCnt-RNN7NlQeyu5Bjsq04aRJte8";

import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
