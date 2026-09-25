import { Icon } from "@/components/icon";

import { t } from "@/lib/i18n";

export const TAFSSIR_DISCLAIMER_TEXT =
  "تنبيه — ما يَلي قراءة تفسيرية بشرية مُولَّدة من نموذج لغوي. ليست حُجَّة شرعية ولا تَنُوب عن أهل العلم. الدليل الوحيد المُعتَمَد هنا هو القرآن الكريم.";

/**
 * The experimental Tafssir disclaimer — a first-class component so its
 * wording lives in exactly one place (per HANDOFF_CONVENTIONS).
 */
export function TafssirDisclaimer({ text }: { text?: string | null }) {
  return (
    <div className="qb-tafssir-warn" role="note">
      <Icon name="alert" size={14} />
      <div>
        <strong>{t("قراءة تفسيرية تجريبية")}</strong>
        {text || t(TAFSSIR_DISCLAIMER_TEXT)}
      </div>
    </div>
  );
}
