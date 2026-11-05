/**
 * Default email templates. These are seeded into the EmailTemplate table and
 * can be edited from Admin > Email Templates. Keys are referenced in code.
 */
export type DefaultTemplate = {
  key: string;
  name: string;
  description: string;
  category: "TRANSACTIONAL" | "MARKETING";
  subject: string;
  body: string;
  sampleVars: Record<string, string>;
};

const sharedSample = {
  businessName: "Kindred Tech Support",
  businessPhone: "(330) 555-0100",
  customerName: "Margaret",
  appointmentDate: "Tuesday, November 10, 2026",
  appointmentTime: "10:00 AM",
  serviceName: "Standard In-Home Support",
  appointmentReference: "KT7Q4M",
  manageUrl: "https://example.com/appointments/manage?token=sample",
  technicianName: "Your technician",
};

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    key: "booking_received",
    name: "Booking request received",
    description: "Sent immediately when someone submits a booking request.",
    category: "TRANSACTIONAL",
    subject: "We received your request ({{appointmentReference}})",
    body: `Hello {{customerName}},

Thank you for contacting {{businessName}}. We received your request for **{{serviceName}}** on **{{appointmentDate}} at {{appointmentTime}}**.

{{approvalNote}}

Your reference number is **{{appointmentReference}}**. If you need to change or cancel, you can use the link below.

[[button:View or change my appointment|{{manageUrl}}]]

If you have questions, simply reply to this email{{phoneSentence}}.

Warm regards,
{{businessName}}`,
    sampleVars: { ...sharedSample, approvalNote: "We will review your request and confirm your appointment shortly.", phoneSentence: " or call us at (330) 555-0100" },
  },
  {
    key: "appointment_confirmed",
    name: "Appointment confirmation",
    description: "Sent when an appointment is confirmed by staff (or automatically).",
    category: "TRANSACTIONAL",
    subject: "Your appointment is confirmed for {{appointmentDate}}",
    body: `Hello {{customerName}},

Good news. Your appointment is confirmed.

- **Service:** {{serviceName}}
- **Date:** {{appointmentDate}}
- **Time:** {{appointmentTime}}
- **Location:** {{appointmentLocation}}

Before we arrive, it helps to have any passwords you know written down and your devices charged. Please never share banking passwords with anyone, including us.

[[button:View or change my appointment|{{manageUrl}}]]

We look forward to seeing you.

{{businessName}}`,
    sampleVars: { ...sharedSample, appointmentLocation: "123 Main St, New Philadelphia" },
  },
  {
    key: "appointment_reminder",
    name: "Appointment reminder",
    description: "Sent before an upcoming appointment (timing set in Settings).",
    category: "TRANSACTIONAL",
    subject: "Reminder: {{serviceName}} on {{appointmentDate}}",
    body: `Hello {{customerName}},

This is a friendly reminder of your upcoming appointment.

- **Service:** {{serviceName}}
- **Date:** {{appointmentDate}}
- **Time:** {{appointmentTime}}

[[button:View or change my appointment|{{manageUrl}}]]

See you soon,
{{businessName}}`,
    sampleVars: sharedSample,
  },
  {
    key: "appointment_rescheduled",
    name: "Appointment rescheduled",
    description: "Sent when an appointment time changes.",
    category: "TRANSACTIONAL",
    subject: "Your appointment has a new time",
    body: `Hello {{customerName}},

Your appointment has been moved to **{{appointmentDate}} at {{appointmentTime}}**.

[[button:View my appointment|{{manageUrl}}]]

If this new time does not work for you, please let us know.

{{businessName}}`,
    sampleVars: sharedSample,
  },
  {
    key: "appointment_canceled",
    name: "Appointment canceled",
    description: "Sent when an appointment is canceled.",
    category: "TRANSACTIONAL",
    subject: "Your appointment has been canceled",
    body: `Hello {{customerName}},

Your appointment for **{{serviceName}}** on {{appointmentDate}} at {{appointmentTime}} has been canceled.

Whenever you are ready, we would be glad to help.

[[button:Schedule a new visit|{{bookingUrl}}]]

{{businessName}}`,
    sampleVars: { ...sharedSample, bookingUrl: "https://example.com/schedule" },
  },
  {
    key: "technician_en_route",
    name: "Technician on the way",
    description: "Sent when the technician marks the appointment En Route.",
    category: "TRANSACTIONAL",
    subject: "{{technicianName}} is on the way",
    body: `Hello {{customerName}},

{{technicianName}} from {{businessName}} is on the way to your {{appointmentTime}} appointment.

{{etaSentence}}

See you shortly.`,
    sampleVars: { ...sharedSample, etaSentence: "" },
  },
  {
    key: "appointment_completed",
    name: "Appointment completed",
    description: "Sent after a visit is completed.",
    category: "TRANSACTIONAL",
    subject: "Thank you for choosing {{businessName}}",
    body: `Hello {{customerName}},

Thank you for having us today. Here is a short summary of what we worked on:

{{visitSummary}}

If anything is not working the way you expect, please reach out. We are happy to help.

{{businessName}}`,
    sampleVars: { ...sharedSample, visitSummary: "Set up email on your new tablet and practiced video calls." },
  },
  {
    key: "invoice_issued",
    name: "Invoice issued",
    description: "Sent when an invoice is issued.",
    category: "TRANSACTIONAL",
    subject: "Invoice {{invoiceNumber}} from {{businessName}}",
    body: `Hello {{customerName}},

Your invoice **{{invoiceNumber}}** for **{{invoiceTotal}}** is ready. Payment is due by {{invoiceDueDate}}.

[[button:View invoice|{{invoiceUrl}}]]

{{paymentInstructions}}

Thank you,
{{businessName}}`,
    sampleVars: { ...sharedSample, invoiceNumber: "KTS-2026-0001", invoiceTotal: "$99", invoiceDueDate: "November 24, 2026", invoiceUrl: "https://example.com/pay/sample", paymentInstructions: "" },
  },
  {
    key: "payment_receipt",
    name: "Payment receipt",
    description: "Sent when a payment is verified.",
    category: "TRANSACTIONAL",
    subject: "Payment received: {{paymentAmount}}",
    body: `Hello {{customerName}},

We received your payment of **{{paymentAmount}}** for invoice {{invoiceNumber}}. Thank you.

{{businessName}}`,
    sampleVars: { ...sharedSample, paymentAmount: "$99", invoiceNumber: "KTS-2026-0001" },
  },
  {
    key: "review_request",
    name: "Review request",
    description: "Optional request for feedback after a completed visit.",
    category: "TRANSACTIONAL",
    subject: "How did we do?",
    body: `Hello {{customerName}},

Thank you again for choosing {{businessName}}. If you have a moment, we would be grateful for your honest feedback.

[[button:Share feedback|{{reviewUrl}}]]

{{businessName}}`,
    sampleVars: { ...sharedSample, reviewUrl: "https://example.com/review" },
  },
  {
    key: "membership_welcome",
    name: "Membership welcome",
    description: "Sent when a Kindred Care membership becomes active.",
    category: "TRANSACTIONAL",
    subject: "Welcome to {{planName}}",
    body: `Hello {{customerName}},

Welcome to **{{planName}}**. Your membership is active.

Your benefits include:

{{benefitsList}}

[[button:View my membership|{{portalUrl}}]]

{{businessName}}`,
    sampleVars: { ...sharedSample, planName: "Kindred Care", benefitsList: "- Priority scheduling\n- Remote support allowance", portalUrl: "https://example.com/portal" },
  },
  {
    key: "payment_failed",
    name: "Payment failure",
    description: "Sent when a recurring membership payment fails.",
    category: "TRANSACTIONAL",
    subject: "We could not process your payment",
    body: `Hello {{customerName}},

We were not able to process the payment for your {{planName}} membership. This sometimes happens when a card expires.

[[button:Update payment details|{{billingUrl}}]]

If you have questions, please contact us. We are glad to help.

{{businessName}}`,
    sampleVars: { ...sharedSample, planName: "Kindred Care", billingUrl: "https://example.com/portal/membership" },
  },
  {
    key: "facility_inquiry_received",
    name: "Facility inquiry received",
    description: "Sent to a senior living community after they submit the partnership form.",
    category: "TRANSACTIONAL",
    subject: "Thank you for your interest in a Kindred partnership",
    body: `Hello {{contactName}},

Thank you for reaching out on behalf of **{{facilityName}}**. We will contact you within two business days to learn about your residents and discuss which partnership option fits best.

{{businessName}}`,
    sampleVars: { ...sharedSample, contactName: "Pat", facilityName: "Example Senior Living" },
  },
  {
    key: "tech_help_day_confirmed",
    name: "Tech Help Day confirmation",
    description: "Sent to a facility contact when a Tech Help Day is confirmed.",
    category: "TRANSACTIONAL",
    subject: "Tech Help Day confirmed: {{helpDayDate}}",
    body: `Hello {{contactName}},

Your Tech Help Day at **{{facilityName}}** is confirmed.

- **Date:** {{helpDayDate}}
- **Time:** {{helpDayTime}}
- **Location:** {{helpDayLocation}}

Residents can reserve a time with the link below, or you may share it in your newsletter.

[[button:Resident sign-up page|{{signupUrl}}]]

{{businessName}}`,
    sampleVars: { ...sharedSample, contactName: "Pat", facilityName: "Example Senior Living", helpDayDate: "Thursday, November 12, 2026", helpDayTime: "1:00 PM to 4:00 PM", helpDayLocation: "Community Room", signupUrl: "https://example.com/help-days/sample" },
  },
  {
    key: "facility_contract_renewal",
    name: "Facility contract renewal reminder",
    description: "Sent ahead of a facility agreement renewal date.",
    category: "TRANSACTIONAL",
    subject: "Your Kindred partnership renews on {{renewalDate}}",
    body: `Hello {{contactName}},

Your partnership agreement for **{{facilityName}}** is scheduled to renew on **{{renewalDate}}**.

If you would like to make any changes to your schedule or services, please reply to this email and we will arrange a time to talk.

{{businessName}}`,
    sampleVars: { ...sharedSample, contactName: "Pat", facilityName: "Example Senior Living", renewalDate: "January 1, 2027" },
  },
  {
    key: "password_reset",
    name: "Password reset / sign-in link",
    description: "Account recovery and email sign-in links.",
    category: "TRANSACTIONAL",
    subject: "Your {{businessName}} sign-in link",
    body: `Hello {{customerName}},

Use the button below to {{actionText}}. This link expires in {{expiresIn}} and can be used once.

[[button:{{buttonLabel}}|{{actionUrl}}]]

If you did not request this, you can ignore this email.

{{businessName}}`,
    sampleVars: { ...sharedSample, actionText: "reset your password", expiresIn: "1 hour", buttonLabel: "Reset password", actionUrl: "https://example.com/reset" },
  },
  {
    key: "admin_new_booking",
    name: "Staff notification: new booking",
    description: "Sent to the admin notification address when a booking request arrives.",
    category: "TRANSACTIONAL",
    subject: "New booking request {{appointmentReference}}",
    body: `A new booking request was submitted.

- **Service:** {{serviceName}}
- **When:** {{appointmentDate}} at {{appointmentTime}}
- **Customer:** {{customerName}}
- **Area check:** {{areaNote}}

[[button:Open in admin|{{adminUrl}}]]`,
    sampleVars: { ...sharedSample, areaNote: "Inside service area", adminUrl: "https://example.com/admin/appointments/sample" },
  },
  {
    key: "admin_new_lead",
    name: "Staff notification: new lead",
    description: "Sent to the admin notification address when a community partnership inquiry or contact message arrives.",
    category: "TRANSACTIONAL",
    subject: "New {{leadType}}: {{leadName}}",
    body: `A new {{leadType}} was submitted on the website.

- **From:** {{leadName}}
- **Details:** {{leadSummary}}

[[button:Open in admin|{{adminUrl}}]]`,
    sampleVars: { ...sharedSample, leadType: "community partnership inquiry", leadName: "Example Senior Living (Pat Example)", leadSummary: "Independent living community, Dover, OH, about 120 residents, monthly visits", adminUrl: "https://example.com/admin/facilities?tab=inquiries" },
  },
  {
    key: "newsletter_general",
    name: "General announcement (marketing)",
    description: "Example marketing template. Only sent to customers who opted in; includes an unsubscribe link.",
    category: "MARKETING",
    subject: "News from {{businessName}}",
    body: `Hello {{customerName}},

{{messageBody}}

{{businessName}}`,
    sampleVars: { ...sharedSample, messageBody: "Seasonal tips for keeping your devices safe." },
  },
];
