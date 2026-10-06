import { StrictMode, type ReactElement } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { PrivacyProvider } from "@/components/privacy"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { TooltipProvider } from "@/components/ui/tooltip"
import { I18nProvider } from "@/i18n"
import { captureGmailReturn } from "@/lib/gmail"
import { PrefsProvider } from "@/lib/prefs"
import { registerUpdates } from "@/lib/update"

function render(app: ReactElement) {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ThemeProvider defaultTheme="light">
        <I18nProvider>
          <PrefsProvider>
            <PrivacyProvider>
              <TooltipProvider>{app}</TooltipProvider>
            </PrivacyProvider>
          </PrefsProvider>
        </I18nProvider>
      </ThemeProvider>
    </StrictMode>
  )
}

// The public demo build swaps the server for one in the page; the real build leaves all of it out.
if (__DEMO__) {
  void import("./demo/boot").then(({ demoApp }) => render(demoApp()))
} else {
  captureGmailReturn()
  registerUpdates()
  render(<App />)
}
