import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://vyaleoetmmxjsykirfop.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5YWxlb2V0bW14anN5a2lyZm9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNTY1MzYsImV4cCI6MjA5MTczMjUzNn0.Qp4nEKv1TW638Yfw_Gx7WfdhVzU_ARsfX0J-ONvX51U'
);

async function check() {
  const { data, error } = await supabase
    .from('baby_events')
    .select('*')
    .eq('type', 'weight')
    .order('start_time', { ascending: false });

  if (error) {
    console.error('Error fetching weights:', error);
  } else {
    console.log(`Found ${data?.length} weight events:`);
    console.log(JSON.stringify(data, null, 2));
  }

  const { count } = await supabase
    .from('baby_events')
    .select('*', { count: 'exact', head: true });
  console.log(`Total baby events: ${count}`);
}

check();
