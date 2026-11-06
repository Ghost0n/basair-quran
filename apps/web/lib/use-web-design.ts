import { isWebDesign } from "./web-design";

/** True where the web design applies: everywhere since the responsive design (kept for its callers). */
export function useWebDesign(): boolean {
  return isWebDesign();
}
