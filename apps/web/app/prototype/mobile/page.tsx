import { UxPrototypeSwitch } from "@/features/shell/ux-prototype-switch";

// Prototype route: turns the phone ergonomics prototype on or off for this
// device (lib/ux-prototype.ts), then opens the app.
export default function MobilePrototypePage() {
  return <UxPrototypeSwitch />;
}
