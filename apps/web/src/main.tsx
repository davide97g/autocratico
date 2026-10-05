import { StrictMode } from "react"
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

captureGmailReturn()
registerUpdates()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="light">
      <I18nProvider>
        <PrefsProvider>
          <PrivacyProvider>
            <TooltipProvider>
              <App />
            </TooltipProvider>
          </PrivacyProvider>
        </PrefsProvider>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>
)
