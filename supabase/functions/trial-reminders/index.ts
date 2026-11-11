import {
  TEAM, button, clockBox, deliverableOf, esc, fmtPT, formUrl, logRow, sb, secret, sendEmail, shell, upsertLead,
  variantOf, type Variant, DASH,
} from "./_shared.ts";

// Runs every 5 minutes (pg_cron). Two jobs:
//  1. One reminder to a trial signup who still hasn't sent the form after an hour.
//  2. One heads-up to the team 3 hours before a draft is due, if it isn't marked delivered.
Deno.serve(async (req) => {
  if (req.headers.get("x-cron-token") !== (await secret("trial_cron_token"))) {
    return new Response("forbidden", { status: 403 });
  }
  const { data: rows, error } = await sb.from("leads").select("id,data").eq("data->>source", "trial");
  if (error) return new Response(error.message, { status: 500 });

  const now = Date.now();
  let reminded = 0, alerted = 0;
  for (const r of rows ?? []) {
    const d = r.data as Record<string, any>;
    if (d.stage === "test" || d.stage === "trial-cancelled") continue;
    const v = (d.variant as Variant) || variantOf(d.planKey || "", d.nicheKey || "");

    // 1. Form reminder
    if (!d.formDone && !d.reminderSentAt && d.email && d.stripeSession &&
        new Date(d.trialStartedAt).getTime() <= now - 60 * 60 * 1000) {
      const link = String(d.formUrl || "").includes("/start/")
        ? d.formUrl : formUrl(d.stripeSession, d.planKey || "websites-starter", d.nicheKey || "site");
      const first = String(d.owner || "").split(" ")[0];
      const ok = await sendEmail({
        to: d.email,
        subject: "Your free trial is waiting on one quick form",
        html: shell(`<p>Hi${first ? " " + esc(first) : ""},</p>
<p>Your 7-day free trial is already running, but we can't start your ${deliverableOf(v)} until we have a few details. It takes about 3 minutes.</p>
${clockBox(v)}
<p>${button(link, "Send my details")}</p>
<p>Questions? Just reply to this email.</p><p>Mitchell<br>Social Upgrades</p>`),
      });
      if (ok) {
        await upsertLead(r.id, { reminderSentAt: new Date().toISOString(), formUrl: link });
        reminded++;
      }
    }

    // 2. Team heads-up before the deadline
    if (d.formDone && d.dueAt && !d.deliveredAt && !d.dueAlertAt && d.stage !== "trial-delivered") {
      const left = new Date(d.dueAt).getTime() - now;
      if (left <= 3 * 60 * 60 * 1000) {
        const late = left < 0;
        const ok = await sendEmail({
          to: TEAM,
          subject: `${late ? "OVERDUE" : "Due in 3 hours"}: ${d.name} ${deliverableOf(v)} (${fmtPT(d.dueAt)})`,
          html: `<p style="font:15px Arial,sans-serif">${esc(d.name)}'s ${deliverableOf(v)} is ${late ? "past due" : "due soon"}: <b>${esc(fmtPT(d.dueAt))}</b>.</p>
<p style="font:15px Arial,sans-serif">Brief and contact info: ${DASH} → Growth → Free Trials. Mark it delivered there once the preview link is sent.</p>`,
        });
        if (ok) {
          await upsertLead(r.id, { dueAlertAt: new Date().toISOString() });
          await logRow(`Trial draft ${late ? "overdue" : "due in 3 hours"}: ${d.name}`, { leadId: r.id, flag: true });
          alerted++;
        }
      }
    }
  }
  return new Response(JSON.stringify({ reminded, alerted }));
});
