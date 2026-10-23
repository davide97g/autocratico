// The app's tokens (apps/web/src/index.css), and the accents the spot is allowed to be loud with.
import { loadFont } from "@remotion/google-fonts/Geist";
import { loadFont as loadMono } from "@remotion/google-fonts/GeistMono";

export const SANS = loadFont("normal", { weights: ["400", "500", "600", "700", "800", "900"], subsets: ["latin"] }).fontFamily;
export const MONO = loadMono("normal", { weights: ["400", "500", "600"], subsets: ["latin"] }).fontFamily;

export const C = {
  ink: "#0F0F0F",
  pen: "#171717",
  paper: "#E8E8E8",
  card: "#FDFDFD",
  well: "#F4F4F4",
  muted: "#737373",
  border: "#E5E5E5",
  red: "#DC2627",
  orange: "#E95C12",
  amber: "#EFA810",
  green: "#16A34A",
  blue: "#039BE5",
  work: "#33B679",
  family: "#8E24AA",
  sport: "#F4511E",
  purple: "#8B4FE0",
  pink: "#E04F9A",
  lime: "#B8E04F",
} as const;

/** The creative gradient (apps/web --creative-*), for the words that should shine. */
export const GRADIENT = `linear-gradient(100deg, ${C.purple}, ${C.pink} 55%, ${C.amber})`;
