"""A guest's email address, checked without sending to it (src/app/services/email_check.py)."""

import pytest

from src.app.services import email_check


@pytest.fixture
def dns(monkeypatch):
    """A fake resolver: domain → True (takes mail) / False (doesn't exist, null MX) / None (no verdict)."""
    answers: dict[str, bool | None] = {"gmail.com": True}
    monkeypatch.setattr(email_check, "_raw_lookup", lambda domain: answers.get(domain, False))
    monkeypatch.setattr(email_check, "_cache", {})
    monkeypatch.setattr(email_check, "_canary", None)
    return answers


@pytest.mark.parametrize(
    "address",
    ["plain", "two@@at.com", "@gmail.com", "name@", "a..b@gmail.com", ".a@gmail.com", "a.@gmail.com", "a b@gmail.com",
     "a@gmail", "a@-gmail.com", "a@gmail.c0m", "a@gmail.c", f"{'x' * 65}@gmail.com"],
)
def test_refuses_malformed_addresses(dns, address):
    with pytest.raises(email_check.EmailError) as error:
        email_check.validate(address)
    assert error.value.code == "email_invalid"


def test_accepts_ordinary_addresses_and_normalizes_the_domain(dns):
    dns.update({"sub.example.co.uk": True, "outlook.fr": True})
    assert email_check.validate("  Name+tag@GMAIL.com ") == "Name+tag@gmail.com"
    assert email_check.validate("first.last@sub.example.co.uk") == "first.last@sub.example.co.uk"
    assert email_check.validate("a@outlook.fr") == "a@outlook.fr"


@pytest.mark.parametrize("address", ["a@example.com", "a@mail.test", "a@x.invalid", "a@localhost.localhost", "a@box.local"])
def test_refuses_reserved_domains(dns, address):
    with pytest.raises(email_check.EmailError) as error:
        email_check.validate(address)
    assert error.value.code == "email_domain"


@pytest.mark.parametrize("address", ["a@mailinator.com", "a@yopmail.com", "a@inbox.guerrillamail.com"])
def test_refuses_throwaway_inboxes(dns, address):
    with pytest.raises(email_check.EmailError) as error:
        email_check.validate(address)
    assert error.value.code == "email_disposable"


def test_refuses_a_domain_that_takes_no_mail(dns):
    # Doesn't exist, or a null MX (both read as False from the lookup).
    with pytest.raises(email_check.EmailError) as error:
        email_check.validate("someone@gmial.con")
    assert error.value.code == "email_domain"


def test_lets_an_address_through_when_the_dns_cant_tell(dns):
    dns["slow-resolver.org"] = None
    assert email_check.validate("a@slow-resolver.org") == "a@slow-resolver.org"


def test_a_resolver_that_finds_nothing_refuses_no_one(dns):
    dns["gmail.com"] = False  # even the canary "doesn't exist": the resolver is broken
    assert email_check.validate("a@gmail.com") == "a@gmail.com"
    assert email_check.validate("a@any-domain.org") == "a@any-domain.org"
