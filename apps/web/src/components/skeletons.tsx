import { cn } from "cn"

import type { View } from "@/components/shell"
import { Skeleton } from "@/components/ui/skeleton"

/** A card frame with a title, a description and `children` as its body, like the real ones. */
function CardFrame({ className, children, title = "w-32" }: { className?: string; children?: React.ReactNode; title?: string }) {
  return (
    <div className={cn("flex flex-col gap-6 rounded-xl bg-card p-6 ring-1 ring-foreground/10", className)}>
      <div className="flex flex-col gap-2">
        <Skeleton className={cn("h-5 rounded-sm", title)} />
        <Skeleton className="h-3.5 w-48 max-w-full rounded-sm" />
      </div>
      {children}
    </div>
  )
}

/** Rows like the ones of the inbox, the activity and the archive: an icon, a title, a line of details. */
export function RowsSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-2", className)} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-start gap-3 rounded-lg bg-muted/50 p-3" style={{ opacity: 1 - i * 0.15 }}>
          <Skeleton className="size-9 shrink-0 bg-card" />
          <div className="flex flex-1 flex-col gap-2 pt-0.5">
            <Skeleton className="h-3.5 rounded-sm" style={{ width: `${70 - ((i * 13) % 30)}%` }} />
            <Skeleton className="h-3 w-1/3 rounded-sm" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </li>
      ))}
    </ul>
  )
}

/** Deadline rows: the date tile, two lines, the status and the button. */
function DeadlineRows({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b py-3 last:border-b-0">
          <Skeleton className="size-12 shrink-0" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 rounded-sm" style={{ width: `${62 - ((i * 17) % 25)}%` }} />
            <Skeleton className="h-3 w-1/4 rounded-sm" />
          </div>
          <Skeleton className="hidden h-7 w-24 rounded-lg @lg:block" />
        </div>
      ))}
    </div>
  )
}

function OverviewSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-6 @2xl:grid-cols-2 @4xl:grid-cols-12">
      <CardFrame className="@2xl:col-span-2 @4xl:col-span-8">
        <div className="flex flex-col gap-4">
          {[0.7, 0.45, 0.6, 0.35].map((w, i) => (
            <div key={i} className="flex items-center gap-6">
              <Skeleton className="h-3.5 w-20 rounded-sm" />
              <Skeleton className="h-8 rounded-md" style={{ width: `${w * 100}%`, marginLeft: `${(i * 11) % 30}%` }} />
            </div>
          ))}
        </div>
      </CardFrame>
      <div className="flex flex-col gap-4 sm:gap-6 rounded-xl bg-primary/90 p-6 @4xl:col-span-4">
        <Skeleton className="h-5 w-24 rounded-sm bg-primary-foreground/15" />
        <Skeleton className="h-12 w-3/4 bg-primary-foreground/15" />
        <Skeleton className="h-24 bg-primary-foreground/10" />
      </div>
      {[0, 1, 2].map((i) => (
        <CardFrame key={i} className="@4xl:col-span-4">
          <div className="flex flex-col gap-4">
            {[0, 1, 2, 3].map((r) => (
              <div key={r} className="flex items-center gap-3">
                <Skeleton className="h-8 w-1 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-3/4 rounded-sm" />
                  <Skeleton className="h-3 w-1/3 rounded-sm" />
                </div>
              </div>
            ))}
          </div>
        </CardFrame>
      ))}
    </div>
  )
}

function DeadlinesSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <div className="flex gap-2 rounded-lg bg-card p-1">
        {[16, 20, 14, 22, 18].map((w, i) => (
          <Skeleton key={i} className="h-8 rounded-md" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <div className="grid gap-4 sm:gap-6 @4xl:grid-cols-2">
        {[3, 2, 2, 1].map((rows, i) => (
          <CardFrame key={i} title="w-36">
            <DeadlineRows rows={rows} />
          </CardFrame>
        ))}
      </div>
    </div>
  )
}

function TwoColumnsSkeleton({ left = 1, rows = 4 }: { left?: number; rows?: number }) {
  return (
    <div className="grid items-start gap-4 sm:gap-6 @4xl:grid-cols-2">
      {Array.from({ length: left + 1 }, (_, i) => (
        <CardFrame key={i}>
          <RowsSkeleton rows={i === 0 ? 2 : rows} />
        </CardFrame>
      ))}
    </div>
  )
}

/** While the register loads, the shape of the view that is about to appear. */
export function ViewSkeleton({ view }: { view: View }) {
  return (
    <div role="status" aria-busy className="flex flex-col gap-4 sm:gap-6">
      {view === "overview" && <OverviewSkeleton />}
      {view === "deadlines" && <DeadlinesSkeleton />}
      {view !== "overview" && view !== "deadlines" && <TwoColumnsSkeleton />}
    </div>
  )
}

export { CardFrame as CardSkeleton }
