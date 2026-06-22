const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.from('system_prompts').select('prompt_text').eq('active', true);
  console.log(JSON.stringify(data, null, 2));
}
run();
