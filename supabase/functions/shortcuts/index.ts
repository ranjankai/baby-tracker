import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHORTCUT_TOKEN            = Deno.env.get("AW_SHORTCUT_TOKEN")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Human-readable labels for Watch prompts ───────────────────────────────────
const LABELS: Record<string, string> = {
  mom_l:      "Mom (L) Feed",
  mom_r:      "Mom (R) Feed",
  top:        "Top Feed",
  tummy_time: "Tummy Time",
  massage:    "Massage",
};

const FEED_TYPES      = ["mom_l", "mom_r", "top"];
const ALL_TIMED_TYPES = ["mom_l", "mom_r", "top", "tummy_time", "massage"];

// ── Helper: stop a session by ID ──────────────────────────────────────────────
async function stopSession(id: number, amountMl?: string) {
  const { data: s } = await supabase.from("baby_events").select("*").eq("id", id).single();
  if (!s) return;

  const endTime = s.is_paused ? s.paused_at : new Date().toISOString();
  const updates: Record<string, any> = {
    end_time:         endTime,
    is_paused:        false,
    paused_at:        null,
    total_paused_ms:  s.total_paused_ms || 0,
  };
  if (s.type === "top" && amountMl) updates.amount_ml = parseInt(amountMl, 10);
  await supabase.from("baby_events").update(updates).eq("id", id);
}

// ── Helper: find first conflicting active session for a given action ──────────
function findConflict(active: any[], action: string): any | null {
  // Self already running
  const self = active.find(e => e.type === action);
  if (self) return self;

  if (FEED_TYPES.includes(action)) {
    // Another feed running
    const otherFeed = active.find(e => FEED_TYPES.includes(e.type) && e.type !== action);
    if (otherFeed) return otherFeed;
    // Tummy or Massage blocking a feed
    const blocker = active.find(e => ["tummy_time", "massage"].includes(e.type));
    if (blocker) return blocker;
  }

  if (["tummy_time", "massage"].includes(action)) {
    // A feed blocking tummy/massage
    const blockingFeed = active.find(e => FEED_TYPES.includes(e.type));
    if (blockingFeed) return blockingFeed;
    // Note: tummy + massage CAN run together — no conflict between them
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { token, action, subAction, peeAmount, poopAmount, amountMl, conflictingEventId } = body;

    // Auth
    if (!SHORTCUT_TOKEN || token !== SHORTCUT_TOKEN) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DIAPER / DIAPER FREE (no conflict logic needed) ───────────────────────
    if (action === "diaper" || action === "diaper_free") {
      const { data, error } = await supabase.from("baby_events").insert([{
        type:          "diaper",
        is_diaper_free: action === "diaper_free",
        pee_amount:    peeAmount  || "none",
        poop_amount:   poopAmount || "none",
        start_time:    new Date().toISOString(),
      }]).select().single();
      if (error) throw error;
      return new Response(JSON.stringify({
        success: true,
        message: action === "diaper_free" ? "Diaper free logged!" : "Diaper change logged!",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── VALIDATE ACTION ───────────────────────────────────────────────────────
    if (!ALL_TIMED_TYPES.includes(action)) {
      return new Response(JSON.stringify({ error: "Invalid action type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── STATUS ────────────────────────────────────────────────────────────────
    if (subAction === "status") {
      const { data: activeEvents } = await supabase
        .from("baby_events").select("*")
        .eq("type", action).is("end_time", null)
        .order("start_time", { ascending: false });
      const active = activeEvents?.[0] || null;
      return new Response(JSON.stringify({
        success:  true,
        isActive: !!active,
        isPaused: active ? !!active.is_paused : false,
        session:  active,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── START — smart conflict detection ──────────────────────────────────────
    if (subAction === "start") {
      const { data: allActive } = await supabase
        .from("baby_events").select("*")
        .in("type", ALL_TIMED_TYPES).is("end_time", null);

      const conflict = findConflict(allActive || [], action);

      if (conflict) {
        const isSelf = conflict.type === action;
        return new Response(JSON.stringify({
          conflict:           true,
          conflictType:       conflict.type,
          conflictLabel:      LABELS[conflict.type],
          conflictingEventId: conflict.id,
          isPaused:           !!conflict.is_paused,
          message:            isSelf
            ? `${LABELS[action]} is already ${conflict.is_paused ? "paused" : "running"}.`
            : `${LABELS[conflict.type]} is ${conflict.is_paused ? "paused" : "running"}. Stop it and start ${LABELS[action]}?`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // No conflict — start cleanly
      const { data, error } = await supabase
        .from("baby_events")
        .insert([{ type: action, start_time: new Date().toISOString() }])
        .select().single();
      if (error) throw error;
      return new Response(JSON.stringify({
        success: true, message: `${LABELS[action]} started!`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── FORCE_START — stop conflict then start ────────────────────────────────
    // Called after user confirms "Yes, stop X and start Y" on the Watch
    if (subAction === "force_start") {
      if (conflictingEventId) {
        await stopSession(conflictingEventId, amountMl);
      }
      const { data, error } = await supabase
        .from("baby_events")
        .insert([{ type: action, start_time: new Date().toISOString() }])
        .select().single();
      if (error) throw error;
      return new Response(JSON.stringify({
        success: true, message: `${LABELS[action]} started!`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── PAUSE / RESUME / STOP — find active session first ────────────────────
    const { data: activeList, error: activeErr } = await supabase
      .from("baby_events").select("*")
      .eq("type", action).is("end_time", null)
      .order("start_time", { ascending: false });
    if (activeErr) throw activeErr;
    if (!activeList || activeList.length === 0) {
      return new Response(JSON.stringify({ error: `No active ${LABELS[action]} session found` }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const session = activeList[0];

    if (subAction === "pause") {
      if (session.is_paused) {
        return new Response(JSON.stringify({ success: true, message: "Already paused" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await supabase.from("baby_events")
        .update({ is_paused: true, paused_at: new Date().toISOString() })
        .eq("id", session.id);
      return new Response(JSON.stringify({ success: true, message: `${LABELS[action]} paused!` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (subAction === "resume") {
      if (!session.is_paused || !session.paused_at) {
        return new Response(JSON.stringify({ success: true, message: "Not paused" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const pauseDuration  = Date.now() - new Date(session.paused_at).getTime();
      const newTotalPaused = (session.total_paused_ms || 0) + pauseDuration;
      await supabase.from("baby_events")
        .update({ is_paused: false, paused_at: null, total_paused_ms: newTotalPaused })
        .eq("id", session.id);
      return new Response(JSON.stringify({ success: true, message: `${LABELS[action]} resumed!` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (subAction === "stop") {
      await stopSession(session.id, amountMl);
      return new Response(JSON.stringify({ success: true, message: `${LABELS[action]} stopped!` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid subAction" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
