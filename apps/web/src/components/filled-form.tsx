/**
 * A form the agent filled in (core/forms.ts): its pages drawn here with pdf.js (no scripts, nothing
 * opened inline from the server), the button that downloads it, and a reminder that signing and
 * sending are the user's. pdf.js is loaded only when such an answer is shown.
 */
import * as React from "react"
import { DownloadIcon, FileCheck2Icon } from "lucide-react"
import type { FilledForm } from "@autocratico/core"

import { Sensitive } from "@/components/privacy"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useI18n } from "@/i18n"
import { chatFileUrl } from "@/lib/api"

type Pdf = { numPages: number; getPage(n: number): Promise<PdfPage> }
type PdfPage = {
  getViewport(o: { scale: number }): { width: number; height: number }
  render(o: { canvas: HTMLCanvasElement; viewport: { width: number; height: number } }): { promise: Promise<void> }
}

async function openPdf(url: string): Promise<Pdf> {
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const r = await fetch(url, { credentials: "same-origin" })
  if (!r.ok) throw new Error(String(r.status))
  return (await pdfjs.getDocument({ data: new Uint8Array(await r.arrayBuffer()), verbosity: 0 }).promise) as unknown as Pdf
}

/** One page, drawn at `width` CSS pixels (sharp on high-density screens). */
function Page({ pdf, n, width }: { pdf: Pdf; n: number; width: number }) {
  const canvas = React.useRef<HTMLCanvasElement>(null)
  React.useEffect(() => {
    let cancelled = false
    pdf.getPage(n).then((page) => {
      const el = canvas.current
      if (cancelled || !el) return
      const scale = (width / page.getViewport({ scale: 1 }).width) * (window.devicePixelRatio || 1)
      const viewport = page.getViewport({ scale })
      el.width = viewport.width
      el.height = viewport.height
      return page.render({ canvas: el, viewport }).promise
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [pdf, n, width])
  return <canvas ref={canvas} className="block h-auto w-full rounded-sm bg-white ring-1 ring-border" />
}

export function FilledFormCard({ form }: { form: FilledForm }) {
  const { t } = useI18n()
  const url = chatFileUrl(form.path)
  const [pdf, setPdf] = React.useState<Pdf | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [open, setOpen] = React.useState<number | null>(null)
  React.useEffect(() => {
    let live = true
    openPdf(url).then((d) => live && setPdf(d), () => live && setFailed(true))
    return () => {
      live = false
    }
  }, [url])
  const pages = pdf ? Array.from({ length: pdf.numPages }, (_, i) => i + 1) : []

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-muted/60 p-2.5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-card">
          <FileCheck2Icon className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">
            <Sensitive>{form.name}</Sensitive>
          </span>
          <span className="text-xs text-muted-foreground">{t.chat.form.summary(form.pages, form.filled)}</span>
        </div>
        <Button size="sm" nativeButton={false} render={<a href={url} download={form.name} />}>
          <DownloadIcon />
          {t.chat.form.download}
        </Button>
      </div>
      {!failed && (
        <Sensitive className="block">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {pdf
              ? pages.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setOpen(n)}
                    aria-label={t.chat.form.page(n)}
                    className="w-36 shrink-0 rounded-sm transition-opacity outline-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <Page pdf={pdf} n={n} width={144} />
                  </button>
                ))
              : Array.from({ length: Math.min(form.pages || 1, 4) }, (_, i) => <Skeleton key={i} className="aspect-[1/1.414] w-36 shrink-0" />)}
          </div>
        </Sensitive>
      )}
      <p className="text-xs text-muted-foreground">{t.chat.form.check}</p>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              <Sensitive>{form.name}</Sensitive>
            </DialogTitle>
            <DialogDescription>{t.chat.form.check}</DialogDescription>
          </DialogHeader>
          {pdf && (
            <Sensitive className="block">
              <div className="flex flex-col gap-3">
                {pages.map((n) => (
                  <Page key={n} pdf={pdf} n={n} width={620} />
                ))}
              </div>
            </Sensitive>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
