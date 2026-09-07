import { announcementColorStyles, isAnnouncementColor } from "@/lib/announcements";

export type AnnouncementBannerData = {
  id: string;
  title: string;
  content: string;
  color: string;
  expiresAt: Date | null;
};

export function AnnouncementBanner({ announcements }: { announcements: AnnouncementBannerData[] }) {
  if (announcements.length === 0) return null;

  return (
    <section className="mb-5 space-y-3" aria-label="社團公告">
      {announcements.map((announcement) => {
        const color = isAnnouncementColor(announcement.color) ? announcement.color : "blue";
        const styles = announcementColorStyles[color];
        return (
          <article key={announcement.id} className={`rounded-xl border px-4 py-3 shadow-sm sm:px-5 ${styles.panel}`}>
            <div className="flex gap-3">
              <span aria-hidden="true" className="mt-0.5 text-lg">📌</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 className="font-semibold">{announcement.title}</h2>
                  {announcement.expiresAt ? (
                    <span className="text-xs opacity-70">
                      公告至 {announcement.expiresAt.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 opacity-90">{announcement.content}</p>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
