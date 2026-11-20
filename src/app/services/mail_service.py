"""Outbound email (password reset) — SMTP when configured, log otherwise.

Configuration (all optional; without QBASAIR_SMTP_HOST mail is only logged,
which keeps local development and tests free of network access):

    QBASAIR_SMTP_HOST, QBASAIR_SMTP_PORT (default 587),
    QBASAIR_SMTP_USER, QBASAIR_SMTP_PASSWORD,
    QBASAIR_SMTP_SECURITY = "starttls" (default) | "ssl" | "none",
    QBASAIR_MAIL_FROM (default: the SMTP user),
    QBASAIR_PUBLIC_URL (e.g. https://example.org — builds the reset link).

Delivery failures are logged, never raised: the forgot-password endpoint must
answer identically whether or not an account exists or mail went out.
"""

from __future__ import annotations

import logging
import os
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Callable
from urllib.parse import quote

logger = logging.getLogger("q_basair.mail")


@dataclass(frozen=True)
class SmtpSettings:
    host: str
    port: int
    user: str | None
    password: str | None
    security: str
    sender: str


def smtp_settings() -> SmtpSettings | None:
    host = os.environ.get("QBASAIR_SMTP_HOST", "").strip()
    if not host:
        return None
    user = os.environ.get("QBASAIR_SMTP_USER", "").strip() or None
    security = os.environ.get("QBASAIR_SMTP_SECURITY", "starttls").strip().lower()
    if security not in {"starttls", "ssl", "none"}:
        security = "starttls"
    default_port = 465 if security == "ssl" else 587
    try:
        port = int(os.environ.get("QBASAIR_SMTP_PORT", default_port))
    except ValueError:
        port = default_port
    sender = os.environ.get("QBASAIR_MAIL_FROM", "").strip() or user or f"no-reply@{host}"
    return SmtpSettings(
        host=host,
        port=port,
        user=user,
        password=os.environ.get("QBASAIR_SMTP_PASSWORD") or None,
        security=security,
        sender=sender,
    )


def public_url() -> str:
    return os.environ.get("QBASAIR_PUBLIC_URL", "").strip().rstrip("/")


def reset_link(token: str) -> str | None:
    base = public_url()
    return f"{base}/login?reset={quote(token)}" if base else None


def build_reset_message(to: str, token: str, sender: str) -> EmailMessage:
    """Arabic plain-text + HTML reset email. The token is also shown as text so
    a user can paste it when the link can't be opened on this device."""
    link = reset_link(token)
    message = EmailMessage()
    message["Subject"] = "إعادة تعيين كلمة المرور — بصائر"
    message["From"] = sender
    message["To"] = to
    lines = [
        "السلام عليكم،",
        "",
        "وصلنا طلب لإعادة تعيين كلمة المرور لحسابك في «بصائر».",
    ]
    if link:
        lines += ["افتح الرابط التالي لاختيار كلمة مرور جديدة:", link, ""]
    lines += [
        "أو أدخل هذا الرمز في صفحة الدخول ← «نسيتها؟»:",
        token,
        "",
        "الرمز صالح لساعة واحدة ولاستعمال واحد.",
        "إن لم تطلب ذلك فتجاهل هذه الرسالة؛ كلمة مرورك لم تتغيّر.",
    ]
    message.set_content("\n".join(lines))
    link_html = (
        f'<p><a href="{link}" style="background:#c9a227;color:#1a1207;padding:10px 18px;'
        f'border-radius:8px;text-decoration:none;font-weight:bold">اختر كلمة مرور جديدة</a></p>'
        if link
        else ""
    )
    message.add_alternative(
        f"""<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:15px;line-height:1.8">
<p>السلام عليكم،</p>
<p>وصلنا طلب لإعادة تعيين كلمة المرور لحسابك في «بصائر».</p>
{link_html}
<p>أو أدخل هذا الرمز في صفحة الدخول ← «نسيتها؟»:</p>
<p style="font-family:monospace;direction:ltr;text-align:right;background:#f4efe1;padding:8px 12px;border-radius:6px">{token}</p>
<p style="color:#666">الرمز صالح لساعة واحدة ولاستعمال واحد. إن لم تطلب ذلك فتجاهل هذه الرسالة.</p>
</div>""",
        subtype="html",
    )
    return message


def _smtp_send(settings: SmtpSettings, message: EmailMessage) -> None:
    context = ssl.create_default_context()
    if settings.security == "ssl":
        client: smtplib.SMTP = smtplib.SMTP_SSL(settings.host, settings.port, timeout=15, context=context)
    else:
        client = smtplib.SMTP(settings.host, settings.port, timeout=15)
    with client:
        if settings.security == "starttls":
            client.starttls(context=context)
        if settings.user and settings.password:
            client.login(settings.user, settings.password)
        client.send_message(message)


# Swappable in tests.
transport: Callable[[SmtpSettings, EmailMessage], None] = _smtp_send


def send_password_reset(to: str, token: str) -> bool:
    """Send the reset email. Returns True when handed to SMTP; False when only
    logged (no SMTP configured) or when delivery failed."""
    settings = smtp_settings()
    if settings is None:
        # Manual delivery fallback (development / not yet configured).
        logger.info("Password reset for %s — no SMTP configured, token: %s", to, token)
        return False
    try:
        transport(settings, build_reset_message(to, token, settings.sender))
    except Exception:  # noqa: BLE001 — never leak delivery errors to the endpoint
        logger.exception("Password reset email to %s failed", to)
        return False
    logger.info("Password reset email sent to %s", to)
    return True


# Where messages from the contact form (feedback kind "contact") are forwarded.
DEFAULT_CONTACT_EMAIL = "contact@basairquran.com"


def contact_address() -> str:
    return os.environ.get("QBASAIR_CONTACT_EMAIL", "").strip() or DEFAULT_CONTACT_EMAIL


def build_contact_message(
    *,
    to: str,
    sender: str,
    item_id: int,
    message: str,
    reply_to: str | None,
    language: str | None,
    url: str | None,
) -> EmailMessage:
    """A contact-form message as a plain-text email; replying answers the sender."""
    mail = EmailMessage()
    mail["Subject"] = f"رسالة من بصائر — #{item_id}"
    mail["From"] = sender
    mail["To"] = to
    if reply_to:
        mail["Reply-To"] = reply_to
    lines = [
        message.strip(),
        "",
        "—",
        f"#{item_id}",
        f"From: {reply_to or '(signed-in user, no address given)'}",
    ]
    if language:
        lines.append(f"Language: {language}")
    if url:
        lines.append(f"Page: {url}")
    mail.set_content("\n".join(lines))
    return mail


def send_contact_message(
    item_id: int,
    message: str,
    *,
    reply_to: str | None = None,
    language: str | None = None,
    url: str | None = None,
) -> bool:
    """Forward a contact message to the contact address (`QBASAIR_CONTACT_EMAIL`).
    It is kept in the feedback centre either way; True once handed to SMTP."""
    settings = smtp_settings()
    if settings is None:
        logger.info("Contact message #%s kept in the feedback centre — no SMTP configured", item_id)
        return False
    try:
        transport(
            settings,
            build_contact_message(
                to=contact_address(),
                sender=settings.sender,
                item_id=item_id,
                message=message,
                reply_to=reply_to,
                language=language,
                url=url,
            ),
        )
    except Exception:  # noqa: BLE001 — the message is saved; delivery is best effort
        logger.exception("Forwarding contact message #%s failed", item_id)
        return False
    return True
