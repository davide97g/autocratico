// The guided story at the top of the page, played by the demo itself: a Gmail link pasted in the chat,
// Claude reading the notice, a yes, and the register updating live. Skippable; then the demo is yours.
import { track } from "../analytics.ts"
import { reducedMotion } from "../time.ts"
import type { Demo } from "./app.ts"
import { GMAIL_LINK, TARI_Q } from "./chat.ts"
import { M, wait } from "./core.ts"

export interface Director {
  /** Plays the story once (or jumps to its end with reduced motion). */
  play(): Promise<void>
  /** Jumps to the end of the story, if it is playing. */
  skip(): void
  playing(): boolean
}

export function createDirector(getDemo: () => Demo, ui: { bar: HTMLElement; veil: HTMLElement }): Director {
  const steps = [...ui.bar.querySelectorAll<HTMLElement>("[data-chapter]")]
  let playing = false

  function chapter(n: number) {
    ui.bar.style.setProperty("--chapter", String(n))
    steps.forEach((li) => {
      const k = Number(li.dataset.chapter)
      li.classList.toggle("is-on", k === n)
      li.classList.toggle("is-past", k < n)
    })
  }

  async function tap(demo: Demo, target: Element | null) {
    if (!target) return
    await demo.cursor.to(target)
    await demo.cursor.click()
  }

  async function play() {
    if (playing) return
    playing = true
    const demo = getDemo()
    M.instant = reducedMotion()
    ui.bar.dataset.state = "playing"
    ui.veil.hidden = M.instant
    chapter(1)
    demo.go("overview")
    demo.setChat(true, false)
    await wait(1100)
    await demo.chat.typeDraft(TARI_Q, GMAIL_LINK)
    await tap(demo, demo.root.querySelector(".x-send"))
    chapter(2)
    await demo.chat.send(true)
    chapter(3)
    await wait(900)
    await tap(demo, demo.chat.yesButton())
    const confirmed = demo.chat.confirm(true)
    await wait(2200)
    chapter(4)
    await confirmed
    if (demo.layout() !== "wide") {
      // on narrow screens the chat covers the overview: close it to show what changed
      await wait(1800)
      demo.setChat(false)
      for (const id of ["tari1", "tari2"]) demo.S.fresh.add(id)
      demo.go("overview")
    }
    await wait(900)
    demo.cursor.hide()
    // the story typed in the chat: give the keyboard back to the page (P, ⌘K…)
    if (demo.root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
    chapter(5)
    ui.bar.dataset.state = "done"
    ui.veil.hidden = true
    M.instant = false
    playing = false
  }

  return {
    play,
    skip() {
      if (!playing) return
      track("hero_skip")
      M.instant = true
      ui.veil.hidden = true
    },
    playing: () => playing,
  }
}
