package app.basair.keycloak.emailcode;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import jakarta.ws.rs.core.MultivaluedMap;

import org.jboss.logging.Logger;
import org.keycloak.authentication.RequiredActionContext;
import org.keycloak.authentication.RequiredActionProvider;
import org.keycloak.common.util.Time;
import org.keycloak.email.EmailException;
import org.keycloak.email.EmailTemplateProvider;
import org.keycloak.events.Details;
import org.keycloak.events.Errors;
import org.keycloak.events.EventType;
import org.keycloak.forms.login.LoginFormsProvider;
import org.keycloak.models.UserModel;
import org.keycloak.sessions.AuthenticationSessionModel;

/**
 * «qb-verify-email-code»: an account's email is verified by a 6-digit code
 * sent to it, typed on the sign-in pages (docs/keycloak.md «Email code»), in
 * place of Keycloak's link. Runs for any account whose email is not verified
 * yet (sign-up, an email changed later, a provider that does not vouch for
 * it); the realm turns Keycloak's own link off (scripts/keycloak_realm.py).
 *
 * <p>The code lives in the sign-in's authentication session only, hashed;
 * it expires after 10 minutes, is replaced after 5 wrong tries, a new one can
 * be sent once a minute and at most 5 times per sign-in.
 */
public class EmailCodeAction implements RequiredActionProvider {

    public static final String ID = "qb-verify-email-code";
    /** The page (apps/keycloak-theme: KcContext.ts, pages/LoginEmailCode.tsx). */
    public static final String PAGE = "login-email-code.ftl";
    /** The mail's body template (apps/keycloak-theme/src/email/{html,text}/). */
    static final String MAIL_TEMPLATE = "qb-email-code.ftl";
    static final String MAIL_SUBJECT = "qbEmailCodeSubject";

    private static final Logger LOG = Logger.getLogger(EmailCodeAction.class);

    private static final String NOTE_HASH = "qb.emailCode.hash";
    private static final String NOTE_SALT = "qb.emailCode.salt";
    private static final String NOTE_SENT_AT = "qb.emailCode.sentAt";
    private static final String NOTE_TRIES = "qb.emailCode.tries";
    private static final String NOTE_SENDS = "qb.emailCode.sends";
    /** The address the code went to: a code is only good for that address. */
    private static final String NOTE_EMAIL = "qb.emailCode.email";

    @Override
    public void evaluateTriggers(RequiredActionContext context) {
        UserModel user = context.getUser();
        if (user.getEmail() != null && !user.isEmailVerified()) {
            user.addRequiredAction(ID);
        }
    }

    @Override
    public void requiredActionChallenge(RequiredActionContext context) {
        UserModel user = context.getUser();
        if (user.isEmailVerified() || user.getEmail() == null) {
            context.success();
            return;
        }
        AuthenticationSessionModel auth = context.getAuthenticationSession();
        long now = Time.currentTime();
        // The first visit sends the code; a reload does not send another.
        if (!hasLiveCode(auth, user, now)) {
            if (!send(context, now)) {
                context.challenge(page(context).setError("emailSendErrorMessage").createForm(PAGE));
                return;
            }
        }
        context.challenge(page(context).createForm(PAGE));
    }

    @Override
    public void processAction(RequiredActionContext context) {
        UserModel user = context.getUser();
        AuthenticationSessionModel auth = context.getAuthenticationSession();
        MultivaluedMap<String, String> form = context.getHttpRequest().getDecodedFormParameters();
        long now = Time.currentTime();

        if (form.containsKey("resend")) {
            long wait = EmailCode.resendWait(longNote(auth, NOTE_SENT_AT), now);
            if (wait > 0) {
                context.challenge(page(context).setError("emailVerifySendCooldown", wait).createForm(PAGE));
            } else if (intNote(auth, NOTE_SENDS) >= EmailCode.MAX_SENDS) {
                context.challenge(page(context).setError("qbEmailCodeSendLimit").createForm(PAGE));
            } else if (send(context, now)) {
                context.challenge(page(context).setSuccess("qbEmailCodeSent").createForm(PAGE));
            } else {
                context.challenge(page(context).setError("emailSendErrorMessage").createForm(PAGE));
            }
            return;
        }

        if (!hasLiveCode(auth, user, now)) {
            // Expired (or the address changed): a new code goes out, if one may.
            boolean sent = intNote(auth, NOTE_SENDS) < EmailCode.MAX_SENDS && send(context, now);
            context.challenge(page(context).setError(sent ? "qbEmailCodeExpired" : "qbEmailCodeSendLimit").createForm(PAGE));
            return;
        }

        String typed = form.getFirst("code");
        if (EmailCode.matches(typed, auth.getAuthNote(NOTE_SALT), auth.getAuthNote(NOTE_HASH))) {
            clear(auth);
            user.setEmailVerified(true);
            user.removeRequiredAction(ID);
            // Keycloak's own link action, should it be pending, has nothing left to do.
            user.removeRequiredAction(UserModel.RequiredAction.VERIFY_EMAIL);
            context.getEvent().clone().event(EventType.VERIFY_EMAIL).detail(Details.EMAIL, user.getEmail()).success();
            context.success();
            return;
        }

        int tries = intNote(auth, NOTE_TRIES) + 1;
        auth.setAuthNote(NOTE_TRIES, Integer.toString(tries));
        context.getEvent().clone().event(EventType.VERIFY_EMAIL_ERROR).detail(Details.EMAIL, user.getEmail())
                .error(Errors.INVALID_CODE);
        if (tries >= EmailCode.MAX_TRIES) {
            // Too many wrong tries: this code is spent; a new one goes out, if one may.
            auth.removeAuthNote(NOTE_HASH);
            boolean sent = intNote(auth, NOTE_SENDS) < EmailCode.MAX_SENDS && send(context, now);
            context.challenge(page(context).setError(sent ? "qbEmailCodeTooMany" : "qbEmailCodeSendLimit").createForm(PAGE));
            return;
        }
        LoginFormsProvider page = page(context);
        page.setAttribute("qbCodeTriesLeft", EmailCode.MAX_TRIES - tries);
        context.challenge(page.setError("qbEmailCodeInvalid").createForm(PAGE));
    }

    /** The page's form, with what it shows: the address, the code's length and lifetime, the resend wait. */
    private LoginFormsProvider page(RequiredActionContext context) {
        AuthenticationSessionModel auth = context.getAuthenticationSession();
        long now = Time.currentTime();
        return context.form()
                .setAttribute("qbCodeEmail", context.getUser().getEmail())
                .setAttribute("qbCodeLength", EmailCode.LENGTH)
                .setAttribute("qbCodeMinutes", EmailCode.TTL_SECONDS / 60)
                .setAttribute("qbCodeResendIn", EmailCode.resendWait(longNote(auth, NOTE_SENT_AT), now))
                .setAttribute("qbCodeSendsLeft", Math.max(0, EmailCode.MAX_SENDS - intNote(auth, NOTE_SENDS)));
    }

    private boolean hasLiveCode(AuthenticationSessionModel auth, UserModel user, long now) {
        return auth.getAuthNote(NOTE_HASH) != null
                && user.getEmail().equalsIgnoreCase(auth.getAuthNote(NOTE_EMAIL))
                && !EmailCode.expired(longNote(auth, NOTE_SENT_AT), now);
    }

    /** A new code, mailed; the old one stops working. False when the mail could not be sent. */
    private boolean send(RequiredActionContext context, long now) {
        UserModel user = context.getUser();
        AuthenticationSessionModel auth = context.getAuthenticationSession();
        String code = EmailCode.generate();
        String salt = EmailCode.salt();
        Map<String, Object> attributes = new HashMap<>();
        attributes.put("code", code);
        attributes.put("minutes", EmailCode.TTL_SECONDS / 60);
        try {
            context.getSession().getProvider(EmailTemplateProvider.class)
                    .setRealm(context.getRealm())
                    .setUser(user)
                    .setAuthenticationSession(auth)
                    .send(MAIL_SUBJECT, List.of(), MAIL_TEMPLATE, attributes);
        } catch (EmailException e) {
            LOG.warnf(e, "email code: could not send to user %s", user.getId());
            context.getEvent().clone().event(EventType.SEND_VERIFY_EMAIL_ERROR).detail(Details.EMAIL, user.getEmail())
                    .error(Errors.EMAIL_SEND_FAILED);
            return false;
        }
        auth.setAuthNote(NOTE_SALT, salt);
        auth.setAuthNote(NOTE_HASH, EmailCode.hash(salt, code));
        auth.setAuthNote(NOTE_SENT_AT, Long.toString(now));
        auth.setAuthNote(NOTE_TRIES, "0");
        auth.setAuthNote(NOTE_SENDS, Integer.toString(intNote(auth, NOTE_SENDS) + 1));
        auth.setAuthNote(NOTE_EMAIL, user.getEmail());
        context.getEvent().clone().event(EventType.SEND_VERIFY_EMAIL).detail(Details.EMAIL, user.getEmail()).success();
        return true;
    }

    private static void clear(AuthenticationSessionModel auth) {
        for (String note : new String[] {NOTE_HASH, NOTE_SALT, NOTE_SENT_AT, NOTE_TRIES, NOTE_SENDS, NOTE_EMAIL}) {
            auth.removeAuthNote(note);
        }
    }

    private static long longNote(AuthenticationSessionModel auth, String name) {
        try {
            String value = auth.getAuthNote(name);
            return value == null ? 0 : Long.parseLong(value);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static int intNote(AuthenticationSessionModel auth, String name) {
        return (int) longNote(auth, name);
    }

    @Override
    public void close() {
    }
}
