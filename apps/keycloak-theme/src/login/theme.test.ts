import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import english from "keycloakify/login/i18n/messages_defaultSet/en";
import { describe, expect, it } from "vitest";

import { LOCALES } from "@web/lib/i18n/locales";

import { classes } from "./classes";
import { KEYCLOAK_TAGS, keycloakTag, localeDigits, localeDirection, nativeName, webCode } from "./locales";

const here = path.dirname(fileURLToPath(import.meta.url));
const themeRoot = path.resolve(here, "../..");
const repoRoot = path.resolve(themeRoot, "../..");
const i18nSource = fs.readFileSync(path.join(here, "i18n.ts"), "utf8");

/** Keycloakify ships these; i18n.ts adds the rest of the web's languages. */
const KEYCLOAKIFY_LANGUAGES = fs
  .readdirSync(path.join(themeRoot, "node_modules/keycloakify/login/i18n/messages_defaultSet"))
  .filter((file) => /^[a-z]{2}(-[A-Z]{2})?\.js$/.test(file))
  .map((file) => file.slice(0, -3));

const extraLanguages = [...i18nSource.matchAll(/^\s+(\w+): \{ label: "([^"]+)", getMessages: \(\) => import\("\.\/i18n\/(\w+)"\) \}/gm)].map(
  ([, tag, label, file]) => ({ tag, label, file }),
);

describe("interface languages", () => {
  it("covers every web language, with the web's names", () => {
    const extras = new Set(extraLanguages.map(({ tag }) => tag));
    for (const tag of KEYCLOAK_TAGS) {
      expect(KEYCLOAKIFY_LANGUAGES.includes(tag) || extras.has(tag), tag).toBe(true);
    }
    expect(extraLanguages.length).toBe(11);
    for (const { tag, label, file } of extraLanguages) {
      expect(KEYCLOAKIFY_LANGUAGES).not.toContain(tag);
      expect(file).toBe(tag);
      expect(label).toBe(LOCALES.find((locale) => locale.code === tag)?.native);
    }
  });

  it("matches the realm's supported locales (scripts/keycloak_realm.py)", () => {
    const realm = fs.readFileSync(path.join(repoRoot, "scripts/keycloak_realm.py"), "utf8");
    const block = realm.match(/^LOCALES = \[([\s\S]*?)\]/m)?.[1] ?? "";
    const realmLocales = [...block.matchAll(/"([^"]+)"/g)].map(([, tag]) => tag);
    expect(realmLocales).toEqual([...KEYCLOAK_TAGS]);
  });

  it("takes each language's direction from the web, not Keycloakify's list", () => {
    expect(["ar", "fa", "ur"].map(localeDirection)).toEqual(["rtl", "rtl", "rtl"]);
    // Keycloakify counts Azerbaijani as right to left; the web writes it in Latin script.
    expect(["az", "en", "fr", "zh-CN", "ko"].map(localeDirection)).toEqual(["ltr", "ltr", "ltr", "ltr", "ltr"]);
    expect(webCode("zh-CN")).toBe("zh");
    expect(keycloakTag("zh")).toBe("zh-CN");
    expect(nativeName("zh-CN")).toBe("中文");
    expect(webCode("pt-BR")).toBe("pt");
    expect(webCode("xx")).toBe("ar");
  });

  it("writes numbers in the language's own digits, as the web does by default", () => {
    expect(localeDigits("ar", 56)).toBe("٥٦");
    expect(localeDigits("fa", 10)).toBe("۱۰");
    expect(localeDigits("ur", 10)).toBe("۱۰");
    expect(localeDigits("en", 56)).toBe("56");
    expect(localeDigits("zh-CN", 4)).toBe("4");
  });
});

describe("messages", () => {
  it("keeps the web's strings in step with the web (scripts/web-messages.mjs --check)", () => {
    expect(() => execFileSync(process.execPath, [path.join(themeRoot, "scripts/web-messages.mjs"), "--check"], { stdio: "pipe" })).not.toThrow();
  });

  it("says what the web says in Arabic", () => {
    const arabic = i18nSource.match(/^ {6}"ar": (\{.*\}),$/m)?.[1];
    const messages = JSON.parse(arabic ?? "{}");
    expect(messages).toMatchObject({ doLogIn: "دخول", qbSignUp: "حساب جديد", email: "البريد الإلكتروني", doForgotPassword: "نسيتها؟" });
  });

  it("writes Keycloak's English-only messages in every language, parameter kept", () => {
    const blocks = [...i18nSource.matchAll(/^ {6}"([\w-]+)": (\{.*\}),$/gm)];
    expect(blocks).toHaveLength(24);
    const own = Object.keys(JSON.parse(fs.readFileSync(path.join(here, "i18n/own-messages.json"), "utf8"))).filter((key) => !key.startsWith("//"));
    const arabic = JSON.parse(blocks.find(([, tag]) => tag === "ar")?.[2] ?? "{}") as Record<string, string>;
    for (const [, tag, json] of blocks) {
      const messages = JSON.parse(json) as Record<string, string>;
      for (const key of own) {
        const text = messages[key];
        expect(text, `${tag}.${key}`).toBeTypeOf("string");
        if (arabic[key].includes("{0}")) expect(text, `${tag}.${key}`).toContain("{0}");
        // MessageFormat reads an ASCII apostrophe as a quote: it would swallow the parameter.
        expect(text, `${tag}.${key}`).not.toContain("'");
      }
    }
  });

  it("has words for every message the email-code page and its action use", () => {
    const arabic = JSON.parse(i18nSource.match(/^ {6}"ar": (\{.*\}),$/m)?.[1] ?? "{}") as Record<string, string>;
    const page = fs.readFileSync(path.join(here, "pages/LoginEmailCode.tsx"), "utf8");
    const action = fs.readFileSync(
      path.join(repoRoot, "apps/keycloak-email-code/src/main/java/app/basair/keycloak/emailcode/EmailCodeAction.java"),
      "utf8",
    );
    const used = [
      ...[...page.matchAll(/msg(?:Str)?\("(\w+)"/g)].map(([, key]) => key),
      ...[...action.matchAll(/set(?:Error|Success)\("(\w+)"/g)].map(([, key]) => key),
      ...[...action.matchAll(/\? "(qb\w+)" : "(qb\w+)"/g)].flatMap(([, a, b]) => [a, b]),
    ];
    expect(used.length).toBeGreaterThan(10);
    // emailSendErrorMessage is Keycloak's own, in every language.
    for (const key of used.filter((key) => key !== "emailSendErrorMessage")) expect(arabic, key).toHaveProperty(key);
  });

  it("makes sign-in and sign-up one account page: the same tabs and providers on both", () => {
    const arabic = JSON.parse(i18nSource.match(/^ {6}"ar": (\{.*\}),$/m)?.[1] ?? "{}") as Record<string, string>;
    const choice = fs.readFileSync(path.join(here, "pages/AccountChoice.tsx"), "utf8");
    const kcPage = fs.readFileSync(path.join(here, "KcPage.tsx"), "utf8");
    expect(kcPage).toMatch(/case "register\.ftl":\s*return \(\s*<Register\b/);
    for (const [file, active] of [["Login", "login"], ["Register", "register"]]) {
      const page = fs.readFileSync(path.join(here, `pages/${file}.tsx`), "utf8");
      expect(page, file).toContain(`<AccountChoice`);
      expect(page, file).toContain(`active="${active}"`);
      // The tabs replace «مستخدم جديد؟ حساب جديد» and «العودة لتسجيل الدخول».
      expect(page, file).not.toMatch(/msg\("(noAccount|backToLogin)"\)/);
    }
    // The tabs switch in place (inPlace.ts): nothing on the account page may use Keycloakify's
    // once-only script hooks, which reload the page when their component mounts again.
    expect(choice).toContain("openInPlace(href)");
    const template = fs.readFileSync(path.join(here, "Template.tsx"), "utf8");
    expect(template).not.toContain("Template.useInitialize");
    expect(template).toContain("useKeycloakScripts(kcContext)");
    const login = fs.readFileSync(path.join(here, "pages/Login.tsx"), "utf8");
    expect(login.match(/useScript\(/g)?.length).toBe(1);
    expect(login).toMatch(/function PasskeyScripts\([^)]*\) \{\s*useScript\(props\);/);
    const keys = [...choice.matchAll(/msg(?:Str)?\("(\w+)"/g)].map(([, key]) => key);
    expect(keys).toEqual(expect.arrayContaining(["doLogIn", "qbSignUp", "qbOrEmail"]));
    for (const key of keys) expect(arabic, key).toHaveProperty(key);
  });

  it.each(extraLanguages.map(({ tag }) => tag))("drafts %s over Keycloak's own keys, placeholders kept", async (tag) => {
    const source = fs.readFileSync(path.join(here, "i18n", `${tag}.ts`), "utf8");
    // Keycloakify evaluates the `messages` literal statically: it must stay a plain object.
    expect(source).toMatch(/^const messages = \{$/m);
    const module = (await import(`./i18n/${tag}.ts`)) as { default: Record<string, string> };
    const drafted = Object.entries(module.default).filter(([key, text]) => text !== english[key as keyof typeof english]);
    expect(drafted.length).toBeGreaterThan(100);
    for (const [key, text] of drafted) {
      expect(english, `${tag}.${key}`).toHaveProperty(key);
      const placeholders = (value: string) => (value.match(/\{\d+\}/g) ?? []).sort();
      expect(placeholders(text), `${tag}.${key}`).toEqual(placeholders(english[key as keyof typeof english]));
    }
  });
});

describe("mails", () => {
  const template = fs.readFileSync(path.join(themeRoot, "src/email/html/template.ftl"), "utf8");

  it("frames Keycloak's own message, in the mail's direction", () => {
    expect(fs.readFileSync(path.join(themeRoot, "src/email/theme.properties"), "utf8")).toMatch(/^parent=keycloak$/m);
    expect(template).toContain('<#macro emailLayout preheader="">');
    expect(template).toContain("<#nested>");
    expect(template).toMatch(/dir="\$\{dir\}"/);
    expect(template).toMatch(/<#assign dir = \(ltr\)\?then\("ltr", "rtl"\)>/);
  });

  it("loads nothing from the network (mail clients block it)", () => {
    expect(template).not.toMatch(/https?:\/\//);
    expect(template).not.toMatch(/<(img|link|script)\b/i);
  });

  it("writes the email-code mail's words in every language (scripts/email-messages.mjs --check)", () => {
    expect(() => execFileSync(process.execPath, [path.join(themeRoot, "scripts/email-messages.mjs"), "--check"], { stdio: "pipe" })).not.toThrow();
    const english = fs.readFileSync(path.join(themeRoot, "src/email/messages/messages_en.properties"), "utf8");
    expect(english).toMatch(/^qbEmailCodeSubject=Your Basair al-Quran code$/m);
    expect(fs.existsSync(path.join(themeRoot, "src/email/messages/messages_zh_CN.properties"))).toBe(true);
  });

  it("shows the code left to right, in the frame, in both mail formats", () => {
    const html = fs.readFileSync(path.join(themeRoot, "src/email/html/qb-email-code.ftl"), "utf8");
    const text = fs.readFileSync(path.join(themeRoot, "src/email/text/qb-email-code.ftl"), "utf8");
    expect(html).toContain('<#import "template.ftl" as layout>');
    expect(html).toMatch(/dir="ltr"[^>]*>\s*<span[^>]*>\$\{code\}<\/span>/);
    expect(html).not.toMatch(/https?:\/\//);
    // The inbox's preview line carries the code (hidden preheader), not the mail's last sentence.
    expect(html).toContain('<@layout.emailLayout preheader=msg("qbEmailCodePreview", code)>');
    expect(template).toMatch(/<#if preheader\?has_content>\s*<div style="display:none;/);
    expect(text).toMatch(/^<#ftl output_format="plainText">/);
    for (const source of [html, text]) {
      expect(source).toContain('msg("qbEmailCodeExpiry", minutes)');
      expect(source).toContain("${code}");
    }
  });
});

describe("styles", () => {
  it("maps Keycloak's classes to the web's, never to PatternFly", () => {
    expect(classes.kcHtmlClass.split(" ")).toContain("qb-web");
    expect(classes.kcInputClass).toBe("qb-auth-input");
    expect(classes.kcButtonPrimaryClass).toBe("qb-auth-cta");
    for (const value of Object.values(classes)) {
      expect(value).not.toMatch(/\b(pf-|fa |fa-|card-pf|login-pf)/);
    }
  });
});
