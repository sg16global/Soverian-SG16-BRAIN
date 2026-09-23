// Static, real product content for the Sovereign SG16 Brain platform.

export const HERO_PILLARS = [
  "Open Knowledge",
  "Global Impact",
  "Real Solutions",
  "A Smarter World",
];

export const GLOBAL_NODES = [
  {
    code: "USA",
    name: "United States",
    flag: "usa",
    tz: "America/New_York",
    zone: "EST",
    zoneDst: "EDT",
    gmt: "GMT-4",
    gmtDst: "GMT-4",
  },
  {
    code: "UK",
    name: "United Kingdom",
    flag: "uk",
    tz: "Europe/London",
    zone: "GMT",
    zoneDst: "BST",
    gmt: "GMT+0",
    gmtDst: "GMT+1",
  },
  {
    code: "FRANCE",
    name: "France",
    flag: "france",
    tz: "Europe/Paris",
    zone: "CET",
    zoneDst: "CEST",
    gmt: "GMT+1",
    gmtDst: "GMT+2",
  },
  {
    code: "RUSSIA",
    name: "Russia",
    flag: "russia",
    tz: "Europe/Moscow",
    zone: "MSK",
    zoneDst: "MSK",
    gmt: "GMT+3",
    gmtDst: "GMT+3",
  },
  {
    code: "CHINA",
    name: "China",
    flag: "china",
    tz: "Asia/Shanghai",
    zone: "CST",
    zoneDst: "CST",
    gmt: "GMT+8",
    gmtDst: "GMT+8",
  },
  {
    code: "GERMANY",
    name: "Germany",
    flag: "germany",
    tz: "Europe/Berlin",
    zone: "CET",
    zoneDst: "CEST",
    gmt: "GMT+1",
    gmtDst: "GMT+2",
  },
] as const;

export const TIMELINE = [
  {
    year: "1855",
    title: "Dartmouth Conference",
    body: "The term \u201CArtificial Intelligence\u201D is introduced.",
    accent: "#3fa9ff",
  },
  {
    year: "1960s\u20131970s",
    title: "Symbolic Systems",
    body: "Early symbolic systems and expert systems.",
    accent: "#2ee6a0",
  },
  {
    year: "1950\u20131900s",
    title: "Machine Learning",
    body: "Machine learning and statistical methods.",
    accent: "#ffb020",
  },
  {
    year: "2000s",
    title: "Deep Learning",
    body: "Deep learning and neural networks.",
    accent: "#ff3b3b",
  },
  {
    year: "2010s",
    title: "Generative AI",
    body: "Generative AI and large language models.",
    accent: "#ff9e3d",
  },
  {
    year: "2020s+",
    title: "Sovereign AI",
    body: "A more open, independent and human-centric future.",
    accent: "#c061ff",
  },
] as const;

export const AI_PATH = [
  "1956",
  "Machine Learning",
  "Deep Learning",
  "Generative AI",
  "Sovereign AI",
] as const;

export const AI_CAPABILITIES = [
  { label: "Learn Faster", glyph: "star" },
  { label: "Work Smarter", glyph: "trending" },
  { label: "Solve Bigger", glyph: "bars" },
  { label: "Empower People", glyph: "users" },
  { label: "A Brighter Tomorrow", glyph: "globe" },
] as const;

export const RESPONSIBLE_CHECKLIST = [
  "Ask better questions.",
  "Verify important information.",
  "Use with honesty and respect.",
  "Support positive and legal use.",
  "Help create a fairer planet.",
] as const;

export const SUGGESTION_PROMPTS = [
  "What makes SG16 Brain a sovereign AI?",
  "Compare the connected AI models on this platform.",
  "Explain machine learning in simple terms.",
  "Write a Python function to parse JSON safely.",
] as const;

export type Plan = {
  id: string;
  name: string;
  price: string;
  period: string;
  accent: string;
  features: string[];
  cta: string;
  featured?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Sovereign Free Pilot",
    price: "$0",
    period: "forever",
    accent: "#39d7ff",
    features: [
      "Configured SG16 gateway",
      "Process-local free-use bucket",
      "Structural core · 8K char message limit",
      "Signed-in account history",
      "No host pass required",
    ],
    cta: "Current Pilot",
  },
  {
    id: "pro",
    name: "Sovereign Pro",
    price: "$5–$15",
    period: "per pass",
    accent: "#22e08c",
    featured: true,
    features: [
      "Host-verified time-limited pass",
      "Higher process-local work bucket",
      "Same configured gateway path",
      "Account-scoped API tokens",
      "Storage still depends on deployment",
      "Provider reliability not guaranteed",
    ],
    cta: "Upgrade to Pro",
  },
  {
    id: "enterprise",
    name: "Sovereign Enterprise",
    price: "Custom",
    period: "private deployment",
    accent: "#ffd166",
    features: [
      "Custom deployment discussion",
      "Operator-managed configuration",
      "No SSO/audit/SLA in this build",
      "Third-party path depends on config",
      "No contracted reliability target",
    ],
    cta: "Request Deployment",
  },
] as const;

export const FAQS = [
  {
    q: "What does \u201Csovereign AI\u201D mean?",
    a: "Sovereign AI means the engine you depend on can be owned and hosted under your control instead of creating dependency on third-party AI APIs. This reference stack runs a deterministic structural core in-process; broader language-model capability requires additional operator-provided engines.",
  },
  {
    q: "Which AI models are available?",
    a: "This build is not a broad multi-model orchestrator. Chat uses the configured SG16 structural core path; any optional external relay depends on operator-configured provider credentials. Model statuses in the UI are illustrative unless a live health route reports otherwise.",
  },
  {
    q: "Is my data used to train models?",
    a: "This application does not train models on your conversations. Account conversations, files, tickets and tokens may be stored in the deployment database/filesystem, and logs or backups depend on that deployment. If an operator configures an external relay, that provider may process the request under its own terms.",
  },
  {
    q: "What license does SG16 Brain use?",
    a: "The Sovereign SG16 Brain reference stack is released under Apache 2.0 \u2014 open, permissive and built for ownership, not dependency.",
  },
  {
    q: "How do I get API access?",
    a: "Open API Access in the sidebar, generate an SG16 token, and call the /api/chat endpoint with that bearer token. Availability depends on this deployment being online.",
  },
] as const;

export const SERVICES = [
  {
    title: "Sovereign Deployment",
    glyph: "shield",
    body: "Operator-managed deployment of this reference stack for air-gapped or regulated environments. Production hardening, staffing and compliance remain the operator's responsibility.",
  },
  {
    title: "Configured Gateway Routing",
    glyph: "network",
    body: "One configured chat path with optional external relays when the operator supplies provider credentials. This build does not promise full multi-model auditability or universal provider coverage.",
  },
  {
    title: "Deployment Assistance",
    glyph: "globe",
    body: "Help with running this stack under an operator's own jurisdiction. Geographic clocks and copy are interface presentations, not proof of six active physical nodes.",
  },
  {
    title: "Developer Pilot Program",
    glyph: "code",
    body: "REST routes for chat, account data, tickets, tokens and files. Availability and retention depend on the deployment configuration.",
  },
  {
    title: "AI Ethics \u0027 Governance",
    glyph: "scale",
    body: "Responsible-use frameworks, human-in-the-loop controls and transparent model status for high-trust institutions.",
  },
  {
    title: "Education \u0027 Research",
    glyph: "brain",
    body: "From the Dartmouth term to generative AI \u2014 open curricula, research credits and a smarter world commitment.",
  },
] as const;
