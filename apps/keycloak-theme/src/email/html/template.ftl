<#--
  Every HTML mail's frame, in the web's design (apps/web/app/tokens.css, dark):
  the wordmark in gold, one quiet card, a quiet footer with the name and domain.
  Arabic first: Keycloak sets `ltr` from the mail's language. Mail clients load
  no web fonts and drop most CSS, so the look rests on inline styles, tables and
  fonts the reader's system already has (the web's Amiri and Cairo first, for
  the rare reader who has them, then each system's own Arabic and UI faces);
  the <style> block only adds the button and spacing where it is supported.
  `preheader` is the inbox's preview line, hidden in the mail itself.
-->
<#macro emailLayout preheader="">
<#assign dir = (ltr)?then("ltr", "rtl")>
<#assign start = (ltr)?then("left", "right")>
<#assign sans = "Cairo,'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,'Noto Sans Arabic','Geeza Pro',Tahoma,Arial,sans-serif">
<!doctype html>
<html lang="${locale.language}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<style>
  .qb-mail p { margin: 0 0 16px; }
  .qb-mail a { color: #e0c14a; font-weight: 700; }
  .qb-mail p > a:only-child {
    display: inline-block; padding: 12px 22px; border-radius: 999px;
    background: #d4af37; color: #1f1702; text-decoration: none;
  }
  @media (max-width: 480px) { .qb-card { padding: 26px 20px 10px !important; } }
</style>
</head>
<body style="margin:0;padding:0;background:#131210;-webkit-text-size-adjust:100%;">
<#if preheader?has_content>
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#131210;">${preheader}<#list 1..60 as i>&#8199;&#847;</#list></div>
</#if>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#131210;">
  <tr>
    <td align="center" style="padding:40px 16px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
        <tr>
          <td align="center" style="padding:0 0 26px;">
            <div lang="ar" dir="rtl" style="font-family:Amiri,'Amiri Quran','Sakkal Majalla','Mishafi','Noto Naskh Arabic','Traditional Arabic','Times New Roman',serif;font-size:34px;line-height:1.7;color:#d4af37;">بَصَائِر القُرآن</div>          </td>
        </tr>
        <tr>
          <td class="qb-mail qb-card" dir="${dir}" style="background:#1c1a14;border:1px solid #33291a;border-top:2px solid #a8862a;border-radius:16px;padding:32px 32px 14px;text-align:${start};font-family:${sans};font-size:15px;line-height:1.8;color:#e9e1cc;">
            <#nested>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:24px 8px 0;font-family:${sans};font-size:12px;line-height:1.7;color:#6f6959;">
            <span lang="ar" dir="rtl">بصائر القرآن</span>&nbsp;&nbsp;·&nbsp;&nbsp;<span dir="ltr" style="color:#6f6959;text-decoration:none;">basairquran.com</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
</#macro>
