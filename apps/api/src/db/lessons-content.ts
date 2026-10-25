import type { LessonInsight, QuizQuestion } from './schema.js';

export interface LessonSeed {
  slug: string;
  topic: 'cybersecurity' | 'ot-security' | 'network-security' | 'incident-response' | 'cloud-security' | 'appsec';
  title: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  minutes: number;
  summary: string;
  explanation: string;
  steps: string[];
  diagram: string;
  example: string;
  takeaway: string;
  insight: LessonInsight;
  question: string;
  learnMore: { label: string; url: string };
  quiz: QuizQuestion[];
  artSeed: number;
}

/** Curated reference pages per topic. Links in briefings come only from here, never from a model. */
export const TOPIC_REFERENCES: Record<LessonSeed['topic'], { label: string; url: string }> = {
  cybersecurity: { label: 'NIST Cybersecurity Framework 2.0', url: 'https://www.nist.gov/cyberframework' },
  'ot-security': { label: 'NIST SP 800-82 Rev. 3: Guide to OT Security', url: 'https://csrc.nist.gov/pubs/sp/800/82/r3/final' },
  'network-security': { label: 'CIS Critical Security Controls', url: 'https://www.cisecurity.org/controls' },
  'incident-response': { label: 'NIST SP 800-61 Rev. 3: Incident Response', url: 'https://csrc.nist.gov/pubs/sp/800/61/r3/final' },
  'cloud-security': { label: 'CISA Cloud Security Technical Reference Architecture', url: 'https://www.cisa.gov/resources-tools/resources/cloud-security-technical-reference-architecture' },
  appsec: { label: 'OWASP Top 10', url: 'https://owasp.org/www-project-top-ten/' },
};

/** Original cybersecurity curriculum written for Mira. Each lesson doubles as a "Concept of the Day". */
export const LESSONS: LessonSeed[] = [
  {
    slug: 'egress-filtering',
    topic: 'ot-security',
    title: 'Egress filtering',
    level: 'intermediate',
    minutes: 6,
    summary: 'Controlling what is allowed to leave a protected network, not only what may enter it.',
    explanation:
      'Egress filtering controls traffic leaving a protected network. It stops a compromised device from talking freely to unknown Internet systems or unauthorised internal destinations, which is how malware receives commands and exfiltrates data.',
    steps: [
      'List which devices genuinely need outbound communication, and to where.',
      'Permit only approved destinations, protocols, ports and directions.',
      'Block and log everything else.',
      'Review exceptions regularly: malware hides inside normally permitted HTTPS, DNS or VPN traffic.',
    ],
    diagram: [
      ' PLCs / HMIs / SCADA',
      '          |',
      '          v',
      '   OT network zone',
      '          |',
      '    [OT firewall]',
      '          |',
      '  Egress allowlist',
      '  +------------------------+',
      '  | Historian replica      | ---> ALLOW',
      '  | Approved time server   | ---> ALLOW',
      '  | Vendor update proxy    | ---> ALLOW',
      '  +------------------------+',
      '          |',
      '  Unknown Internet host    ---> BLOCK + ALERT',
      '  Personal cloud storage   ---> BLOCK + ALERT',
      '  Unapproved remote tool   ---> BLOCK + ALERT',
    ].join('\n'),
    example:
      'A pipeline HMI normally needs no direct Internet access. If malware tries to send credentials or process data to an external server, the OT firewall blocks the connection because the destination is not on the approved egress list. Systems that need updates use a staging or proxy service in the IDMZ instead of unrestricted Internet access.',
    takeaway: 'Treat outbound traffic as a privilege: allow the few destinations a system needs, block and alert on the rest.',
    insight: {
      title: 'Protect outbound OT traffic, not only incoming access',
      body: 'A firewall that blocks inbound Internet traffic but allows unrestricted outbound sessions leaves a gap. Malware on an engineering workstation could still exfiltrate PLC projects or credentials, or receive commands over an allowed protocol.',
      bullets: [
        'Deny direct Internet access from PLCs, HMIs and engineering workstations unless technically required.',
        'Route updates through an approved IDMZ repository or proxy.',
        'Allow DNS and NTP only to approved internal services.',
        'Log denied outbound connections and unusual destination changes.',
        'Test firewall changes with operations and the OEM so SCADA, telemetry, alarm and safety traffic keeps flowing.',
      ],
    },
    question:
      'An engineering workstation attempts an outbound HTTPS connection to an unknown Internet address, but operators report the process is normal. Would you block only the connection or isolate the whole workstation — and which firewall, DNS, authentication, engineering-software and PLC-change records would you preserve first?',
    learnMore: { label: 'NIST SP 800-82 Rev. 3: Guide to OT Security', url: 'https://csrc.nist.gov/pubs/sp/800/82/r3/final' },
    quiz: [
      { q: 'Egress filtering primarily controls…', options: ['Traffic entering the network', 'Traffic leaving the network', 'Wireless signal strength', 'User passwords'], answer: 1, why: 'Egress = outbound.' },
      { q: 'Where should OT devices get software updates?', options: ['Directly from the Internet', 'Through an approved IDMZ proxy or repository', 'From USB sticks brought from home', 'They never need updates'], answer: 1, why: 'A controlled staging point avoids direct Internet access.' },
    ],
    artSeed: 11,
  },
  {
    slug: 'purdue-model-segmentation',
    topic: 'ot-security',
    title: 'Purdue model and OT segmentation',
    level: 'beginner',
    minutes: 6,
    summary: 'Layering industrial networks so an IT compromise cannot walk straight into control systems.',
    explanation:
      'The Purdue reference model splits industrial networks into levels, from physical process (Level 0) up to enterprise IT (Levels 4–5). Segmentation puts firewalls and an industrial DMZ between those levels so traffic only crosses where it must, and never directly from IT to controllers.',
    steps: [
      'Map assets to levels: field devices, controllers, supervisory systems, site operations, enterprise.',
      'Place an industrial DMZ (IDMZ) between enterprise IT and OT.',
      'Allow only brokered flows across the IDMZ — no direct IT-to-PLC sessions.',
      'Restrict east–west traffic inside OT to what each cell or zone needs.',
    ],
    diagram: [
      ' Level 4-5  Enterprise IT (email, ERP)',
      '        |',
      '   [Firewall]',
      '        |',
      ' Level 3.5  IDMZ  (historian replica, patch server, jump host)',
      '        |',
      '   [Firewall]',
      '        |',
      ' Level 3    Site operations (historian, engineering workstations)',
      ' Level 2    Supervisory (HMI, SCADA servers)',
      ' Level 1    Control (PLCs, RTUs)',
      ' Level 0    Process (sensors, valves, pumps)',
    ].join('\n'),
    example:
      'Ransomware that encrypts office laptops often stops at the IDMZ when segmentation is enforced: business systems are disrupted, but operators keep running the plant because no IT host can open a session to the HMIs or PLCs.',
    takeaway: 'Nothing in IT should talk directly to a controller; every crossing goes through the IDMZ.',
    insight: {
      title: 'Verify segmentation with traffic, not diagrams',
      body: 'Network drawings often show clean zones while real firewall rules contain old "any-any" exceptions added during commissioning or outages.',
      bullets: [
        'Export current firewall rules and flag any rule allowing IT subnets to reach Level 1–2.',
        'Capture traffic at the IDMZ for a week and compare it with the approved flow list.',
        'Give every exception an owner and an expiry date.',
      ],
    },
    question:
      'A vendor asks for a temporary rule allowing their office VPN to reach a PLC directly for troubleshooting. What would you offer instead, and how would you make sure the access ends when the job is done?',
    learnMore: { label: 'NIST SP 800-82 Rev. 3: Guide to OT Security', url: 'https://csrc.nist.gov/pubs/sp/800/82/r3/final' },
    quiz: [
      { q: 'What sits between enterprise IT and OT in a segmented design?', options: ['The PLCs', 'An industrial DMZ', 'Nothing', 'The Internet'], answer: 1, why: 'The IDMZ brokers all IT–OT exchange.' },
      { q: 'Which level holds PLCs and RTUs?', options: ['Level 0', 'Level 1', 'Level 3', 'Level 4'], answer: 1, why: 'Level 1 is basic control.' },
    ],
    artSeed: 12,
  },
  {
    slug: 'secure-remote-access-ot',
    topic: 'ot-security',
    title: 'Secure remote access to OT',
    level: 'intermediate',
    minutes: 6,
    summary: 'Letting vendors and engineers in remotely without leaving a permanent door open.',
    explanation:
      'Remote access is one of the most common ways attackers reach industrial systems. Secure remote access routes every session through a jump host in the IDMZ, with multi-factor authentication, approval, recording and automatic expiry.',
    steps: [
      'Terminate the VPN or remote tool in the IDMZ, never on a device inside OT.',
      'Require MFA and named accounts — no shared vendor logins.',
      'Approve each session for a time window, then disable access automatically.',
      'Record sessions and alert on activity outside the window.',
    ],
    diagram: [
      ' Vendor laptop',
      '      |  MFA + approval',
      '      v',
      ' [Remote access gateway]  (IDMZ)',
      '      |',
      ' [Jump host]  session recorded, time-boxed',
      '      |',
      ' [OT firewall]  only to the approved asset',
      '      |',
      ' Engineering workstation --> PLC',
    ].join('\n'),
    example:
      'Several incidents at water and energy utilities began with remote-access software left installed and reachable from the Internet with weak or shared passwords. A brokered, time-boxed jump host removes that always-on path.',
    takeaway: 'Remote access should be brokered, approved, recorded and temporary — never always-on.',
    insight: {
      title: 'Hunt for forgotten remote-access tools',
      body: 'Commissioning teams and vendors often install remote-desktop tools that outlive the project.',
      bullets: [
        'Inventory remote-access software on HMIs and engineering workstations.',
        'Remove tools that bypass the approved gateway.',
        'Review gateway logs for logins outside approved windows.',
      ],
    },
    question:
      'You find a remote-desktop tool on an HMI that connects out to the vendor’s cloud service. Operations say the vendor relies on it for weekend support. How would you replace it without leaving the site without support?',
    learnMore: { label: 'CISA Industrial Control Systems resources', url: 'https://www.cisa.gov/topics/industrial-control-systems' },
    quiz: [
      { q: 'Where should vendor remote sessions terminate?', options: ['On the PLC', 'In the IDMZ jump host', 'On the HMI', 'On the vendor’s laptop'], answer: 1, why: 'The IDMZ brokers and records access.' },
      { q: 'Which control limits how long access stays open?', options: ['Antivirus', 'Time-boxed approval', 'Longer passwords', 'Port knocking'], answer: 1, why: 'Access expires automatically.' },
    ],
    artSeed: 13,
  },
  {
    slug: 'ot-asset-inventory',
    topic: 'ot-security',
    title: 'OT asset inventory',
    level: 'beginner',
    minutes: 5,
    summary: 'You cannot protect controllers and firmware you do not know you have.',
    explanation:
      'An OT asset inventory lists every controller, HMI, workstation, network device and their firmware, location, owner and communication paths. It is the base for patch decisions, vulnerability response and incident investigation.',
    steps: [
      'Collect assets passively (network monitoring) to avoid disturbing fragile devices.',
      'Record model, firmware, location, owner and criticality for each.',
      'Map which assets talk to which, and over what protocols.',
      'Update the inventory with every change and review it on a schedule.',
    ],
    diagram: [
      ' Passive network sensor (SPAN port)',
      '        |',
      '        v',
      ' Asset inventory',
      '  +------------------------------------------+',
      '  | PLC-07  | firmware 4.2 | Pump station 3 |',
      '  | HMI-02  | Windows 10   | Control room   |',
      '  | EWS-01  | Engineering  | Owner: J. Rao  |',
      '  +------------------------------------------+',
      '        |',
      ' Advisory arrives --> "Do we run this?" answered in minutes',
    ].join('\n'),
    example:
      'When a critical PLC advisory is published, a site with an accurate inventory can tell within minutes which controllers run the affected firmware, while a site without one spends days walking cabinets.',
    takeaway: 'Inventory first: every advisory and incident starts with “which assets are affected?”',
    insight: {
      title: 'Prefer passive discovery in OT',
      body: 'Active scans that are routine in IT can crash or slow older controllers.',
      bullets: [
        'Use passive monitoring from a SPAN or TAP port.',
        'Schedule any active queries with operations, during maintenance windows.',
        'Reconcile discovered assets with engineering drawings.',
      ],
    },
    question:
      'Passive monitoring finds a device talking Modbus that is not in any drawing. What would you check first to decide whether it is a forgotten asset or a rogue device?',
    learnMore: { label: 'NIST SP 800-82 Rev. 3: Guide to OT Security', url: 'https://csrc.nist.gov/pubs/sp/800/82/r3/final' },
    quiz: [
      { q: 'Why prefer passive discovery in OT?', options: ['It is faster', 'Active scans can disrupt fragile controllers', 'It finds more passwords', 'It is required by law everywhere'], answer: 1, why: 'Many controllers react badly to scans.' },
    ],
    artSeed: 14,
  },
  {
    slug: 'ot-patching-strategy',
    topic: 'ot-security',
    title: 'Patching in OT: risk-based, not calendar-based',
    level: 'intermediate',
    minutes: 6,
    summary: 'How to respond to vulnerabilities when you cannot simply reboot the plant.',
    explanation:
      'OT systems often cannot be patched on IT schedules because of uptime, safety certification or vendor approval. A risk-based approach prioritises vulnerabilities that are exposed and exploited, and uses compensating controls until a patch window arrives.',
    steps: [
      'Match each advisory against the asset inventory.',
      'Prioritise: known exploited, reachable from IT or Internet, safety-critical.',
      'Apply vendor-approved patches in planned windows after testing.',
      'Until then, reduce exposure: block ports, restrict access, increase monitoring.',
    ],
    diagram: [
      ' Advisory published',
      '      |',
      '      v',
      ' Affected asset?  --no-->  record and close',
      '      | yes',
      '      v',
      ' Exploited or exposed?',
      '   | yes                    | no',
      '   v                        v',
      ' Mitigate now           Plan for next window',
      ' (block, restrict,      (vendor-approved patch,',
      '  monitor) + patch       tested first)',
    ].join('\n'),
    example:
      'For a controller vulnerability reachable only from the engineering network, a site may block the vulnerable service at the cell firewall immediately and install the vendor patch at the next planned outage.',
    takeaway: 'Exploited and exposed comes first; compensating controls bridge the gap until a safe patch window.',
    insight: {
      title: 'Use the known-exploited list as your first filter',
      body: 'Vulnerabilities known to be exploited in the wild deserve attention before higher scores that nobody is using.',
      bullets: [
        'Check advisories against a known-exploited catalogue.',
        'Record the compensating control and its owner for every deferred patch.',
        'Re-test after the patch to confirm the process still behaves normally.',
      ],
    },
    question:
      'A critical vulnerability affects your HMI software, the vendor patch is not yet certified, and the next outage is in six weeks. Which compensating controls would you apply this week, and how would you show they reduce the risk?',
    learnMore: { label: 'CISA Known Exploited Vulnerabilities Catalog', url: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog' },
    quiz: [
      { q: 'Which vulnerability should usually be handled first?', options: ['Highest score, never exploited', 'Known exploited and reachable', 'Oldest one', 'The one with the longest name'], answer: 1, why: 'Exploitation plus exposure drives real risk.' },
    ],
    artSeed: 15,
  },
  {
    slug: 'zero-trust-basics',
    topic: 'cybersecurity',
    title: 'Zero Trust architecture',
    level: 'beginner',
    minutes: 5,
    summary: 'Why “never trust, always verify” replaced the idea of a safe internal network.',
    explanation:
      'Zero Trust drops the assumption that anything inside the network is trusted. Every request is checked for identity, device health and permission at the moment it is made, and access is granted per application with the least privilege needed.',
    steps: [
      'Authenticate every user and device strongly (MFA, managed devices).',
      'Authorise per request and per application, not per network.',
      'Grant least privilege and time-limit sensitive access.',
      'Monitor continuously and re-check when signals change.',
    ],
    diagram: [
      ' User + device',
      '      |',
      '      v',
      ' [Policy decision point]  identity? device healthy? allowed?',
      '      |',
      '      +--> yes --> Payroll app only (least privilege)',
      '      +--> no  --> deny + log',
    ].join('\n'),
    example:
      'An employee on the office Wi-Fi opening the payroll app is still checked with single sign-on and MFA, their laptop must be managed and patched, and they only see the screens their role needs — exactly as if they were working from a café.',
    takeaway: 'Location is not identity: verify each request and grant only what is needed.',
    insight: {
      title: 'Start Zero Trust with your most sensitive application',
      body: 'Zero Trust is a direction, not a product. Begin where the impact of misuse is highest.',
      bullets: [
        'Put the application behind single sign-on with phishing-resistant MFA.',
        'Require a managed, patched device.',
        'Remove standing admin access in favour of just-in-time elevation.',
      ],
    },
    question:
      'A contractor needs access to one internal web app for a month. How would you grant it under Zero Trust without giving them VPN access to the whole network?',
    learnMore: { label: 'NIST SP 800-207: Zero Trust Architecture', url: 'https://csrc.nist.gov/pubs/sp/800/207/final' },
    quiz: [
      { q: 'What does Zero Trust stop relying on?', options: ['Passwords', 'Network location', 'Encryption', 'Logging'], answer: 1, why: 'No implicit trust from being “inside”.' },
      { q: 'Which principle limits damage from a stolen account?', options: ['Least privilege', 'Open ports', 'Shared admin accounts', 'Longer sessions'], answer: 0, why: 'A stolen account reaches only what it strictly needs.' },
    ],
    artSeed: 1,
  },
  {
    slug: 'phishing-red-flags',
    topic: 'cybersecurity',
    title: 'Spotting phishing in 30 seconds',
    level: 'beginner',
    minutes: 4,
    summary: 'A quick mental checklist for suspicious messages.',
    explanation:
      'Phishing tries to rush you into clicking, paying or sharing a code. Check the real sender, whether the message creates urgency, whether links point where they claim, and whether it asks for something unusual such as a one-time code.',
    steps: [
      'Read the actual sender address, not just the display name.',
      'Notice pressure: urgency, fear, secrecy or unusual rewards.',
      'Hover or long-press links to see the real destination.',
      'Verify unusual requests through a channel you already trust.',
    ],
    diagram: [
      ' Email arrives',
      '   |',
      '   +-- Sender domain matches?  no --> suspicious',
      '   +-- Urgent / threatening?   yes --> suspicious',
      '   +-- Link goes elsewhere?    yes --> suspicious',
      '   +-- Asks for code / payment? yes --> report, do not act',
    ].join('\n'),
    example:
      '“Your account will be locked in 2 hours — verify now” from a look-alike domain combines urgency, spoofing and a credential request. Opening the real app shows no warning at all.',
    takeaway: 'Slow down, check sender and link, and use your own route to the real service.',
    insight: {
      title: 'Make reporting easier than ignoring',
      body: 'People report phishing when it is quick and they get feedback.',
      bullets: ['Add a one-click report button.', 'Thank reporters and share what was found.', 'Use reported samples to tune filters.'],
    },
    question: 'A finance colleague receives an email from the CEO’s real address asking for an urgent supplier payment. What checks would you require before the money moves?',
    learnMore: { label: 'NIST Cybersecurity Framework 2.0', url: 'https://www.nist.gov/cyberframework' },
    quiz: [
      { q: 'A message asks for the code you just received. You should…', options: ['Send it quickly', 'Never share it', 'Share half of it', 'Reply asking why'], answer: 1, why: 'One-time codes are only for you.' },
    ],
    artSeed: 2,
  },
  {
    slug: 'mfa-done-right',
    topic: 'cybersecurity',
    title: 'Multi-factor authentication done right',
    level: 'intermediate',
    minutes: 5,
    summary: 'Not all second factors are equal — here is the ranking.',
    explanation:
      'MFA combines something you know with something you have or are. SMS codes can be intercepted, push approvals can be abused through “MFA fatigue”, while passkeys and hardware security keys resist phishing because they are bound to the real website.',
    steps: [
      'Prefer passkeys or hardware security keys for admins and remote access.',
      'Use number-matching for push approvals.',
      'Phase out SMS and email codes where possible.',
      'Alert on repeated denied prompts.',
    ],
    diagram: [
      ' Strongest  Passkey / hardware key   (bound to the real site)',
      '            Authenticator app code',
      '            Push with number matching',
      '            SMS / email code',
      ' Weakest    Password only',
    ].join('\n'),
    example: 'At 2 AM you receive ten approval prompts you did not start. That is an MFA-fatigue attack: deny them all, change your password and report it.',
    takeaway: 'Phishing-resistant MFA for anything important; never approve a prompt you did not start.',
    insight: {
      title: 'Protect remote access and admins first',
      body: 'Attackers target the accounts that unlock the most.',
      bullets: ['Enforce phishing-resistant MFA on VPN and remote gateways.', 'Remove MFA exemptions for service desks.', 'Review who can reset MFA.'],
    },
    question: 'Your help desk can reset MFA after a phone call. How would an attacker abuse this, and what verification would you add?',
    learnMore: { label: 'FIDO Alliance: Passkeys', url: 'https://fidoalliance.org/passkeys/' },
    quiz: [
      { q: 'Which factor is most phishing-resistant?', options: ['SMS code', 'Email link', 'Passkey or hardware key', 'Security question'], answer: 2, why: 'Bound to the real site.' },
    ],
    artSeed: 10,
  },
  {
    slug: 'least-privilege',
    topic: 'cybersecurity',
    title: 'Least privilege and just-in-time admin',
    level: 'intermediate',
    minutes: 5,
    summary: 'Standing admin rights turn one stolen password into a full breach.',
    explanation:
      'Least privilege gives each account only the access its job needs. Just-in-time (JIT) administration goes further: admin rights are granted for a short, approved window and removed automatically, so there is little standing privilege to steal.',
    steps: [
      'Separate daily-use accounts from admin accounts.',
      'Remove local admin rights from user devices.',
      'Grant elevated rights on request, time-boxed and logged.',
      'Review group memberships every quarter.',
    ],
    diagram: [
      ' Engineer (standard account)',
      '      |  request: "admin on HMI-02, 1 hour, change #4512"',
      '      v',
      ' [Approval] --> temporary admin group (expires 60 min)',
      '      |',
      ' Work done --> rights removed automatically, session logged',
    ].join('\n'),
    example: 'Attackers who phish a standard user account cannot install tools or dump credentials from other users when local admin rights are not present on the device.',
    takeaway: 'Make admin access temporary and specific; remove what nobody is actively using.',
    insight: {
      title: 'Find standing privilege you forgot about',
      body: 'Service accounts and old project groups often hold more access than anyone remembers.',
      bullets: ['List accounts in domain and OT admin groups.', 'Disable accounts with no recent logins.', 'Give each service account an owner.'],
    },
    question: 'An OT integrator’s service account is a domain admin “because the installer needed it”. How would you find out what it really needs before reducing its rights?',
    learnMore: { label: 'CIS Critical Security Controls', url: 'https://www.cisecurity.org/controls' },
    quiz: [
      { q: 'Just-in-time admin means…', options: ['Admin rights forever', 'Time-boxed elevation on request', 'No admins at all', 'Shared admin passwords'], answer: 1, why: 'Rights exist only when needed.' },
    ],
    artSeed: 16,
  },
  {
    slug: 'dns-security-monitoring',
    topic: 'network-security',
    title: 'DNS as a security sensor',
    level: 'intermediate',
    minutes: 5,
    summary: 'Almost every malicious connection starts with a DNS lookup — watch them.',
    explanation:
      'Before connecting to a server, a device usually asks DNS for its address. Forcing all devices to use an internal resolver lets you block known-bad domains and spot unusual lookups such as newly registered domains or long random names used for tunnelling.',
    steps: [
      'Force all clients to use internal resolvers; block outbound DNS elsewhere.',
      'Log queries centrally.',
      'Block known-malicious and newly registered domains where appropriate.',
      'Alert on unusual patterns: very long names, high volumes, rare domains.',
    ],
    diagram: [
      ' Device --> [Internal DNS resolver] --> Internet DNS',
      '                 |  log + filter',
      '                 v',
      '           SIEM alerts:',
      '           - newly registered domain',
      '           - x7f3k9...long-name.example (tunnelling?)',
      ' Device --X--> 8.8.8.8 direct  (blocked at firewall)',
    ].join('\n'),
    example: 'Malware that uses DNS tunnelling to send data out produces long, random-looking subdomains at high volume — easy to spot in resolver logs and impossible to hide if direct outbound DNS is blocked.',
    takeaway: 'One controlled resolver gives you both a filter and a high-value log.',
    insight: {
      title: 'Close the DNS bypass',
      body: 'Filtering means little if devices can query any public resolver directly.',
      bullets: ['Block outbound TCP/UDP 53 except from resolvers.', 'Watch for DNS-over-HTTPS to unapproved providers.', 'Keep 90 days of query logs for investigations.'],
    },
    question: 'Resolver logs show an HMI querying a domain registered two days ago. Which other logs would you check before deciding it is malicious?',
    learnMore: { label: 'CIS Critical Security Controls', url: 'https://www.cisecurity.org/controls' },
    quiz: [
      { q: 'Why block outbound DNS except from your resolvers?', options: ['It speeds up the Internet', 'So filtering and logging cannot be bypassed', 'DNS is unsafe in general', 'To save bandwidth'], answer: 1, why: 'Otherwise devices skip your controls.' },
    ],
    artSeed: 17,
  },
  {
    slug: 'network-segmentation-microsegmentation',
    topic: 'network-security',
    title: 'Segmentation vs micro-segmentation',
    level: 'intermediate',
    minutes: 5,
    summary: 'Containing attackers by limiting who can talk to whom.',
    explanation:
      'Segmentation divides a network into zones with controlled crossings. Micro-segmentation applies the same idea between individual workloads, so even systems in the same zone can only talk on the ports they need. Both limit lateral movement.',
    steps: [
      'Group systems by function and sensitivity into zones.',
      'Define allowed flows between zones; deny the rest.',
      'Within critical zones, restrict host-to-host traffic.',
      'Monitor denied traffic — it often reveals misconfigurations or attackers.',
    ],
    diagram: [
      ' Zone A: Users      Zone B: Servers      Zone C: Backups',
      '    |                   |                    |',
      '    +---- 443 only ---->+                    |',
      '                        +-- backup agent --->+',
      '    +-------------- denied ----------------->X',
    ].join('\n'),
    example: 'Ransomware that compromises a user laptop cannot reach the backup servers directly when only the backup service is allowed into the backup zone.',
    takeaway: 'Every allowed path is a path for attackers too — keep the list short and known.',
    insight: {
      title: 'Protect backups with their own zone',
      body: 'Attackers try to delete backups before encrypting data.',
      bullets: ['Put backup servers in a separate zone with separate credentials.', 'Keep an offline or immutable copy.', 'Test restores regularly.'],
    },
    question: 'An application team asks for “any-any” between two zones until go-live. How would you collect the flows they actually need instead?',
    learnMore: { label: 'CIS Critical Security Controls', url: 'https://www.cisecurity.org/controls' },
    quiz: [
      { q: 'Micro-segmentation restricts traffic…', options: ['Only at the Internet edge', 'Between individual workloads', 'Only for Wi-Fi', 'Only for email'], answer: 1, why: 'Fine-grained, host-to-host control.' },
    ],
    artSeed: 18,
  },
  {
    slug: 'incident-response-first-hour',
    topic: 'incident-response',
    title: 'The first hour of an incident',
    level: 'intermediate',
    minutes: 6,
    summary: 'What to do — and what not to destroy — when something looks wrong.',
    explanation:
      'The first hour decides whether you can contain an incident and later understand it. The goals are to stabilise operations, contain spread, preserve evidence and communicate clearly, in that order of urgency, without wiping systems prematurely.',
    steps: [
      'Confirm and scope: what is affected, since when, how do we know?',
      'Contain: isolate affected hosts from the network rather than powering them off.',
      'Preserve: logs, memory where possible, firewall and authentication records.',
      'Communicate: incident lead, operations, management; start a timeline.',
    ],
    diagram: [
      ' Alert / report',
      '    |',
      '    v',
      ' Triage (real? scope?)',
      '    |',
      '    v',
      ' Contain  ---- isolate network, keep power on',
      '    |',
      '    v',
      ' Preserve ---- logs, memory, configs, timeline',
      '    |',
      '    v',
      ' Eradicate and recover (after evidence is safe)',
    ].join('\n'),
    example: 'Teams that reimage an infected server immediately often lose the only evidence of how the attacker got in — and are reinfected through the same path a week later.',
    takeaway: 'Contain without destroying evidence; isolate, don’t wipe, in the first hour.',
    insight: {
      title: 'Prepare the evidence list before you need it',
      body: 'Under pressure, people forget which logs roll over first.',
      bullets: ['List log sources and their retention.', 'Pre-authorise who may isolate systems.', 'Keep an out-of-band contact list if email is compromised.'],
    },
    question: 'Operators see an HMI moving the mouse by itself. The process is still stable. What are your first three actions, and who must approve isolating the HMI?',
    learnMore: { label: 'NIST SP 800-61 Rev. 3: Incident Response', url: 'https://csrc.nist.gov/pubs/sp/800/61/r3/final' },
    quiz: [
      { q: 'In the first hour you should usually…', options: ['Wipe and reinstall at once', 'Isolate and preserve evidence', 'Ignore it until Monday', 'Post on social media'], answer: 1, why: 'Evidence is needed to stop reinfection.' },
    ],
    artSeed: 19,
  },
  {
    slug: 'ransomware-readiness',
    topic: 'incident-response',
    title: 'Ransomware readiness',
    level: 'beginner',
    minutes: 5,
    summary: 'The few controls that decide whether ransomware is an outage or a crisis.',
    explanation:
      'Ransomware groups usually steal credentials, move laterally, delete backups and then encrypt. Readiness means making each of those steps harder and being able to restore quickly from backups the attacker cannot reach.',
    steps: [
      'Phishing-resistant MFA on remote access and email.',
      'Segmentation and least privilege to slow lateral movement.',
      'Offline or immutable backups with tested restores.',
      'An exercised response plan, including OT shutdown decisions.',
    ],
    diagram: [
      ' Initial access --> credential theft --> lateral movement --> backup deletion --> encryption',
      '      ^                  ^                     ^                     ^',
      '     MFA            least privilege        segmentation        immutable backups',
    ].join('\n'),
    example: 'Organisations with immutable backups and tested restores have recovered critical systems in days rather than weeks, without paying a ransom.',
    takeaway: 'Backups the attacker cannot touch, and a restore you have practised, are the last line.',
    insight: {
      title: 'Test a restore this month',
      body: 'A backup is only real once you have restored from it.',
      bullets: ['Restore one critical system into an isolated network.', 'Time it and record the gaps.', 'Include OT configurations and PLC programs.'],
    },
    question: 'If your domain controllers were encrypted, how would operators log in to the HMIs, and do your backups depend on the same domain?',
    learnMore: { label: 'NIST Cybersecurity Framework 2.0', url: 'https://www.nist.gov/cyberframework' },
    quiz: [
      { q: 'Which backup survives an attacker with admin rights?', options: ['Network share on the same domain', 'Offline or immutable copy', 'Email attachment', 'Desktop folder'], answer: 1, why: 'The attacker cannot alter it.' },
    ],
    artSeed: 20,
  },
  {
    slug: 'cloud-shared-responsibility',
    topic: 'cloud-security',
    title: 'The shared responsibility model',
    level: 'beginner',
    minutes: 5,
    summary: 'Which security tasks the cloud provider does — and which stay with you.',
    explanation:
      'Cloud providers secure the underlying infrastructure. Customers remain responsible for what they configure on it: identities, data, network rules and application settings. Most cloud breaches come from customer-side misconfiguration, not provider failures.',
    steps: [
      'Know your service model: IaaS leaves more to you than SaaS.',
      'Own identity: MFA, least privilege, no long-lived keys.',
      'Own data: encryption settings, public access, retention.',
      'Continuously check configuration against a baseline.',
    ],
    diagram: [
      ' You:       data | identities | access policies | app config',
      ' ------------------------------------------------------------',
      ' Provider:  physical security | hardware | hypervisor | network',
    ].join('\n'),
    example: 'Storage buckets left publicly readable have exposed millions of records even though the provider’s infrastructure was never breached.',
    takeaway: 'The provider secures the cloud; you secure what you put in it.',
    insight: {
      title: 'Hunt public exposure weekly',
      body: 'One misconfigured setting can publish data to the Internet.',
      bullets: ['Alert on publicly accessible storage.', 'Remove unused access keys.', 'Require MFA for all console users.'],
    },
    question: 'A developer needs to share files with a partner quickly. How would you enable that without making a storage bucket public?',
    learnMore: { label: 'CISA Cloud Security Technical Reference Architecture', url: 'https://www.cisa.gov/resources-tools/resources/cloud-security-technical-reference-architecture' },
    quiz: [
      { q: 'Who usually configures storage access permissions?', options: ['The provider', 'The customer', 'Nobody', 'The ISP'], answer: 1, why: 'Configuration is the customer’s responsibility.' },
    ],
    artSeed: 21,
  },
  {
    slug: 'input-validation-injection',
    topic: 'appsec',
    title: 'Injection and input validation',
    level: 'intermediate',
    minutes: 5,
    summary: 'Why user input must never become code.',
    explanation:
      'Injection happens when untrusted input is interpreted as part of a command — SQL, shell, or template. Parameterised queries and strict input validation keep data as data, so even malicious text cannot change what the program does.',
    steps: [
      'Use parameterised queries or an ORM for every database call.',
      'Validate input against a strict schema (type, length, allowed values).',
      'Never pass user input to a shell; use safe APIs.',
      'Encode output for its context (HTML, URL, JSON).',
    ],
    diagram: [
      ' Unsafe:  "SELECT * FROM users WHERE name = \'" + input + "\'"',
      '          input = x\' OR \'1\'=\'1   --> returns every user',
      '',
      ' Safe:    query("SELECT * FROM users WHERE name = $1", [input])',
      '          input stays data       --> no change to the query',
    ].join('\n'),
    example: 'Many large data breaches started with one search field that built a SQL query by string concatenation.',
    takeaway: 'Keep data and code apart: parameterise, validate, encode.',
    insight: {
      title: 'Review the boundaries, not every line',
      body: 'Injection lives where input crosses into an interpreter.',
      bullets: ['List every place input reaches SQL, shell or templates.', 'Add schema validation at API entry points.', 'Add tests with malicious input.'],
    },
    question: 'A legacy HMI web page builds SQL from a URL parameter, and the vendor is no longer supported. What can you do around it if you cannot change the code?',
    learnMore: { label: 'OWASP Top 10', url: 'https://owasp.org/www-project-top-ten/' },
    quiz: [
      { q: 'The main defence against SQL injection is…', options: ['Longer passwords', 'Parameterised queries', 'A faster database', 'Hiding the URL'], answer: 1, why: 'Input never becomes SQL.' },
    ],
    artSeed: 22,
  },
];
