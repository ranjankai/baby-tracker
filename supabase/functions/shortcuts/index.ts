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

const LABELS: Record<string, string> = {
  mom_l:      "Mom (L) Feed",
  mom_r:      "Mom (R) Feed",
  top:        "Top Feed",
  tummy_time: "Tummy Time",
  massage:    "Massage",
};

const FEED_TYPES      = ["mom_l", "mom_r", "top"];
const ALL_TIMED_TYPES = ["mom_l", "mom_r", "top", "tummy_time", "massage"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { token, action, subAction, peeAmount, poopAmount, amountMl } = body;

    // ── Auth ──────────────────────────────────────────────────────────────────
    if (!SHORTCUT_TOKEN || token !== SHORTCUT_TOKEN) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = (payload: object) =>
      new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // ── DIAPER / DIAPER FREE ──────────────────────────────────────────────────
    if (action === "diaper" || action === "diaper_free") {
      const { data, error } = await supabase.from("baby_events").insert([{
        type:           "diaper",
        is_diaper_free: action === "diaper_free",
        pee_amount:     peeAmount  || "none",
        poop_amount:    poopAmount || "none",
        start_time:     new Date().toISOString(),
      }]).select().single();
      if (error) throw error;
      return json({ success: true, message: action === "diaper_free" ? "Diaper free logged!" : "Diaper change logged!" });
    }

    // ── VALIDATE ACTION ───────────────────────────────────────────────────────
    if (!ALL_TIMED_TYPES.includes(action)) {
      return new Response(JSON.stringify({ error: "Invalid action type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── STATUS: is this specific action currently active? ─────────────────────
    if (subAction === "status") {
      const { data } = await supabase.from("baby_events").select("*")
        .eq("type", action).is("end_time", null)
        .order("start_time", { ascending: false });
      const active = data?.[0] || null;
      return json({
        success:  true,
        isActive: !!active,
        isPaused: active ? !!active.is_paused : false,
        session:  active,
      });
    }

    // ── CONF_CHECK: are there any conflicting active sessions? ────────────────
    // Returns { conflict: false } or { conflict: true, conflictType, conflictLabel,
    //   conflictingEventId, isPaused, message }
    if (subAction === "conf_check") {
      const { data: allActive } = await supabase.from("baby_events").select("*")
        .in("type", ALL_TIMED_TYPES).is("end_time", null);
      const active = allActive || [];

      let conflicting: any = null;

      if (FEED_TYPES.includes(action)) {
        // Another feed running
        conflicting = active.find(e => FEED_TYPES.includes(e.type) && e.type !== action)
          // Or tummy/massage blocking a feed
          ?? active.find(e => ["tummy_time", "massage"].includes(e.type));
      }

      if (["tummy_time", "massage"].includes(action)) {
        // A feed blocking tummy/massage (tummy + massage can co-exist)
        conflicting = active.find(e => FEED_TYPES.includes(e.type));
      }

      if (!conflicting) return json({ conflict: false });

      return json({
        conflict:           true,
        conflictType:       conflicting.type,
        conflictLabel:      LABELS[conflicting.type],
        conflictingEventId: conflicting.id,
        isPaused:           !!conflicting.is_paused,
        message:            `${LABELS[conflicting.type]} is ${conflicting.is_paused ? "paused" : "running"}. Stop it?`,
      });
    }

    // ── START: just start — Shortcut has already resolved conflicts ───────────
    if (subAction === "start") {
      // Safety: prevent duplicate session of same type
      const { data: existing } = await supabase.from("baby_events").select("id")
        .eq("type", action).is("end_time", null);
      if (existing && existing.length > 0) {
        return json({ success: false, message: `${LABELS[action]} is already active.` });
      }

      const { data, error } = await supabase.from("baby_events")
        .insert([{ type: action, start_time: new Date().toISOString() }])
        .select().single();
      if (error) throw error;
      return json({ success: true, message: `${LABELS[action]} started!` });
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
      if (session.is_paused) return json({ success: true, message: "Already paused" });
      await supabase.from("baby_events")
        .update({ is_paused: true, paused_at: new Date().toISOString() })
        .eq("id", session.id);
      return json({ success: true, message: `${LABELS[action]} paused!` });
    }

    if (subAction === "resume") {
      if (!session.is_paused || !session.paused_at) return json({ success: true, message: "Not paused" });
      const newTotalPaused = (session.total_paused_ms || 0) + (Date.now() - new Date(session.paused_at).getTime());
      await supabase.from("baby_events")
        .update({ is_paused: false, paused_at: null, total_paused_ms: newTotalPaused })
        .eq("id", session.id);
      return json({ success: true, message: `${LABELS[action]} resumed!` });
    }

    if (subAction === "stop") {
      const endTime = session.is_paused ? session.paused_at : new Date().toISOString();
      const updates: Record<string, any> = {
        end_time:        endTime,
        is_paused:       false,
        paused_at:       null,
        total_paused_ms: session.total_paused_ms || 0,
      };
      if (action === "top" && amountMl) updates.amount_ml = parseInt(amountMl, 10);
      await supabase.from("baby_events").update(updates).eq("id", session.id);
      return json({ success: true, message: `${LABELS[action]} stopped!` });
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
