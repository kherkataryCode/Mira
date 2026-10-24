import type { QuizQuestion } from './schema.js';

export interface LessonSeed {
  slug: string;
  topic: string;
  title: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  minutes: number;
  summary: string;
  explanation: string;
  example: string;
  takeaway: string;
  quiz: QuizQuestion[];
  artSeed: number;
}

/** Original curriculum written for Friday. Plain-language, practical, short. */
export const LESSONS: LessonSeed[] = [
  {
    slug: 'zero-trust-basics',
    topic: 'cybersecurity',
    title: 'Zero Trust Architecture',
    level: 'beginner',
    minutes: 5,
    summary: 'Why "never trust, always verify" replaced the idea of a safe internal network.',
    explanation:
      'Older networks worked like a castle: once you were inside the wall (the office network or VPN), you were trusted. Zero Trust drops that assumption. Every request — from a laptop, a server or a phone — has to prove who it is and that it is allowed to do this specific thing, every time. Access is granted per application rather than per network, permissions are kept as small as possible, and activity is continuously checked for anything unusual.',
    example:
      'An employee on the office Wi-Fi opens the payroll app. Under Zero Trust the app still checks their identity with single sign-on and a second factor, confirms their laptop is managed and patched, and only shows the payroll screens their role needs — exactly as if they were working from a café.',
    takeaway: 'Location is not identity. Verify each request, grant the least access needed, and assume a breach could already be underway.',
    quiz: [
      { q: 'What does Zero Trust stop relying on?', options: ['Passwords', 'Being inside the network perimeter', 'Encryption', 'Logging'], answer: 1, why: 'Zero Trust removes implicit trust based on network location.' },
      { q: 'Which principle limits damage if an account is compromised?', options: ['Least privilege', 'Single sign-on', 'Open ports', 'Shared admin accounts'], answer: 0, why: 'Least privilege means a stolen account can only reach what it strictly needs.' },
      { q: 'Under Zero Trust, a request from the office network is…', options: ['Automatically trusted', 'Verified like any other request', 'Blocked', 'Logged but never checked'], answer: 1, why: 'Every request is verified regardless of where it comes from.' },
    ],
    artSeed: 1,
  },
  {
    slug: 'phishing-red-flags',
    topic: 'cybersecurity',
    title: 'Spotting Phishing in 30 Seconds',
    level: 'beginner',
    minutes: 4,
    summary: 'A quick mental checklist for suspicious messages.',
    explanation:
      'Phishing messages try to rush you into clicking, paying or sharing a code. Look at four things: the real sender address (not just the display name), whether the message creates urgency or fear, whether the link destination matches the organisation it claims to be, and whether it asks for something unusual such as a one-time code or a gift-card payment. When in doubt, open the official app or website yourself instead of using the link.',
    example:
      '"Your account will be locked in 2 hours — verify now" arrives from support@paypa1-secure.com. The urgency, the look-alike domain and the request to verify credentials are three red flags. Opening the real app shows no warning at all.',
    takeaway: 'Slow down. Check the sender, the link destination and the request. Use your own route to the real service.',
    quiz: [
      { q: 'Which is the strongest sign of phishing?', options: ['A company logo', 'Urgent pressure plus a look-alike domain', 'A polite greeting', 'A long email'], answer: 1, why: 'Urgency combined with a spoofed domain is a classic pattern.' },
      { q: 'A message asks for the 6-digit code you just received. You should…', options: ['Send it quickly', 'Never share it', 'Share only the first 3 digits', 'Reply asking why'], answer: 1, why: 'One-time codes are meant only for you; sharing one hands over your account.' },
    ],
    artSeed: 2,
  },
  {
    slug: 'power-of-compounding',
    topic: 'finance',
    title: 'The Power of Compounding',
    level: 'beginner',
    minutes: 6,
    summary: 'How growth on growth turns time into your biggest financial ally.',
    explanation:
      'Compounding means you earn returns not only on what you put in, but also on the returns you have already earned. The effect is small at first and large later, which is why starting early matters more than starting big. The "rule of 72" gives a quick estimate: divide 72 by the annual growth rate to find roughly how many years it takes money to double.',
    example:
      'Investing ₹10,000 a year at an assumed 8% annual return: after 10 years the total is about ₹1.56 lakh, of which ₹1 lakh is your contributions. After 30 years it is about ₹12.2 lakh, of which only ₹3 lakh is contributions — most of the balance is growth on growth. (Illustrative maths, not a forecast or advice.)',
    takeaway: 'Time multiplies consistent saving. Start early, stay consistent, and keep costs low so they do not compound against you.',
    quiz: [
      { q: 'Using the rule of 72, money growing at 9% a year doubles in about…', options: ['4 years', '8 years', '12 years', '72 years'], answer: 1, why: '72 ÷ 9 = 8.' },
      { q: 'Why does starting early matter so much?', options: ['Interest rates are higher for young people', 'Returns have more time to earn returns', 'Taxes are lower', 'It does not matter'], answer: 1, why: 'Compounding needs time; growth builds on earlier growth.' },
    ],
    artSeed: 3,
  },
  {
    slug: 'emergency-fund',
    topic: 'finance',
    title: 'Building an Emergency Fund',
    level: 'beginner',
    minutes: 4,
    summary: 'A simple buffer that protects every other financial goal.',
    explanation:
      'An emergency fund is money set aside for surprises — a job gap, a medical bill, an urgent repair. A common guideline is three to six months of essential expenses, kept somewhere safe and easy to reach rather than invested in volatile assets. Building it in small automatic steps works better than waiting for a large lump sum.',
    example:
      'If essential monthly costs are ₹40,000, a three-month target is ₹1.2 lakh. Automatically moving ₹8,000 on payday into a separate savings account reaches the target in 15 months without relying on willpower.',
    takeaway: 'Know your essential monthly costs, set a 3–6 month target, and automate small transfers until you get there.',
    quiz: [
      { q: 'An emergency fund should usually be kept…', options: ['In volatile stocks', 'Somewhere safe and accessible', 'Lent to friends', 'In a locked fixed deposit for 10 years'], answer: 1, why: 'It must be available quickly without large losses.' },
      { q: 'A common target size is…', options: ['One week of spending', '3–6 months of essential expenses', '5 years of income', 'Whatever is left at month end'], answer: 1, why: 'Three to six months covers most short-term shocks.' },
    ],
    artSeed: 4,
  },
  {
    slug: 'ai-in-everyday-life',
    topic: 'technology',
    title: 'AI in Everyday Life',
    level: 'beginner',
    minutes: 6,
    summary: 'What today\'s AI assistants actually do — and where they still fall short.',
    explanation:
      'Large language models predict likely text based on patterns learned from huge amounts of writing. That makes them good at drafting, summarising, translating and explaining. They do not "know" facts the way a database does, so they can state wrong things confidently. Useful habits: give clear context, ask for sources when facts matter, verify anything important, and avoid pasting sensitive personal or company data into tools you do not control.',
    example:
      'Asking an assistant to "summarise this 10-page report into five bullet points for my manager" plays to its strengths. Asking it "what was our Q3 revenue?" without giving it the report invites a confident guess.',
    takeaway: 'Use AI for drafting and understanding; verify facts, and keep sensitive data out of tools you do not trust.',
    quiz: [
      { q: 'Language models are strongest at…', options: ['Guaranteeing facts', 'Drafting and summarising text', 'Replacing databases', 'Keeping secrets'], answer: 1, why: 'They excel at language tasks, not guaranteed factual recall.' },
      { q: 'Before relying on an AI-provided fact, you should…', options: ['Trust it if it sounds confident', 'Verify it with a reliable source', 'Ask the same question twice', 'Ignore it'], answer: 1, why: 'Confidence is not accuracy; verify important facts.' },
    ],
    artSeed: 5,
  },
  {
    slug: 'passkeys-explained',
    topic: 'technology',
    title: 'Passkeys, Explained',
    level: 'intermediate',
    minutes: 5,
    summary: 'Why passwordless sign-in is both easier and safer.',
    explanation:
      'A passkey replaces a password with a pair of cryptographic keys. The private key stays on your device (protected by your fingerprint, face or PIN); the website only stores the public key. When you sign in, your device proves it holds the private key for that exact website. Because nothing secret is typed or stored on the server, passkeys resist phishing and are useless to attackers who steal a website\'s database.',
    example:
      'You visit a look-alike phishing site. Your password manager might autofill a password if you are careless, but your passkey simply will not work, because it is bound to the real site\'s domain.',
    takeaway: 'Turn on passkeys where offered: they are bound to the real site, cannot be reused elsewhere, and nothing secret sits on the server.',
    quiz: [
      { q: 'Where is the passkey\'s private key kept?', options: ['On the website\'s server', 'On your device', 'In your email', 'In the browser history'], answer: 1, why: 'Only the public key is shared with the site.' },
      { q: 'Why do passkeys resist phishing?', options: ['They are longer', 'They are bound to the real website domain', 'They expire daily', 'They are emailed to you'], answer: 1, why: 'A passkey only works on the domain it was created for.' },
    ],
    artSeed: 6,
  },
  {
    slug: 'better-communication',
    topic: 'communication',
    title: 'Better Communication: Lead With the Point',
    level: 'beginner',
    minutes: 4,
    summary: 'A simple structure that makes messages easier to act on.',
    explanation:
      'Busy readers decide within a sentence or two whether a message matters. Put the conclusion or request first, then the reason, then the detail. Make the ask specific (who, what, by when). If a message needs more than a short scroll, add a one-line summary at the top.',
    example:
      'Instead of a paragraph about vendor history ending in a question, write: "Can you approve the ₹2.4L renewal with Vendor X by Friday? It keeps our current rate; the alternative is 18% more. Details below."',
    takeaway: 'Answer first, reason second, detail last — and make every request specific about who, what and when.',
    quiz: [
      { q: 'What should come first in a work message?', options: ['Background history', 'The main point or request', 'A long greeting', 'Attachments'], answer: 1, why: 'Leading with the point lets readers act quickly.' },
      { q: 'A specific request includes…', options: ['Who, what, and by when', 'Only the topic', 'An apology', 'Many options'], answer: 0, why: 'Clear owner, action and deadline make requests actionable.' },
    ],
    artSeed: 7,
  },
  {
    slug: 'active-listening',
    topic: 'communication',
    title: 'Active Listening in Meetings',
    level: 'intermediate',
    minutes: 5,
    summary: 'Three habits that make people feel heard and reduce misunderstandings.',
    explanation:
      'Active listening means focusing on understanding before responding. Three practical habits: reflect back what you heard in your own words, ask one clarifying question before offering solutions, and name the agreed next step out loud before the meeting ends. These small moves catch misunderstandings early and build trust.',
    example:
      '"So the main blocker is the data export, not the design — is that right?" … "Okay, next step: Priya shares the export spec by Wednesday, and I review it Thursday."',
    takeaway: 'Reflect, clarify, then confirm next steps aloud. Understanding first, solutions second.',
    quiz: [
      { q: 'Reflecting back means…', options: ['Repeating word for word', 'Summarising what you heard in your own words', 'Disagreeing politely', 'Taking notes silently'], answer: 1, why: 'Paraphrasing checks understanding.' },
      { q: 'Before ending a meeting you should…', options: ['Leave quickly', 'State the agreed next step and owner', 'Schedule another meeting', 'Send slides'], answer: 1, why: 'Naming next steps prevents drift.' },
    ],
    artSeed: 8,
  },
  {
    slug: 'time-blocking',
    topic: 'productivity',
    title: 'Time Blocking That Survives Reality',
    level: 'beginner',
    minutes: 4,
    summary: 'Plan your day in blocks — with buffers for the unexpected.',
    explanation:
      'Time blocking assigns tasks to specific slots in your calendar instead of keeping an open-ended list. It works best when you protect one deep-work block early in the day, batch small tasks together, and leave buffer blocks for interruptions. At the end of the day, move unfinished work deliberately instead of letting it silently roll over.',
    example:
      '9:30–11:00 deep work: finish OT security report. 11:00–11:30 buffer. 14:00–14:45 emails and quick replies. 17:30 review and plan tomorrow.',
    takeaway: 'Protect one deep-work block, batch small tasks, and keep buffers — plans fail without slack.',
    quiz: [
      { q: 'Buffer blocks are for…', options: ['Extra meetings', 'Absorbing interruptions and overruns', 'Social media', 'Nothing'], answer: 1, why: 'Buffers keep the plan realistic.' },
      { q: 'Unfinished tasks at day end should be…', options: ['Ignored', 'Moved deliberately to a new slot', 'Deleted', 'Marked done'], answer: 1, why: 'Conscious rescheduling keeps priorities honest.' },
    ],
    artSeed: 9,
  },
  {
    slug: 'mfa-done-right',
    topic: 'cybersecurity',
    title: 'Multi-Factor Authentication Done Right',
    level: 'intermediate',
    minutes: 5,
    summary: 'Not all second factors are equal — here is the ranking.',
    explanation:
      'Multi-factor authentication (MFA) requires something you know plus something you have or are. Strength varies: SMS codes are better than nothing but can be intercepted or SIM-swapped; authenticator-app codes are stronger; push approvals can be abused through "MFA fatigue" spam unless they show a number to match; hardware security keys and passkeys are the most phishing-resistant.',
    example:
      'At 2 AM you receive ten login approval prompts you did not start. That is an MFA-fatigue attack: deny them all, change your password, and report it.',
    takeaway: 'Prefer passkeys or security keys, then authenticator apps. Never approve a prompt you did not initiate.',
    quiz: [
      { q: 'Which second factor is most phishing-resistant?', options: ['SMS code', 'Email link', 'Hardware key or passkey', 'Security question'], answer: 2, why: 'They are bound to the real site and cannot be relayed.' },
      { q: 'Unexpected repeated approval prompts mean you should…', options: ['Approve one to stop them', 'Deny, change password, report', 'Ignore them forever', 'Turn off MFA'], answer: 1, why: 'It signals someone has your password.' },
    ],
    artSeed: 10,
  },
];
