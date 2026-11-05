/**
 * Marketing content for the individual service pages. Prices are NOT stored
 * here: they are loaded from the Service table by `relatedServiceSlugs` so the
 * owner can change them in the admin area.
 */

export type ServiceFaq = { question: string; answer: string };

export type ServicePageContent = {
  slug: string;
  /** Short name used in cards and navigation. */
  name: string;
  /** H1 on the page. */
  title: string;
  metaTitle: string;
  metaDescription: string;
  /** One-sentence summary for service cards. */
  summary: string;
  intro: string[];
  helpWith: string[];
  whatToExpect: { title: string; text: string }[];
  /** Service catalog slugs whose current prices are shown on this page. */
  relatedServiceSlugs: string[];
  /** Service slug pre-selected on /schedule. */
  scheduleServiceSlug?: string;
  /** Important commitments shown in a highlighted box. */
  commitments?: { title: string; items: string[] };
  faqs: ServiceFaq[];
};

export const SERVICE_PAGES: ServicePageContent[] = [
  {
    slug: "computer-laptop-support",
    name: "Computer & Laptop Support",
    title: "Computer and Laptop Help at Home",
    metaTitle: "Computer & Laptop Support at Home",
    metaDescription:
      "Patient, in-home help with slow computers, email, printers, updates, and new computer setup for seniors and families in Tuscarawas County, Ohio.",
    summary: "Slow computers, email trouble, printers, updates, and setting up a new machine.",
    intro: [
      "Whether your computer has become slow, a printer refuses to cooperate, or you have a brand-new laptop still in the box, we come to your home and work on your own equipment at your kitchen table or desk.",
      "We explain what we are doing as we go, in plain language, and we never rush you. If you would like to learn how to do something yourself next time, we will show you step by step.",
    ],
    helpWith: [
      "Computers that are slow, freezing, or showing unexpected pop-ups",
      "Setting up email and organizing your inbox so important messages are easy to find",
      "Connecting and troubleshooting printers and scanners",
      "Installing Windows and macOS updates safely",
      "Setting up a new desktop or laptop and moving photos and documents from the old one",
      "Organizing files, folders, and desktop shortcuts so things are where you expect",
      "Backing up photos and documents to an external drive or cloud storage you choose",
      "Making text larger and the screen easier to read",
      "Video calling programs such as Zoom so you can see family and attend appointments",
    ],
    whatToExpect: [
      { title: "We listen first", text: "We start by asking what is frustrating you and what you would like your computer to do. You set the priorities for the visit." },
      { title: "We fix and explain", text: "We work through the list together, explaining each step. We ask before installing, removing, or changing anything." },
      { title: "You keep written notes", text: "Before we leave, we can write down what we did and simple steps for the things you want to remember." },
    ],
    relatedServiceSlugs: ["standard-in-home-support", "new-computer-setup", "remote-support"],
    scheduleServiceSlug: "standard-in-home-support",
    faqs: [
      {
        question: "Can you help if I am not sure what is wrong?",
        answer: "Yes. Many visits start with \"it just is not working right.\" We look at the computer with you, find the cause, and explain your options before doing anything.",
      },
      {
        question: "Do you sell computers?",
        answer: "No. We do not sell equipment, so our advice is about what fits your needs. If you are thinking about a new computer, we can talk through what to look for before you buy.",
      },
      {
        question: "Can you repair broken hardware?",
        answer: "We focus on setup, software, and everyday problems. If we find a hardware problem such as a failing hard drive or a cracked screen, we will tell you plainly and explain your options.",
      },
    ],
  },
  {
    slug: "smartphone-tablet-help",
    name: "Smartphone & Tablet Help",
    title: "Smartphone and Tablet Help",
    metaTitle: "Smartphone & Tablet Help and Lessons",
    metaDescription:
      "Friendly one-on-one help with iPhone, Android, iPad, and tablets: calls, texts, photos, video chats, apps, and settings. In-home visits in Tuscarawas County, Ohio.",
    summary: "iPhone, Android, iPad, and tablets: calls, texts, photos, video chats, and apps.",
    intro: [
      "Phones and tablets can do wonderful things, but they also change with every update. We help you get comfortable with your own device so it works the way you want it to.",
      "We work on iPhone, iPad, Android phones and tablets, and e-readers. Whether you need one thing fixed or want a full lesson, we go at your pace.",
    ],
    helpWith: [
      "Making calls, sending text messages, and managing contacts",
      "Taking, organizing, and sharing photos with family",
      "Video calls with FaceTime, WhatsApp, Zoom, or Google Meet",
      "Making text larger, adjusting volume, and turning on hearing and vision accessibility features",
      "Setting up email, calendars, and reminders",
      "Downloading apps you want and removing ones you do not",
      "Moving information from an old phone to a new one",
      "Blocking unwanted callers and silencing spam texts",
      "Setting up a medical ID and emergency contacts on your phone",
    ],
    whatToExpect: [
      { title: "Tell us your goals", text: "We ask what you want to be able to do, such as seeing grandchildren on video or reading the news, and focus on that." },
      { title: "Practice on your device", text: "You hold the phone or tablet. We guide you through each step and repeat as many times as you like." },
      { title: "Notes in your own words", text: "We can leave large-print written steps so you can practice after we leave." },
    ],
    relatedServiceSlugs: ["smartphone-tablet-lesson", "standard-in-home-support", "remote-support"],
    scheduleServiceSlug: "smartphone-tablet-lesson",
    faqs: [
      {
        question: "Can you help with both iPhone and Android?",
        answer: "Yes. We help with Apple iPhone and iPad as well as Android phones and tablets from Samsung, Google, Motorola, and others.",
      },
      {
        question: "Can you help me set up a new phone?",
        answer: "Yes. We can help move contacts, photos, and apps from your old phone, sign in to the accounts you choose, and show you what is different on the new one.",
      },
      {
        question: "Will you need my passwords?",
        answer: "Some setup steps require you to sign in to your own accounts. You type your own passwords, and we can help you store them safely. We never ask for online banking passwords.",
      },
    ],
  },
  {
    slug: "wifi-internet-support",
    name: "Wi-Fi & Internet Support",
    title: "Wi-Fi and Internet Support",
    metaTitle: "Wi-Fi & Home Internet Support",
    metaDescription:
      "In-home help with Wi-Fi that drops, slow internet, router setup, and connecting your devices. Patient technology help in Tuscarawas County, Ohio.",
    summary: "Spotty Wi-Fi, slow internet, routers, and getting every device connected.",
    intro: [
      "When the internet goes down, so do video calls, email, streaming, and many smart devices. We help you understand your home network and get things working reliably again.",
      "We work with the equipment you have from your internet provider and explain, in plain terms, what each box does and what to try first next time.",
    ],
    helpWith: [
      "Wi-Fi that drops out or does not reach certain rooms",
      "Slow internet speeds and finding out whether the problem is at home or with your provider",
      "Setting up a new router or mesh Wi-Fi system",
      "Connecting computers, phones, tablets, TVs, and printers to Wi-Fi",
      "Changing your Wi-Fi name and password to something secure you can remember",
      "Writing down your network information and keeping it in a safe place",
      "Helping you prepare questions before you call your internet provider",
      "Connecting smart speakers, doorbells, and thermostats",
    ],
    whatToExpect: [
      { title: "A walk-through of your setup", text: "We look at your modem, router, and devices and test the connection in the rooms you use most." },
      { title: "Fixes with your permission", text: "We explain what we found and the options, including any equipment you might consider, before changing anything." },
      { title: "A simple reference card", text: "We can leave a written card with your network name, where your equipment is, and what to try if it stops working." },
    ],
    relatedServiceSlugs: ["standard-in-home-support", "remote-support"],
    scheduleServiceSlug: "standard-in-home-support",
    faqs: [
      {
        question: "Can you contact my internet provider for me?",
        answer: "We can sit with you while you call and help explain the problem. Your provider usually needs to speak with the account holder, so you stay in control of the account.",
      },
      {
        question: "Do I need to buy new equipment?",
        answer: "Often, no. Many problems are fixed by moving or restarting equipment or changing settings. If new equipment would help, we explain why and let you decide.",
      },
      {
        question: "Can you make my Wi-Fi more secure?",
        answer: "Yes. We can check that your network has a strong password and current security settings and that the router's own admin password is not still the factory default.",
      },
    ],
  },
  {
    slug: "smart-tv-streaming-setup",
    name: "Smart TV & Streaming Setup",
    title: "Smart TV and Streaming Setup",
    metaTitle: "Smart TV & Streaming Setup Help",
    metaDescription:
      "Help setting up smart TVs, Roku, Fire TV, Apple TV, and streaming apps, simplifying remotes, and finding your favorite shows. In-home help in Tuscarawas County, Ohio.",
    summary: "Smart TVs, Roku, Fire TV, streaming apps, and remotes that make sense.",
    intro: [
      "Watching television used to mean turning it on and picking a channel. Today there are inputs, apps, sign-ins, and two or three remotes. We help make it simple again.",
      "We set up your TV and streaming devices, organize the apps you actually use, and practice with you until changing from the news to a movie feels easy.",
    ],
    helpWith: [
      "Setting up a new smart TV and connecting it to Wi-Fi",
      "Installing and setting up Roku, Amazon Fire TV, Apple TV, or Google TV devices",
      "Signing in to streaming services you already subscribe to",
      "Arranging the home screen so your favorite apps are first",
      "Making sense of multiple remotes and inputs, and setting up a simpler remote when practical",
      "Turning on closed captions and adjusting sound for clearer dialogue",
      "Watching local channels with an antenna or a live TV service",
      "Casting photos and videos from your phone to the TV",
    ],
    whatToExpect: [
      { title: "We set it up", text: "We connect the equipment, check the picture and sound, and sign in to the services you choose." },
      { title: "We simplify", text: "We remove clutter from the home screen and label or set aside remotes you do not need day to day." },
      { title: "You practice", text: "We walk through turning on the TV, finding a show, and getting back to the start, as many times as you like." },
    ],
    relatedServiceSlugs: ["standard-in-home-support"],
    scheduleServiceSlug: "standard-in-home-support",
    faqs: [
      {
        question: "Can you mount my TV on the wall?",
        answer: "We do not mount televisions. We focus on setup, connections, apps, and learning to use it once it is in place.",
      },
      {
        question: "Can you help me decide which streaming services to keep?",
        answer: "Yes. Our Subscription Review & Savings service looks at streaming and other recurring bills with you so you can decide what is worth keeping.",
      },
      {
        question: "Will you sign me up for new services?",
        answer: "Only if you ask us to and approve it. We never sign up for paid services on your behalf without your clear permission.",
      },
    ],
  },
  {
    slug: "technology-lessons",
    name: "Personal Technology Lessons",
    title: "Personal Technology Lessons",
    metaTitle: "Personal Technology Lessons for Seniors",
    metaDescription:
      "One-on-one technology lessons at home, at your pace: phones, tablets, computers, email, video calls, and online safety. Serving Tuscarawas County, Ohio.",
    summary: "One-on-one lessons on your own devices, at your own pace, with written notes.",
    intro: [
      "Learning new technology is easier when someone sits beside you, uses your own device, and does not mind explaining something a second or third time. That is how our lessons work.",
      "There is no set curriculum. We start from what you already know and focus on what you want to do, whether that is sending photos, ordering groceries online, or joining a video call with your doctor.",
    ],
    helpWith: [
      "Getting started with a first smartphone, tablet, or computer",
      "Email: reading, replying, attaching photos, and spotting junk mail",
      "Video calls with family, friends, and telehealth appointments",
      "Photos: taking, organizing, printing, and sharing",
      "Using patient portals, pharmacy apps, and online shopping safely",
      "Reading the news, books, and magazines on a tablet",
      "Using voice assistants to make calls, set reminders, or play music",
      "Creating and safely storing passwords",
      "A series of lessons that builds week by week",
    ],
    whatToExpect: [
      { title: "A relaxed pace", text: "There is no test and no hurry. We repeat steps as often as you need and pause whenever you like." },
      { title: "Your own device", text: "You learn on the phone, tablet, or computer you will actually use, so everything looks familiar afterward." },
      { title: "Written steps to keep", text: "We can leave large-print instructions written for the way your device is set up." },
    ],
    relatedServiceSlugs: ["smartphone-tablet-lesson", "standard-in-home-support", "remote-support"],
    scheduleServiceSlug: "smartphone-tablet-lesson",
    faqs: [
      {
        question: "Can a family member join the lesson?",
        answer: "Of course. Some people like a family member nearby, and others prefer to learn on their own. Whatever is more comfortable for you is fine with us.",
      },
      {
        question: "How many lessons will I need?",
        answer: "It depends on your goals. Some people want one visit to learn a single thing; others enjoy a regular lesson to keep building skills. We will suggest a plan only if you ask.",
      },
      {
        question: "Can lessons happen over the phone?",
        answer: "Yes, for many topics. Remote support works well for follow-up questions once you are comfortable with the basics.",
      },
    ],
  },
  {
    slug: "online-safety-scam-protection",
    name: "Online Safety & Scam Protection",
    title: "Online Safety and Scam Protection",
    metaTitle: "Online Safety & Scam Protection Help",
    metaDescription:
      "Learn to spot scam calls, emails, texts, and pop-ups, secure your accounts, and set up safer devices. Patient, in-home help in Tuscarawas County, Ohio.",
    summary: "Spot scams, secure accounts, and set up safer devices with calm, practical help.",
    intro: [
      "Scammers are persistent and their messages can look very convincing. The best protection is knowing the warning signs and having your devices set up safely. We help with both, calmly and without judgment.",
      "If you think you may have already clicked something or given out information, we can help you take sensible next steps and point you to the right places to report it.",
    ],
    helpWith: [
      "Recognizing scam phone calls, emails, text messages, and fake pop-up warnings",
      "Checking computers and phones for unwanted programs and suspicious settings",
      "Setting up two-step verification on important accounts",
      "Creating strong passwords and a safe way to keep track of them",
      "Reviewing privacy settings on Facebook and other social media",
      "Blocking spam calls and texts on your phone",
      "Removing remote-access programs a scammer may have installed",
      "A simple plan for what to do if something feels wrong",
    ],
    whatToExpect: [
      { title: "A calm conversation", text: "We talk about the calls and messages you receive and the warning signs to watch for. There is no such thing as a silly question." },
      { title: "A safety check", text: "We review your devices and key accounts, explain what we find, and make improvements only with your permission." },
      { title: "A plan you can keep", text: "We can leave written steps, including who to call and what never to share, posted wherever you find them useful." },
    ],
    relatedServiceSlugs: ["standard-in-home-support", "technology-checkup", "remote-support"],
    scheduleServiceSlug: "standard-in-home-support",
    commitments: {
      title: "How we protect you",
      items: [
        "We will never call you unexpectedly asking for remote access to your computer.",
        "We never ask for your online banking password, PIN, or Social Security number.",
        "We only connect remotely when you have scheduled the appointment and given permission.",
      ],
    },
    faqs: [
      {
        question: "I think I fell for a scam. Can you help?",
        answer: "Yes. Call your bank first if money or banking information may be involved. We can then help check your devices, change passwords, and remove anything a scammer installed.",
      },
      {
        question: "Do I need to buy antivirus software?",
        answer: "Not always. Modern computers include solid built-in protection. We will explain what you already have and whether anything more makes sense for you.",
      },
      {
        question: "How can I tell if a call from \"Kindred\" is really you?",
        answer: "We only contact you about appointments you or an authorized family member scheduled, and we never ask for banking passwords. If you are ever unsure, hang up and contact us using the details on our website.",
      },
    ],
  },
  {
    slug: "subscription-review-savings",
    name: "Subscription Review & Savings",
    title: "Subscription Review and Savings",
    metaTitle: "Subscription Review & Savings",
    metaDescription:
      "A guided review of streaming, software, cloud storage, phone, and internet subscriptions so you can decide what to keep. Changes only with your authorization.",
    summary: "A guided look at recurring tech bills so you can decide what to keep or cancel.",
    intro: [
      "Small monthly charges add up: streaming services, antivirus renewals, cloud storage, app subscriptions, and phone and internet plans. Many people are paying for things they no longer use or did not know they had.",
      "We sit down with you, look through your recurring technology charges together, and explain what each one is. You decide what to keep, change, or cancel. If you want help making a change, we walk you through it with your authorization.",
    ],
    helpWith: [
      "Listing your streaming services and how often you actually use them",
      "Finding app and in-app subscriptions on iPhone, iPad, and Android devices",
      "Reviewing antivirus and computer protection renewals",
      "Checking cloud storage plans such as iCloud, Google One, and OneDrive",
      "Understanding your internet, TV, and mobile phone plans",
      "Identifying duplicate services that do the same job",
      "Helping you cancel or downgrade services you decide you no longer want",
      "A written summary of what you have, what changed, and renewal dates to watch",
    ],
    whatToExpect: [
      { title: "Gather what you have", text: "Bring recent statements or bills if you have them. We look at subscriptions you can see on your devices and in the accounts you sign in to." },
      { title: "Review together", text: "We explain each charge in plain language. Nothing is changed during the review unless you specifically authorize it." },
      { title: "A written summary", text: "You receive a summary of your subscriptions, any changes you authorized, and the dates to watch for upcoming renewals." },
    ],
    relatedServiceSlugs: ["subscription-review-savings"],
    scheduleServiceSlug: "subscription-review-savings",
    commitments: {
      title: "Our commitments for every subscription review",
      items: [
        "Your authorization is required before any change. We never cancel, downgrade, or sign up for anything without your clear permission.",
        "We never request or store your online banking passwords.",
        "We do not access your bank, credit card, or other financial accounts. If you choose to look at a statement, you stay in control of it.",
        "Savings are not guaranteed. Some people find several services to cancel; others confirm they already have the right plans.",
      ],
    },
    faqs: [
      {
        question: "Will this definitely save me money?",
        answer: "We cannot guarantee savings. Many people find services they no longer use, but sometimes the review simply confirms you have the right plans, which is useful to know too.",
      },
      {
        question: "Do you need access to my bank account?",
        answer: "No. We never request or store online banking passwords and we do not access financial accounts. You can choose to show us a paper or printed statement if that helps.",
      },
      {
        question: "Can my son or daughter arrange this for me?",
        answer: "Yes. A family member can schedule and pay for the review. The review itself happens with you, and any change requires your authorization.",
      },
    ],
  },
  {
    slug: "technology-checkup",
    name: "Technology Checkup",
    title: "The Kindred Technology Checkup",
    metaTitle: "Technology Checkup for Your Home Devices",
    metaDescription:
      "A thorough review of the health, safety, and setup of your computer, phone, tablet, and Wi-Fi, with a plain-language written summary. Tuscarawas County, Ohio.",
    summary: "A thorough review of your devices and home network with a plain-language summary.",
    intro: [
      "Think of it as a yearly physical for your technology. We look at your devices and home network for problems before they become emergencies, and make sure the important things are backed up and secure.",
      "It is a good choice after a big change, such as a new device or moving into a new home, or simply once a year for peace of mind. Family members often arrange a checkup for a parent who lives on their own.",
    ],
    helpWith: [
      "Checking that computers, phones, and tablets have current updates",
      "Confirming photos and documents are backed up",
      "Reviewing security settings, two-step verification, and passwords",
      "Looking for unwanted programs, browser add-ons, and pop-ups",
      "Testing Wi-Fi coverage and router security",
      "Checking printer, TV, and smart-device connections",
      "Making screens and text easier to read and hear",
      "A plain-language written summary with any recommendations",
    ],
    whatToExpect: [
      { title: "A device-by-device review", text: "We look at each device you want checked and tell you what we find as we go." },
      { title: "Quick fixes with your permission", text: "Small fixes such as updates and settings can usually be handled during the visit, with your approval." },
      { title: "Your written summary", text: "You receive a summary of what we checked, what we changed, and anything worth considering later. There is no pressure to act on it." },
    ],
    relatedServiceSlugs: ["technology-checkup"],
    scheduleServiceSlug: "technology-checkup",
    faqs: [
      {
        question: "How often should I have a checkup?",
        answer: "Once a year works well for most households. Our Kindred Care membership can include an annual checkup; see our pricing page for the current membership benefits.",
      },
      {
        question: "Can my family receive a copy of the summary?",
        answer: "Only if you give permission. You decide which family members can see details about your visits.",
      },
      {
        question: "What if you find something that needs more time?",
        answer: "We will explain it and give you options, including scheduling a follow-up visit. We will not start extra paid work without your approval.",
      },
    ],
  },
];

export function getServicePage(slug: string): ServicePageContent | undefined {
  return SERVICE_PAGES.find((p) => p.slug === slug);
}
