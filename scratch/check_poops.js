import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://vyaleoetmmxjsykirfop.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5YWxlb2V0bW14anN5a2lyZm9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNTY1MzYsImV4cCI6MjA5MTczMjUzNn0.Qp4nEKv1TW638Yfw_Gx7WfdhVzU_ARsfX0J-ONvX51U'
);

async function check() {
  const thirtyDaysAgo = '2026-04-29T00:00:00.000Z';
  
  // Count total events
  const { count, error: countError } = await supabase
    .from('baby_events')
    .select('*', { count: 'exact', head: true })
    .gte('start_time', thirtyDaysAgo);
    
  if (countError) {
    console.error('Error counting:', countError);
  } else {
    console.log(`Total events in the last 30 days in DB: ${count}`);
  }

  // Fetch with standard query
  const { data, error } = await supabase
    .from('baby_events')
    .select('*')
    .gte('start_time', thirtyDaysAgo)
    .order('start_time', { ascending: true });

  if (error) {
    console.error('Error fetching:', error);
  } else {
    console.log(`Total events returned by select('*') with order ascending: ${data.length}`);
    if (data.length > 0) {
      console.log(`Oldest returned: ${data[0].start_time}`);
      console.log(`Newest returned: ${data[data.length - 1].start_time}`);
    }
  }
}

check();
