package app.basair.keycloak.emailcode;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.HexFormat;

/**
 * The code itself, apart from Keycloak (unit-tested): six random digits, kept
 * only as a salted SHA-256 hash, compared in constant time. What the reader
 * types is normalised first: spaces and dashes go, and Arabic-Indic or Persian
 * digits count as the same digits (an Arabic keyboard types ١٢٣).
 */
public final class EmailCode {

    /** Digits in a code. */
    public static final int LENGTH = 6;
    /** A code is good for this long after it is sent. */
    public static final long TTL_SECONDS = 10 * 60;
    /** Wrong tries before the code is replaced by a new one. */
    public static final int MAX_TRIES = 5;
    /** The wait between two sends. */
    public static final long RESEND_COOLDOWN_SECONDS = 60;
    /** Codes sent in one sign-in, at most (no mailbox flooding). */
    public static final int MAX_SENDS = 5;

    private static final SecureRandom RANDOM = new SecureRandom();

    private EmailCode() {
    }

    /** A new code: {@code LENGTH} uniformly random digits (leading zeros kept). */
    public static String generate() {
        return generate(RANDOM);
    }

    static String generate(SecureRandom random) {
        StringBuilder code = new StringBuilder(LENGTH);
        for (int i = 0; i < LENGTH; i++) {
            code.append((char) ('0' + random.nextInt(10)));
        }
        return code.toString();
    }

    /** A fresh salt for one code. */
    public static String salt() {
        byte[] bytes = new byte[16];
        RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    /** The stored form of a code: hex SHA-256 of salt and code. */
    public static String hash(String salt, String code) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(salt.getBytes(StandardCharsets.UTF_8));
            digest.update((byte) ':');
            digest.update(code.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }

    /**
     * What the reader typed, as ASCII digits: Arabic-Indic (U+0660–0669) and
     * Persian (U+06F0–06F9) digits are mapped; spaces, dashes and the
     * direction marks a paste can carry are dropped. Null when anything else
     * is left or the length is wrong.
     */
    public static String normalize(String typed) {
        if (typed == null) {
            return null;
        }
        StringBuilder digits = new StringBuilder(LENGTH);
        for (int i = 0; i < typed.length(); i++) {
            char c = typed.charAt(i);
            if (c >= '0' && c <= '9') {
                digits.append(c);
            } else if (c >= '٠' && c <= '٩') {
                digits.append((char) ('0' + (c - '٠')));
            } else if (c >= '۰' && c <= '۹') {
                digits.append((char) ('0' + (c - '۰')));
            } else if (Character.isWhitespace(c) || c == '-' || c == '‎' || c == '‏' || c == '؜' || c == ' ') {
                continue;
            } else {
                return null;
            }
        }
        return digits.length() == LENGTH ? digits.toString() : null;
    }

    /** Whether {@code typed} is the code stored as {@code expectedHash} (constant time). */
    public static boolean matches(String typed, String salt, String expectedHash) {
        String code = normalize(typed);
        if (code == null || salt == null || expectedHash == null) {
            return false;
        }
        byte[] actual = hash(salt, code).getBytes(StandardCharsets.US_ASCII);
        byte[] expected = expectedHash.getBytes(StandardCharsets.US_ASCII);
        return MessageDigest.isEqual(actual, expected);
    }

    /** Seconds still to wait before another send (0 when it may go now). */
    public static long resendWait(long lastSentAtSeconds, long nowSeconds) {
        return Math.max(0, lastSentAtSeconds + RESEND_COOLDOWN_SECONDS - nowSeconds);
    }

    /** Whether a code sent at {@code sentAtSeconds} has run out. */
    public static boolean expired(long sentAtSeconds, long nowSeconds) {
        return nowSeconds >= sentAtSeconds + TTL_SECONDS;
    }
}
