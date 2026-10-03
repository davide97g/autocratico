import { FileIcon, ImageIcon } from "lucide-react"
import { cn } from "cn"

import { Sensitive, usePrivacy } from "@/components/privacy"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n"
import { fileUrl, isImage } from "@/lib/api"

const base = (path: string) => path.split("/").at(-1) ?? path

/** Original files (inbox/, archive/): photos as previews that open full size, other files as downloads. */
export function Documents({ paths, className }: { paths: string[]; className?: string }) {
  const { t } = useI18n()
  const { enabled: privacy } = usePrivacy()
  const images = paths.filter(isImage)
  const others = paths.filter((p) => !isImage(p))
  if (!paths.length) return null
  return (
    <div className={cn("@container flex flex-col gap-3", className)}>
      {images.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 @lg:grid-cols-5">
          {images.map((p) => (
            <li key={p} className="min-w-0">
              <a
                href={fileUrl(p, "view")}
                target="_blank"
                rel="noreferrer"
                aria-label={t.documents.open(base(p))}
                className="flex aspect-3/4 items-center justify-center overflow-hidden rounded-lg bg-muted ring-1 ring-border transition-opacity hover:opacity-80"
              >
                {privacy ? (
                  <ImageIcon className="size-5 text-muted-foreground" />
                ) : (
                  <img src={fileUrl(p, "thumb")} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                )}
              </a>
              <Sensitive className="mt-1 block truncate text-xs text-muted-foreground">{base(p)}</Sensitive>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {others.map((p) => (
            <Button key={p} variant="outline" size="xs" render={<a href={fileUrl(p)} download aria-label={t.documents.download(base(p))} />} nativeButton={false}>
              <FileIcon data-icon="inline-start" />
              <Sensitive>{base(p)}</Sensitive>
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
