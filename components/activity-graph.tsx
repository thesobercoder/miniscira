import type { Activity, DayCount } from "@/lib/user-activity"
import { cn } from "@/lib/utils"

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

// Message count → heat level (0–4). Fixed thresholds read more honestly than
// max-relative ones when someone has a single very busy day.
function level(count: number): number {
  if (count <= 0) return 0
  if (count < 3) return 1
  if (count < 6) return 2
  if (count < 10) return 3
  return 4
}

const LEVEL_CLASS = [
  "bg-muted",
  "bg-primary/25",
  "bg-primary/45",
  "bg-primary/70",
  "bg-primary",
]

function dow(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

// A GitHub-style contribution grid of the user's messages: weeks as columns,
// weekdays as rows, filled column-major with a Sunday-aligned lead-in.
export function ActivityGraph({ activity }: { activity: Activity }) {
  const { days } = activity
  const cells: (DayCount | null)[] = [
    ...Array(dow(days[0]?.date ?? "")).fill(null),
    ...days,
  ]
  const weekCount = Math.ceil(cells.length / 7)

  // Month label per week column: shown when the first day of that column falls in
  // a new month (and there's room), aligned above the grid.
  const monthLabels: (string | null)[] = []
  let lastMonth = -1
  for (let w = 0; w < weekCount; w++) {
    const first = cells[w * 7] || cells.slice(w * 7, w * 7 + 7).find(Boolean)
    if (!first) {
      monthLabels.push(null)
      continue
    }
    const m = new Date(`${first.date}T00:00:00Z`).getUTCMonth()
    monthLabels.push(m !== lastMonth ? MONTHS[m] : null)
    lastMonth = m
  }

  const totals = days.reduce((n, d) => n + d.count, 0)
  const activeDays = days.filter((d) => d.count > 0).length

  return (
    <figure className="m-0 w-full">
      {/* The grid is 371 inert divs whose only description was a `title`, which
          never surfaces on touch and announces inconsistently. This sentence is
          the graph's actual text alternative. */}
      <figcaption className="sr-only">
        {`${totals} message${totals === 1 ? "" : "s"} across ${activeDays} active day${
          activeDays === 1 ? "" : "s"
        } in the last year.`}
      </figcaption>
      <div className="w-full overflow-x-auto">
        <div className="inline-flex flex-col gap-1.5" role="presentation">
          {/* Month row aligned to the week columns. */}
          <div
            className="grid gap-[3px] text-[10px] text-muted-foreground"
            style={{ gridTemplateColumns: `repeat(${weekCount}, 11px)` }}
          >
            {monthLabels.map((m, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed calendar grid; position is the identity
                key={i}
                className="h-3 overflow-visible whitespace-nowrap"
              >
                {m}
              </div>
            ))}
          </div>

          {/* The grid: 7 rows (weekdays), filled column-major. */}
          <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
            {cells.map((c, i) =>
              c ? (
                <div
                  key={c.date}
                  title={`${c.count} message${c.count === 1 ? "" : "s"} · ${c.date}`}
                  className={cn(
                    "size-[11px] rounded-[3px]",
                    LEVEL_CLASS[level(c.count)]
                  )}
                />
              ) : (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed calendar grid; position is the identity
                  key={`pad-${i}`}
                  className="size-[11px]"
                />
              )
            )}
          </div>
        </div>
      </div>

      {/* Legend lives OUTSIDE the scroll container. Inside it, the container's
          scrollWidth exceeded its clientWidth and "More" was pushed past the
          visible edge, so the scale read "Less … ?" at ordinary widths. */}
      <div className="mt-1.5 flex items-center justify-end gap-1.5 text-muted-foreground text-xs">
        <span>Less</span>
        {LEVEL_CLASS.map((cls) => (
          <span
            key={cls}
            aria-hidden
            className={cn("size-[11px] rounded-[3px]", cls)}
          />
        ))}
        <span>More</span>
      </div>
    </figure>
  )
}
