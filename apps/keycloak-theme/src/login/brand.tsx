import { BRAND_GLYPH_PATH } from "@web/components/brand-glyph.generated";

/**
 * The logo (apps/web/components/brand-mark.tsx `BrandMark`, themed): the hizb
 * star ۞ — two squares in a ring — whose centre dot is the dot of a ب drawn
 * from Amiri Quran. Same geometry on the same 100-unit square.
 */
const squarePoints = (turn: number) =>
  Array.from({ length: 4 }, (_, k) => {
    const angle = ((turn + 45 + 90 * k) * Math.PI) / 180;
    return `${(50 + 41 * Math.cos(angle)).toFixed(2)},${(50 + 41 * Math.sin(angle)).toFixed(2)}`;
  }).join(" ");

export function BrandSeal({ size = 66 }: { size?: number }) {
  return (
    <svg className="qb-kc-seal" width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <circle cx="50" cy="50" r="46" strokeWidth={3.2} />
      {[squarePoints(0), squarePoints(45)].map((points) => (
        <polygon key={points} points={points} strokeWidth={3.4} strokeLinejoin="miter" />
      ))}
      <path className="fill" d={BRAND_GLYPH_PATH} />
      <circle className="fill" cx="50" cy="67" r="4" />
    </svg>
  );
}

/** Sign-in providers' marks, drawn in their own colours (each brand's guidelines ask for it). */
export function ProviderIcon({ alias }: { alias: string }) {
  switch (alias) {
    case "google":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.81z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.28a12 12 0 0 0 0 10.76z" />
          <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.28 6.62l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77z" />
        </svg>
      );
    case "facebook":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <circle cx="12" cy="12" r="12" fill="#0866FF" />
          <path fill="#fff" d="M16.67 15.47 17.2 12h-3.33V9.75c0-.95.47-1.88 1.95-1.88h1.51V4.92s-1.37-.23-2.68-.23c-2.74 0-4.53 1.66-4.53 4.66V12H7.08v3.47h3.04V24a12.1 12.1 0 0 0 3.75 0v-8.53z" />
        </svg>
      );
    case "apple":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            fill="currentColor"
            d="M16.37 12.76c-.03-2.6 2.13-3.86 2.22-3.92-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.8 1.3 10.35.86 1.25 1.89 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.82 1.4-.03 2.29-1.27 3.14-2.53.99-1.45 1.4-2.86 1.42-2.93-.03-.01-2.72-1.05-2.75-4.13zM13.8 5.12c.71-.87 1.2-2.07 1.07-3.27-1.03.04-2.28.69-3.02 1.55-.66.77-1.24 1.99-1.09 3.17 1.15.09 2.32-.58 3.04-1.45z"
          />
        </svg>
      );
    default:
      return <span className="qb-kc-provider-initial" aria-hidden="true" />;
  }
}
