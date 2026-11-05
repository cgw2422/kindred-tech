import { COMMUNITY_FAQS } from "@/lib/community";

export type FaqGroup = { id: string; title: string; items: { question: string; answer: string }[] };

export const FAQ_GROUPS: FaqGroup[] = [
  {
    id: "getting-started",
    title: "Getting started",
    items: [
      {
        question: "What kinds of technology can you help with?",
        answer:
          "Computers and laptops, smartphones and tablets, Wi-Fi and internet, smart TVs and streaming devices, printers, email, video calling, smart speakers, and online safety. If it plugs in or connects to the internet, ask us. We will tell you honestly if it is something we cannot help with.",
      },
      {
        question: "How do I schedule a visit?",
        answer:
          "Use the Schedule a Visit button on any page to choose a service and a time that suits you. We review each request and confirm the appointment with you. You can also send us a message through the contact page.",
      },
      {
        question: "Do you come to my home?",
        answer:
          "Yes. Most of our appointments are in-home visits within our service area. We also offer remote support by phone or secure screen sharing for quick questions and follow-ups.",
      },
      {
        question: "What areas do you serve?",
        answer:
          "In-home visits are available throughout Tuscarawas County, Ohio, including New Philadelphia, Dover, Uhrichsville, Dennison, Sugarcreek, Strasburg, Newcomerstown, and surrounding communities. Community partnerships for senior living and 55+ communities are available across East-Central and Northeast Ohio, within about 75 miles of Gnadenhutten. Our service areas page has the details, and we are happy to confirm whether we can reach you.",
      },
      {
        question: "What should I have ready before my appointment?",
        answer:
          "Have the devices you want help with charged and nearby, any chargers or cables, and a list of questions if you like. If you know the passwords for the accounts involved, such as your email or Apple ID, keep them handy. You will type them in yourself.",
      },
      {
        question: "I am a complete beginner. Is that all right?",
        answer:
          "Absolutely. Many of our customers are new to technology. We start with what you already know, go at your pace, and never make you feel rushed or embarrassed.",
      },
    ],
  },
  {
    id: "pricing-payment",
    title: "Pricing and payment",
    items: [
      {
        question: "How much does a visit cost?",
        answer:
          "Prices for each service are listed on our pricing page. You will know the price before we start, and we always ask before adding time or anything that would change the cost.",
      },
      {
        question: "What happens if we need more time?",
        answer:
          "If we are close to the end of your appointment and you would like to keep going, we will ask first and tell you the price for additional time. You can always schedule a follow-up visit instead.",
      },
      {
        question: "How do I pay?",
        answer:
          "We send an invoice that can be paid securely online by card. Card payments are processed by our payment provider, Stripe; we never see or store your full card number.",
      },
      {
        question: "What is the Kindred Care membership?",
        answer:
          "Kindred Care is an optional monthly plan for households that want ongoing help, such as priority scheduling and a remote support allowance. In-home visits are not unlimited. See the pricing page for the current benefits and price.",
      },
      {
        question: "What if I need to cancel or reschedule?",
        answer:
          "Life happens. Our cancellation policy is listed on the pricing page. Please let us know as early as you can so we can offer the time to someone else.",
      },
    ],
  },
  {
    id: "families",
    title: "For families",
    items: [
      {
        question: "Can I book and pay for a visit for my mother or father?",
        answer:
          "Yes. Family members can schedule appointments and pay invoices on behalf of a loved one. Your parent remains our customer and is the person we work with during the visit.",
      },
      {
        question: "Will I be able to see what was done during my parent's visit?",
        answer:
          "Only if your parent gives permission. Paying for a visit does not automatically share private details. Your parent decides whether family members can receive updates or see service notes, and can change that at any time.",
      },
      {
        question: "Can I be there during the appointment?",
        answer:
          "Of course, if your parent would like you to be. Some people prefer a family member nearby, and others prefer to learn on their own. Either is fine with us.",
      },
    ],
  },
  {
    id: "privacy-safety",
    title: "Privacy and safety",
    items: [
      {
        question: "Will you ask for my passwords?",
        answer:
          "Some tasks require signing in to your own accounts, and you type your own passwords. We never ask for your online banking password, PIN, or Social Security number. If anyone claiming to be us asks for these, do not give them out.",
      },
      {
        question: "Will you look through my personal files and photos?",
        answer:
          "No. We only look at what we need to in order to help with the task you asked for, and we ask before opening anything personal. We never copy your personal files for ourselves.",
      },
      {
        question: "How does remote support work, and is it safe?",
        answer:
          "At your scheduled appointment time we call you. If seeing your screen would help, we ask permission first and guide you through starting a secure screen sharing session that you can end at any time. We never connect without your knowledge.",
      },
      {
        question: "Do you make changes to my accounts or subscriptions without asking?",
        answer:
          "Never. We explain what we recommend and you decide. For subscription reviews, your authorization is required before any change, we do not access your financial accounts, and savings are not guaranteed.",
      },
      {
        question: "Someone called saying my computer has a virus. Was that you?",
        answer:
          "No. We do not make unexpected calls about problems with your computer. That is a very common scam. Hang up, do not let the caller connect to your computer, and contact us or a trusted person if you are worried.",
      },
    ],
  },
  {
    id: "communities",
    title: "Community partnerships",
    items: COMMUNITY_FAQS,
  },
];

export const ALL_FAQS = FAQ_GROUPS.flatMap((g) => g.items);
