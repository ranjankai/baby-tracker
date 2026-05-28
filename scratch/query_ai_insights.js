import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://vyaleoetmmxjsykirfop.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5YWxlb2V0bW14anN5a2lyZm9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNTY1MzYsImV4cCI6MjA5MTczMjUzNn0.Qp4nEKv1TW638Yfw_Gx7WfdhVzU_ARsfX0J-ONvX51U'
);

async function check() {
  const { data, error } = await supabase
    .from('ai_insights')
    .select('*')
    .eq('id', 1)
    .single();

  if (error) {
    console.error('Error fetching AI insights:', error);
  } else {
    console.log('AI Insights:');
    console.log(JSON.stringify(data, null, 2));
  }
}

check();
