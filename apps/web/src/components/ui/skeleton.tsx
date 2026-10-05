import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("skeleton-sheen rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
