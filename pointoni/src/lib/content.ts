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
      "Self-hosted SG16 Brain core",
      "50 messages / day",
      "128K context window",
      "1 connected device",
      "Community support",
    ],
    cta: "Current Pilot",
  },
  {
    id: "pro",
    name: "Sovereign Pro",
    price: "$29",
    period: "per month",
    accent: "#22e08c",
    featured: true,
    features: [
      "Full multi-model grid (Claude · GPT-5.5 · Gemini)",
      "Unlimited sovereign messages",
      "1M context orchestration",
      "API access · 100K tokens / day",
      "10 devices · encrypted file vault",
      "Priority global nodes",
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
      "On-premise Mistral X deployment",
      "Dedicated regional inference",
      "No third-party API dependency",
      "SSO, audit logs · SLA 99.99%",
      "White-glove diplomacy support",
    ],
    cta: "Request Deployment",
  },
] as const;

export const FAQS = [
  {
    q: "What does \u201Csovereign AI\u201D mean?",
    a: "Sovereign AI means the intelligence engine you depend on is owned, hosted and controlled by you \u2014 or by your nation and organisation \u2014 rather than creating dependency on third-party AI APIs. SG16 Brain runs a self-hosted Mistral engine precisely for ownership of your data, models and uptime.",
  },
  {
    q: "Which AI models are available?",
    a: "The platform orchestrates the SG16 Brain core (Mistral X Instruct), Claude, GPT-5.5, Gemini, Llama 3 and Stable Diffusion XL. Self-hosted models answer directly; third-party models are relayed through the SG16 orchestrator when API credentials are configured.",
  },
  {
    q: "Is my data used to train models?",
    a: "No. Conversations and files on the sovereign core never leave your deployment and are never used for training. Connected third-party models are clearly labelled as relayed so you always know where data travels.",
  },
  {
    q: "What license does SG16 Brain use?",
    a: "The Sovereign SG16 Brain reference stack is released under Apache 2.0 \u2014 open, permissive and built for ownership, not dependency.",
  },
  {
    q: "How do I get API access?",
    a: "Open API Access in the sidebar, generate an SG16 token, and call the /api/chat endpoint with your token. The docs panel includes a ready-to-run curl example.",
  },
] as const;

export const SERVICES = [
  {
    title: "Sovereign Deployment",
    glyph: "shield",
    body: "On-premise and national-cloud deployment of the SG16 Brain stack with Mistral X Instruct, hardened for air-gapped and regulated environments.",
  },
  {
    title: "Multi-Model Orchestration",
    glyph: "network",
    body: "One control plane routing tasks between Claude, GPT-5.5, Gemini, Llama 3 and the sovereign core \u2014 with full auditability and fallback.",
  },
  {
    title: "Knowledge Diplomacy",
    glyph: "globe",
    body: "Six global nodes (USA, UK, France, Russia, China, Germany) federating open knowledge across languages, jurisdictions and cultures.",
  },
  {
    title: "Developer Pilot Program",
    glyph: "code",
    body: "REST APIs, embeddings pipelines, device management and file intelligence \u2014 everything on the homepage is a working endpoint.",
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
