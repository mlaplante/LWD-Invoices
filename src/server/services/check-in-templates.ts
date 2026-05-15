import { ClientCheckInTouchType } from "@/generated/prisma";

/**
 * Default copy seeded the first time the templates page is opened for an org.
 * The brief is explicit: these should sound human, not "just checking in!" —
 * because the message goes out from a human after edits. Keep them as
 * scaffolds, not finished copy.
 */
export const DEFAULT_TEMPLATES: Record<ClientCheckInTouchType, { subject: string; body: string }> = {
  PROJECT_CLOSE: {
    subject: "Quick thanks — and a small ask",
    body:
      "Hi {{client_first_name}},\n\n" +
      "Wanted to send a proper note now that {{project_name}} is wrapped. " +
      "It was good working with you on this — thanks for trusting me with it.\n\n" +
      "Two small asks if you have a minute:\n" +
      "  • Any feedback on how the project went — good or bad — really helps me improve.\n" +
      "  • If you'd be open to a short testimonial I can put on the site, I'd be grateful.\n" +
      "  • And if anyone in your network might benefit from similar work, an introduction would mean a lot.\n\n" +
      "Either way — thanks again, and let me know if anything comes up.\n\n" +
      "— {{sender_name}}",
  },
  THIRTY_DAY: {
    subject: "How's {{project_name}} holding up?",
    body:
      "Hi {{client_first_name}},\n\n" +
      "It's been about a month since we shipped {{project_name}}. " +
      "Wanted to check in — anything feeling off, breaking, or slower than you'd like?\n\n" +
      "Often the small stuff that's easy to fix only shows up after real use. Happy to take a quick look if you've spotted anything.\n\n" +
      "— {{sender_name}}",
  },
  QUARTERLY: {
    subject: "Thinking of you",
    body:
      "Hi {{client_first_name}},\n\n" +
      "No agenda — just thinking of you and wanted to check in. " +
      "How's {{client_company}} going? Anything interesting on your plate this quarter?\n\n" +
      "I came across [share something genuinely relevant — an article, a tool, a heads-up about something in their stack] " +
      "and thought of you.\n\n" +
      "Let me know how you're doing when you have a minute.\n\n" +
      "— {{sender_name}}",
  },
  ANNUAL: {
    subject: "A year since {{project_name}} — worth a revisit?",
    body:
      "Hi {{client_first_name}},\n\n" +
      "Hard to believe it's been a year since we shipped {{project_name}}. " +
      "I was looking back at it and there are a few things I'd approach differently now that the landscape has moved.\n\n" +
      "If you'd be open to a quick call, I'd love to share what I'd revisit — no expectations, just thought it might be useful.\n\n" +
      "Either way, hope the year's been a good one.\n\n" +
      "— {{sender_name}}",
  },
};

export const TOUCH_TYPE_LABELS: Record<ClientCheckInTouchType, string> = {
  PROJECT_CLOSE: "Project Close",
  THIRTY_DAY: "30-Day Follow-Up",
  QUARTERLY: "Quarterly Check-In",
  ANNUAL: "Annual Revisit",
};

export const TOUCH_TYPE_DESCRIPTIONS: Record<ClientCheckInTouchType, string> = {
  PROJECT_CLOSE: "Sent right after a project ships — thank-you, feedback, testimonial, referral ask.",
  THIRTY_DAY: "One month after delivery — catches small issues before they become resentment.",
  QUARTERLY: "Genuine check-in. Share something relevant. Not a sales pitch.",
  ANNUAL: "One year after shipping — what you'd revisit with fresh eyes.",
};

/**
 * Fill a template with simple context. We deliberately keep this dumb —
 * variables are placeholders for the human to replace, not real interpolation.
 */
export function fillTemplate(
  template: string,
  context: {
    clientName?: string | null;
    clientFirstName?: string | null;
    clientCompany?: string | null;
    projectName?: string | null;
    senderName?: string | null;
  },
): string {
  return template
    .replace(/{{\s*client_name\s*}}/g, context.clientName ?? "[client name]")
    .replace(/{{\s*client_first_name\s*}}/g, context.clientFirstName ?? "there")
    .replace(/{{\s*client_company\s*}}/g, context.clientCompany ?? "[company]")
    .replace(/{{\s*project_name\s*}}/g, context.projectName ?? "[project]")
    .replace(/{{\s*sender_name\s*}}/g, context.senderName ?? "[your name]");
}
