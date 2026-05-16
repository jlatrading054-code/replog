import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const PROGRAM_SYSTEM_ADDON = `
When you generate a complete multi-day workout program, append ONLY this at the very end of your response — after all your text, on a new line:

JSON_PROGRAM:{"name":"...","description":"...","duration_weeks":12,"days":[...]}

Rules for the JSON_PROGRAM line:
- Must start with exactly "JSON_PROGRAM:" with no space after the colon
- Must be valid JSON on a single line
- Only include when giving a COMPLETE program with multiple days
- day_of_week: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
- type: strength, kb, z2, or rest
- Max 6 exercises per day, short names only
- Always include rest days with empty exercises array
- Do NOT use apostrophes in any string values
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { messages, system, max_tokens, detect_program } = await req.json();

    const fullSystem = detect_program
      ? (system ?? '') + PROGRAM_SYSTEM_ADDON
      : (system ?? '');

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: max_tokens ?? 2000,
        system: fullSystem,
        messages,
      }),
    });

    const data = await response.json();

    let program = null;
    let cleanText = '';

    if (data.content && data.content[0] && data.content[0].text) {
      const text = data.content[0].text;
      const marker = 'JSON_PROGRAM:';
      const markerIdx = text.lastIndexOf(marker);

      if (markerIdx !== -1) {
        const jsonStr = text.slice(markerIdx + marker.length).trim();
        // Take only the first line after the marker
        const firstLine = jsonStr.split('\n')[0].trim();
        try {
          program = JSON.parse(firstLine);
          cleanText = text.slice(0, markerIdx).trim();
        } catch (e) {
          cleanText = text;
        }
      } else {
        cleanText = text;
      }

      data.content[0].text = cleanText;
    }

    return new Response(JSON.stringify({ ...data, program }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
