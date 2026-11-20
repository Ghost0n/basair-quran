<#import "template.ftl" as layout>
<@layout.emailLayout preheader=msg("qbEmailCodePreview", code)>
<h1 style="margin:0 0 10px;font-size:21px;line-height:1.5;font-weight:700;color:#f4ecd8;">${msg("qbEmailCodeTitle")}</h1>
<p style="color:#c9c0a8;">${msg("qbEmailCodeIntro")}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px;">
  <tr>
    <td align="center" dir="ltr" style="background:#131210;border:1px solid #5e4708;border-radius:12px;padding:20px 12px;"><span style="display:inline-block;padding-left:12px;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,'Helvetica Neue',Arial,sans-serif;font-size:36px;line-height:1.2;font-weight:700;letter-spacing:12px;color:#e0c14a;font-variant-numeric:tabular-nums;">${code}</span></td>
  </tr>
</table>
<p style="font-size:14px;color:#c9c0a8;">${msg("qbEmailCodeExpiry", minutes)}</p>
<p style="margin:0 0 16px;padding-top:14px;border-top:1px solid #2c271c;font-size:13px;line-height:1.7;color:#8d8674;">${msg("qbEmailCodeIgnore")}</p>
</@layout.emailLayout>
