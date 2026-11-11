"""Checking an email address someone gives us, without sending to it.

Used where a guest leaves an address to be answered (the feedback centre,
docs/feedback-centre.md): it keeps out typos and throwaway or made-up
addresses that would only bring spam, with no code to confirm.

1. The syntax: one ``@``, a plain local part (at most 64 characters, no dot
   at either end or two in a row), a domain of labels and a letter TLD.
2. Domains that never receive mail here: the reserved ones (example.com,
   ``.test``, ``.invalid``, ``.localhost``…) and well-known disposable
   inboxes.
3. The domain takes mail: it has an MX record, or else an address (RFC 5321's
   implicit MX), and not a "null MX" (RFC 7505). A domain that doesn't exist
   is refused — once the resolver has shown it finds a well-known one (a
   resolver that knows nothing would refuse everyone). A lookup that fails
   for any other reason (no network, a slow resolver) lets the address
   through, so an outage never blocks a real sender.
"""

from __future__ import annotations

import re
import socket
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout

LOOKUP_TIMEOUT = 3.0
CACHE_SECONDS = 6 * 3600

_LOCAL = re.compile(r"^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$")
_LABEL = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$")
_TLD = re.compile(r"^(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{1,59})$")

RESERVED_SUFFIXES = (".test", ".example", ".invalid", ".localhost", ".local", ".internal", ".lan", ".home.arpa")
RESERVED_DOMAINS = frozenset({"example.com", "example.org", "example.net", "localhost"})

# Throwaway inboxes: an address there is meant to stop working.
DISPOSABLE_DOMAINS = frozenset(
    {
        "10minutemail.com",
        "20minutemail.com",
        "burnermail.io",
        "discard.email",
        "dispostable.com",
        "emailondeck.com",
        "fakeinbox.com",
        "getairmail.com",
        "getnada.com",
        "guerrillamail.com",
        "guerrillamail.net",
        "guerrillamailblock.com",
        "harakirimail.com",
        "inboxkitten.com",
        "mailcatch.com",
        "maildrop.cc",
        "mailinator.com",
        "mailnesia.com",
        "mailpoof.com",
        "mintemail.com",
        "mohmal.com",
        "moakt.com",
        "mytemp.email",
        "sharklasers.com",
        "spamgourmet.com",
        "temp-mail.org",
        "tempail.com",
        "tempmail.com",
        "tempmail.net",
        "tempmailo.com",
        "throwawaymail.com",
        "trashmail.com",
        "trashmail.de",
        "yopmail.com",
        "yopmail.fr",
    }
)


class EmailError(ValueError):
    """`code`: email_invalid (syntax), email_domain (no mail there), email_disposable."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def normalize(email: str) -> str:
    """The address as given, trimmed, with its domain in lower case."""
    local, _, domain = (email or "").strip().rpartition("@")
    return f"{local}@{domain.lower().rstrip('.')}" if local else (email or "").strip()


def check_syntax(email: str) -> str:
    """The normalized address, or EmailError(email_invalid)."""
    address = normalize(email)
    local, at, domain = address.rpartition("@")
    labels = domain.split(".")
    if (
        not at
        or len(address) > 254
        or not local
        or len(local) > 64
        or not _LOCAL.match(local)
        or len(labels) < 2
        or not all(_LABEL.match(label) for label in labels)
        or not _TLD.match(labels[-1])
    ):
        raise EmailError("email_invalid", "This email address doesn't look right.")
    return address


def check_domain(domain: str) -> None:
    """EmailError(email_domain / email_disposable) when the domain takes no (lasting) mail."""
    if domain in RESERVED_DOMAINS or domain.endswith(RESERVED_SUFFIXES):
        raise EmailError("email_domain", "This email domain doesn't receive mail.")
    if domain in DISPOSABLE_DOMAINS or any(domain.endswith(f".{item}") for item in DISPOSABLE_DOMAINS):
        raise EmailError("email_disposable", "Please use a lasting email address, not a temporary one.")
    if not domain_accepts_mail(domain):
        raise EmailError("email_domain", "This email domain doesn't receive mail.")


def validate(email: str) -> str:
    """The normalized address once it passes every check, else EmailError."""
    address = check_syntax(email)
    check_domain(address.rpartition("@")[2])
    return address


# --- The DNS lookup -----------------------------------------------------------

_cache: dict[str, tuple[bool, float]] = {}
_cache_lock = threading.Lock()
_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="email-dns")


def domain_accepts_mail(domain: str) -> bool:
    """True unless the domain surely takes no mail (cached for a few hours)."""
    now = time.monotonic()
    with _cache_lock:
        cached = _cache.get(domain)
        if cached and now - cached[1] < CACHE_SECONDS:
            return cached[0]
    try:
        answer = _pool.submit(_lookup, domain).result(timeout=LOOKUP_TIMEOUT + 0.5)
    except FutureTimeout:
        return True  # undecided: let it through, and don't remember it
    except Exception:
        return True
    if answer is None:
        return True
    with _cache_lock:
        if len(_cache) > 5000:
            _cache.clear()
        _cache[domain] = (answer, now)
    return answer


# A domain that surely exists and takes mail: the resolver's sanity check.
CANARY_DOMAIN = "gmail.com"
CANARY_SECONDS = 600
_canary: tuple[bool, float] | None = None


def _resolver_works() -> bool:
    """The resolver finds a well-known mail domain (remembered for a few minutes)."""
    global _canary
    now = time.monotonic()
    if _canary and now - _canary[1] < CANARY_SECONDS:
        return _canary[0]
    works = _raw_lookup(CANARY_DOMAIN) is True
    _canary = (works, now)
    return works


def _lookup(domain: str) -> bool | None:
    """True / False when the DNS says so; None when it couldn't tell."""
    answer = _raw_lookup(domain)
    if answer is False and not _resolver_works():
        return None  # the resolver finds nothing at all: no verdict
    return answer


def _raw_lookup(domain: str) -> bool | None:
    try:
        import dns.exception
        import dns.resolver
    except ImportError:
        return _lookup_address(domain)
    resolver = dns.resolver.Resolver()
    resolver.lifetime = LOOKUP_TIMEOUT
    try:
        records = resolver.resolve(domain, "MX")
        exchanges = [str(record.exchange).rstrip(".") for record in records]
        # RFC 7505: a lone "0 ." says the domain takes no mail.
        return any(exchanges)
    except dns.resolver.NXDOMAIN:
        return False
    except dns.resolver.NoAnswer:
        pass  # no MX: mail goes to the domain's own address, if it has one
    except dns.exception.DNSException:
        return None
    for kind in ("A", "AAAA"):
        try:
            resolver.resolve(domain, kind)
            return True
        except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
            continue
        except dns.exception.DNSException:
            return None
    return False


def _lookup_address(domain: str) -> bool | None:
    """Without dnspython: the domain resolves to an address (no MX lookup)."""
    try:
        socket.getaddrinfo(domain, None)
        return True
    except socket.gaierror as error:
        return False if error.errno in (socket.EAI_NONAME, getattr(socket, "EAI_NODATA", -5)) else None
    except OSError:
        return None
