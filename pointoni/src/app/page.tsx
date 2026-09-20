import { db } from "@/db";
import { aiModels, newsItems } from "@/db/schema";
import { asc, desc } from "drizzle-orm";
import { ensureSeeded } from "@/lib/seed";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { HeroStage } from "@/components/home/HeroStage";
import { GlobalPresence } from "@/components/home/GlobalPresence";
import { ModelGrid } from "@/components/home/ModelGrid";
import { ChatPanel } from "@/components/home/ChatPanel";
import { NewsFeed } from "@/components/home/NewsFeed";
import { HistoryTimeline } from "@/components/home/HistoryTimeline";
import { WhatIsAi } from "@/components/home/WhatIsAi";
import { ResponsibleAi } from "@/components/home/ResponsibleAi";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureSeeded();
  const [models, news] = await Promise.all([
    db.select().from(aiModels).orderBy(asc(aiModels.sortOrder)),
    db.select().from(newsItems).orderBy(desc(newsItems.publishedAt)).limit(12),
  ]);

  return (
    <SiteChrome>
      <HeroStage />
      <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-3 pb-12 sm:px-5">
        <GlobalPresence />
        <ModelGrid models={models} />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_350px]">
          <ChatPanel models={models} />
          <NewsFeed initialItems={news} />
        </div>

        <HistoryTimeline />
        <WhatIsAi />
        <ResponsibleAi />
      </div>
    </SiteChrome>
  );
}
