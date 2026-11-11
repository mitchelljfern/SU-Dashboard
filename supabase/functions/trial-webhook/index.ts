import Stripe from "npm:stripe@17.4.0";
import {
  NICHES, PLAN_LABEL, TEAM, TRIAL_LINKS, button, clockBox, deliverableOf, esc, formUrl, leadId, logRow,
  promiseText, secret, sendEmail, shell, table, upsertLead, variantOf, getLead,
} from "./_shared.ts";

const stripe = new Stripe("sk_not_used_for_webhooks");
const crypto = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig ?? "", await secret("trial_stripe_whsec"), undefined, crypto);
  } catch (e) {
    console.error("bad signature", e);
    return new Response("bad signature", { status: 400 });
  }
  if (event.type !== "checkout.session.completed") return new Response("ignored");
  const s = event.data.object as Stripe.Checkout.Session;

  // Which trial: the payment link's metadata first, the known-link list second.
  const md = (s.metadata ?? {}) as Record<string, string>;
  const fallback = TRIAL_LINKS[String(s.payment_link ?? "")];
  if (md.offer !== "free-trial-7d" && !fallback) return new Response("not a trial");
  const planKey = md.plan || fallback?.plan || "websites-starter";
  const source = md.source || fallback?.source || "site";
  const v = variantOf(planKey, source);
  const ref = String(s.client_reference_id ?? "");
  const style = ref.startsWith("style-") ? ref.slice(6) : "";

  const email = s.customer_details?.email ?? "";
  const name = s.customer_details?.name ?? "";
  const phone = s.customer_details?.phone ?? "";
  const id = leadId(s.id);
  const now = new Date().toISOString();
  const link = formUrl(s.id, planKey, source);
  const before = await getLead(id);

  const data = await upsertLead(id, {
    name: (before?.data?.name as string) || name || email,
    owner: name,
    email,
    phone: (before?.data?.phone as string) || phone,
    niche: NICHES[source] ?? source,
    nicheKey: source,
    plan: PLAN_LABEL[planKey] ?? planKey,
    planKey,
    variant: v,
    pickedStyle: style,
    source: "trial",
    stage: before?.data?.formDone ? "trial-form" : "trial-started",
    status: "ok",
    addedBy: "Free trial",
    added: now.slice(0, 10),
    trialStartedAt: (before?.data?.trialStartedAt as string) || now,
    stripeSession: s.id,
    stripeCustomer: s.customer,
    stripeSubscription: s.subscription,
    formUrl: link,
    notes: `Started the 7-day free trial from the ${NICHES[source] ?? source} page. Card on file, 7-day Stripe trial.`,
  });
  const formDone = Boolean(data.formDone);

  // The customer gets the form link right away, so closing the tab after
  // checkout never loses it. The 1-hour reminder follows if it is still empty.
  if (email && !formDone) {
    const first = String(name).split(" ")[0];
    await sendEmail({
      to: email,
      subject: "Your free trial is on. One quick step left",
      html: shell(`<p>Hi${first ? " " + esc(first) : ""},</p>
<p>Your 7-day free trial with Social Upgrades has started. To build your ${deliverableOf(v)}, we need a few details from you. It takes about 3 minutes.</p>
${clockBox(v)}
<p>${button(link, "Send my details")}</p>
<p>Questions? Just reply to this email.</p><p>Mitchell<br>Social Upgrades</p>`),
    });
  }

  await sendEmail({
    to: TEAM,
    reply_to: email || undefined,
    subject: `New free trial: ${name || email} (${NICHES[source] ?? source}, ${PLAN_LABEL[planKey] ?? planKey})`,
    html: `<p style="font:15px Arial,sans-serif">Someone just started the 7-day free trial. They've been emailed the details form. The draft is due ${promiseText(v)} after they submit it.</p>${
      table([
        ["Name", name],
        ["Email", email],
        ["Phone", phone],
        ["Market", NICHES[source] ?? source],
        ["Plan", PLAN_LABEL[planKey] ?? planKey],
        ["Style picked", style],
        ["Details form", formDone ? "Already filled in" : "Not yet (reminder goes out after 1 hour)"],
      ])
    }<p style="font:13px Arial,sans-serif;color:#5f6675">It's on the dashboard under Growth → Free Trials.</p>`,
  });
  await logRow(`New free trial: ${name || email} (${NICHES[source] ?? source}, ${PLAN_LABEL[planKey] ?? planKey})`, { leadId: id });
  return new Response("ok");
});
