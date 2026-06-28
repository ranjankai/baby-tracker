import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHORTCUT_TOKEN = Deno.env.get("AW_SHORTCUT_TOKEN")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // CORS Handshake
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { token, action, subAction, peeAmount, poopAmount, amountMl } = body;

    // Verify token
    if (!SHORTCUT_TOKEN || token !== SHORTCUT_TOKEN) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const FEED_TYPES = ["mom_l", "mom_r", "top"];

    // ── 1. LOG DIAPER / DIAPER FREE ──────────────────────────────────────────
    if (action === "diaper" || action === "diaper_free") {
      const isDiaperFree = action === "diaper_free";
      const payload = {
        type: "diaper",
        is_diaper_free: isDiaperFree,
        pee_amount: peeAmount || "none",
        poop_amount: poopAmount || "none",
        start_time: new Date().toISOString(),
      };

      const { data, error } = await supabase.from("baby_events").insert([payload]).select().single();
      if (error) throw error;

      return new Response(JSON.stringify({ success: true, event: data, message: isDiaperFree ? "Diaper free logged!" : "Diaper change logged!" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. TIMED ACTIVITIES (Feeds, Massage, Tummy Time) ─────────────────────
    const validActions = ["mom_l", "mom_r", "top", "tummy_time", "massage"];
    if (!validActions.includes(action)) {
      return new Response(JSON.stringify({ error: "Invalid action type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check active session status to respond to iOS menu query
    if (subAction === "status") {
      // Find ongoing session of this type
      const { data: activeEvents, error } = await supabase
        .from("baby_events")
        .select("*")
        .eq("type", action)
        .is("end_time", null)
        .order("start_time", { ascending: false });

      if (error) throw error;
      const active = activeEvents && activeEvents.length > 0 ? activeEvents[0] : null;

      return new Response(JSON.stringify({
        success: true,
        isActive: !!active,
        isPaused: active ? !!active.is_paused : false,
        session: active,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Start a new session
    if (subAction === "start") {
      // Double start check: check if already running
      const { data: running } = await supabase
        .from("baby_events")
        .select("id")
        .eq("type", action)
        .is("end_time", null);

      if (running && running.length > 0) {
        return new Response(JSON.stringify({ error: "Session already active" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Enforce co-occurrence constraints for feeds
      if (FEED_TYPES.includes(action)) {
        const { data: otherActiveFeeds } = await supabase
          .from("baby_events")
          .select("id")
          .in("type", FEED_TYPES)
          .is("end_time", null);

        if (otherActiveFeeds && otherActiveFeeds.length > 0) {
          return new Response(JSON.stringify({ error: "Another feeding session is active" }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Prevent starting Tummy Time or Massage if a feed is active
      if (["tummy_time", "massage"].includes(action)) {
        const { data: activeFeeds } = await supabase
          .from("baby_events")
          .select("id")
          .in("type", FEED_TYPES)
          .is("end_time", null);

        if (activeFeeds && activeFeeds.length > 0) {
          return new Response(JSON.stringify({ error: "Cannot start activity while feeding session is active" }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const payload = {
        type: action,
        start_time: new Date().toISOString(),
      };

      const { data, error } = await supabase.from("baby_events").insert([payload]).select().single();
      if (error) throw error;

      return new Response(JSON.stringify({ success: true, event: data, message: `Started ${action}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pause, Resume, Stop operations require finding the active session
    const { data: activeList, error: activeErr } = await supabase
      .from("baby_events")
      .select("*")
      .eq("type", action)
      .is("end_time", null)
      .order("start_time", { ascending: false });

    if (activeErr) throw activeErr;
    if (!activeList || activeList.length === 0) {
      return new Response(JSON.stringify({ error: "No active session found to modify" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const session = activeList[0];

    if (subAction === "pause") {
      if (session.is_paused) {
        return new Response(JSON.stringify({ success: true, message: "Already paused" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const pausedAt = new Date().toISOString();
      const { data } = await supabase
        .from("baby_events")
        .update({ is_paused: true, paused_at: pausedAt })
        .eq("id", session.id)
        .select()
        .single();

      return new Response(JSON.stringify({ success: true, event: data, message: `Paused ${action}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (subAction === "resume") {
      if (!session.is_paused || !session.paused_at) {
        return new Response(JSON.stringify({ success: true, message: "Not paused" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const pauseDuration = Date.now() - new Date(session.paused_at).getTime();
      const newTotalPaused = (session.total_paused_ms || 0) + pauseDuration;

      const { data } = await supabase
        .from("baby_events")
        .update({ is_paused: false, paused_at: null, total_paused_ms: newTotalPaused })
        .eq("id", session.id)
        .select()
        .single();

      return new Response(JSON.stringify({ success: true, event: data, message: `Resumed ${action}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (subAction === "stop") {
      let totalPaused = session.total_paused_ms || 0;
      let endTime = session.is_paused ? session.paused_at : new Date().toISOString();

      const updates: Record<string, any> = {
        end_time: endTime,
        is_paused: false,
        paused_at: null,
        total_paused_ms: totalPaused,
      };

      if (action === "top" && amountMl) {
        updates.amount_ml = parseInt(amountMl, 10);
      }

      const { data } = await supabase
        .from("baby_events")
        .update(updates)
        .eq("id", session.id)
        .select()
        .single();

      return new Response(JSON.stringify({ success: true, event: data, message: `Stopped ${action}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid subAction" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
