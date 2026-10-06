// The public demo's entry (build with `--mode demo`): the real web app, with its server replaced by
// one that lives in the page (backend/). Loaded by main.tsx only in that build.
import * as React from "react"

import { App } from "@/App"
import { setFileUrl } from "@/lib/api"
import { fileUrl } from "@/demo/backend/files"
import { scheduleFirstArrival } from "@/demo/backend/jobs"
import { hooks } from "@/demo/backend/router"
import { installEvents, installFetch } from "@/demo/backend/shim"
import { load, reset } from "@/demo/backend/state"
import { DemoBar } from "@/demo/ui/banner"
import { Consent } from "@/demo/ui/consent"
import { Intro } from "@/demo/ui/intro"

/** Starts over: the register, the chat the panel remembers, and the page. */
function restart() {
  reset()
  for (const k of ["autocratico.chat", "autocratico.chat-open"]) {
    try {
      localStorage.removeItem(k)
    } catch {
      // storage unavailable
    }
  }
  window.location.hash = ""
  window.location.reload()
}

function Demo() {
  const [ready, setReady] = React.useState(() => load() !== null)
  const [tour, setTour] = React.useState(false)

  React.useEffect(() => {
    if (ready) scheduleFirstArrival()
  }, [ready])

  return (
    <>
      {ready ? (
        <App tour={tour} />
      ) : (
        <Intro
          onDone={(withTour) => {
            // A new register: no conversation from an earlier demo in the chat panel.
            try {
              localStorage.removeItem("autocratico.chat")
            } catch {
              // storage unavailable
            }
            // A new register opens on the Overview, whatever address the visitor came in with.
            history.replaceState(null, "", location.pathname)
            setTour(withTour)
            setReady(true)
          }}
        />
      )}
      {ready && <DemoBar onRestart={restart} />}
      <Consent />
    </>
  )
}

export function demoApp(): React.ReactElement {
  installFetch()
  installEvents()
  setFileUrl(fileUrl)
  hooks.restart = restart
  return <Demo />
}
