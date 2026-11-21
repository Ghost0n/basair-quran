package app.basair.keycloak.emailcode;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.security.SecureRandom;
import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.Test;

class EmailCodeTest {

    @Test
    void generatesSixDigitsWithLeadingZerosKept() {
        SecureRandom random = new SecureRandom();
        Set<Character> firsts = new HashSet<>();
        for (int i = 0; i < 2000; i++) {
            String code = EmailCode.generate(random);
            assertEquals(EmailCode.LENGTH, code.length());
            assertTrue(code.chars().allMatch(Character::isDigit), code);
            firsts.add(code.charAt(0));
        }
        // Every first digit shows up, 0 included: no number formatting drops it.
        assertEquals(10, firsts.size());
    }

    @Test
    void readsArabicIndicAndPersianDigitsAndIgnoresSpacing() {
        assertEquals("012345", EmailCode.normalize("012345"));
        assertEquals("012345", EmailCode.normalize("٠١٢٣٤٥"));
        assertEquals("012345", EmailCode.normalize("۰۱۲۳۴۵"));
        assertEquals("012345", EmailCode.normalize(" 012 345 "));
        assertEquals("012345", EmailCode.normalize("012-345"));
        assertEquals("012345", EmailCode.normalize("‏٠١٢ ٣٤٥"));
    }

    @Test
    void refusesAnythingElse() {
        assertNull(EmailCode.normalize(null));
        assertNull(EmailCode.normalize(""));
        assertNull(EmailCode.normalize("01234"));
        assertNull(EmailCode.normalize("0123456"));
        assertNull(EmailCode.normalize("01234a"));
        assertNull(EmailCode.normalize("０１２３４５")); // full-width digits are not ours
    }

    @Test
    void matchesOnlyTheStoredCode() {
        String salt = EmailCode.salt();
        String hash = EmailCode.hash(salt, "048213");
        assertTrue(EmailCode.matches("048213", salt, hash));
        assertTrue(EmailCode.matches("٠٤٨٢١٣", salt, hash));
        assertFalse(EmailCode.matches("048214", salt, hash));
        assertFalse(EmailCode.matches("048213", EmailCode.salt(), hash));
        assertFalse(EmailCode.matches("048213", salt, null));
        assertFalse(EmailCode.matches(null, salt, hash));
    }

    @Test
    void saltsDifferSoHashesDiffer() {
        assertNotEquals(EmailCode.hash(EmailCode.salt(), "111111"), EmailCode.hash(EmailCode.salt(), "111111"));
    }

    @Test
    void timesTheCodeAndTheResend() {
        assertFalse(EmailCode.expired(1000, 1000 + EmailCode.TTL_SECONDS - 1));
        assertTrue(EmailCode.expired(1000, 1000 + EmailCode.TTL_SECONDS));
        assertEquals(EmailCode.RESEND_COOLDOWN_SECONDS, EmailCode.resendWait(1000, 1000));
        assertEquals(1, EmailCode.resendWait(1000, 1000 + EmailCode.RESEND_COOLDOWN_SECONDS - 1));
        assertEquals(0, EmailCode.resendWait(1000, 1000 + EmailCode.RESEND_COOLDOWN_SECONDS));
        assertEquals(0, EmailCode.resendWait(0, 1000));
    }
}
