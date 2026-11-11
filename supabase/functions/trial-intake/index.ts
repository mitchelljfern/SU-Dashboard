import {
  FIELD_LABELS, NICHES, PLAN_LABEL, TEAM, button, deliverableOf, dueFrom, esc, fmtPT, getLead, leadId, logRow,
  promiseOf, promiseText, sendEmail, shell, table, upsertLead, variantOf, type Variant, DASH,
} from "./_shared.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const SID = /^cs_(live|test)_[A-Za-z0-9]{20,}$/;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  // The form asks where this signup stands: who they are (first name only),
  // which form to show, the style they picked, and whether it was already sent.
  if (req.method === "GET") {
    const sid = new URL(req.url).searchParams.get("session_id") ?? "";
    if (!SID.test(sid)) return json({ ok: false, error: "missing session" }, 400);
    const d = (await getLead(leadId(sid)))?.data ?? null;
    if (!d) return json({ ok: true, found: false });
    return json({
      ok: true, found: true,
      firstName: String(d.owner || "").split(" ")[0] || "",
      planKey: d.planKey || "", source: d.nicheKey || "", variant: d.variant || "",
      pickedStyle: d.pickedStyle || "",
      formDone: !!d.formDone, formAt: d.formAt || null, dueAt: d.dueAt || null,
      form: d.form || null,
    });
  }
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
  const sid = String(body.session_id ?? "");
  if (!SID.test(sid)) return json({ ok: false, error: "missing session" }, 400);
  if (body.website_url_hp) return json({ ok: true }); // honeypot

  const form: Record<string, string> = {};
  for (const k of Object.keys(FIELD_LABELS)) if (body[k] && String(body[k]).trim()) form[k] = String(body[k]).trim().slice(0, 4000);
  if (!form.business) return json({ ok: false, error: "name required" }, 400);

  const id = leadId(sid);
  const before = (await getLead(id))?.data ?? null;
  const planKey = String(before?.planKey || body.plan || "websites-starter");
  const source = String(before?.nicheKey || body.source || "site");
  const v = (before?.variant as Variant) || variantOf(planKey, source);

  // First send starts the clock. A later resend updates the answers but keeps
  // the original due time, so resubmitting never buys extra time or costs any.
  const now = new Date();
  const first = !before?.formAt;
  const formAt = first ? now.toISOString() : String(before!.formAt);
  const dueAt = first ? dueFrom(now, v).toISOString() : String(before!.dueAt || dueFrom(new Date(formAt), v).toISOString());

  const data = await upsertLead(id, {
    form, formDone: true, formAt, dueAt,
    lastFormAt: now.toISOString(),
    stage: before?.stage === "trial-delivered" ? "trial-delivered" : "trial-form",
    name: form.business,
    website: form.currentSite ?? before?.website,
    phone: (before?.phone as string) || form.phone,
    stripeSession: sid, source: "trial",
    planKey, nicheKey: source, variant: v,
    ...(before ? {} : {
      added: now.toISOString().slice(0, 10), addedBy: "Free trial", trialStartedAt: now.toISOString(),
      plan: PLAN_LABEL[planKey] ?? planKey, niche: NICHES[source] ?? source,
    }),
  });

  const due = fmtPT(dueAt);
  await sendEmail({
    to: TEAM,
    reply_to: (data.email as string) || undefined,
    subject: `${first ? "Trial details in" : "Trial details updated"}: ${form.business}. ${cap(deliverableOf(v))} due ${due}`,
    html: `<p style="font:15px Arial,sans-serif">${first ? "Trial details are in. The clock just started." : "They updated their details. The original due time stands."}<br><b>${cap(deliverableOf(v))} due: ${esc(due)}</b> (${promiseText(v)})</p>${
      table([
        ["Email", data.email],
        ["Market", data.niche],
        ["Plan", data.plan],
        ["Style picked at checkout", data.pickedStyle],
        ...Object.keys(FIELD_LABELS).map((k) => [FIELD_LABELS[k], form[k]] as [string, unknown]),
      ])
    }<p style="font:13px Arial,sans-serif;color:#5f6675">Copy-ready brief: ${DASH} → Growth → Free Trials.</p>`,
  });

  if (first && data.email) {
    const nm = String(data.owner || form.contactName || "").split(" ")[0];
    await sendEmail({
      to: String(data.email),
      subject: `Got it. Your ${deliverableOf(v)} is due ${fmtPT(dueAt).replace(/^\w+, /, "")}`,
      html: shell(`<p>Hi${nm ? " " + esc(nm) : ""},</p>
<p>Thanks, we have everything we need to start. Your ${deliverableOf(v)} will be in your inbox by <b>${esc(due)}</b>.</p>
<p>Mitchell or Marko may text or call if we have a quick question. Want to add something you forgot? Use the same link to update your answers anytime.</p>
<p>${button(String(data.formUrl || `${DASH}/start/?session_id=${sid}`), "Update my details")}</p>
<p>Mitchell<br>Social Upgrades</p>`),
    });
  }
  await logRow(`${first ? "Trial details submitted" : "Trial details updated"}: ${form.business} (due ${due})`, { leadId: id });
  return json({ ok: true, dueAt, promise: promiseOf(v), first });
});
