"use client";

import "./ux-prototype-switch.css";

import { BrandMark } from "@/components/brand-mark";
import { setUxPrototype, useUxPrototype } from "@/lib/ux-prototype";

import { t } from "@/lib/i18n";

/**
 * `/prototype/mobile`: the switch for the phone ergonomics prototype. It is a
 * device preference (localStorage), so trying it changes nothing for anyone
 * else and nothing on the account.
 */
export function UxPrototypeSwitch() {
  const on = useUxPrototype();

  function choose(value: boolean) {
    setUxPrototype(value);
    window.location.assign("/");
  }

  return (
    <main className="qb-uxswitch">
      <BrandMark size={44} themed />
      <h1>{t("تجربة واجهة الهاتف")}</h1>
      <p>
        {t(
          "نسخة تجريبية من واجهة الهاتف: شريط تنقّل ثابت بخمسة أقسام، وأدوات القراءة وحقل البحث في متناول الإبهام، وأهداف لمس أكبر. تُحفظ على هذا الجهاز فقط ويمكن إيقافها في أي وقت.",
        )}
      </p>
      {on ? <p className="state">{t("الواجهة التجريبية مفعّلة على هذا الجهاز.")}</p> : null}
      <div className="acts">
        <button type="button" className="primary" onClick={() => choose(true)}>
          {t("جرّب الواجهة التجريبية")}
        </button>
        <button type="button" onClick={() => choose(false)}>
          {t("عُد إلى الواجهة الحالية")}
        </button>
      </div>
    </main>
  );
}
