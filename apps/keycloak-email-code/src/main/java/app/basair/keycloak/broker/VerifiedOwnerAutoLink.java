package app.basair.keycloak.broker;

import java.util.List;

import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.authenticators.broker.IdpAutoLinkAuthenticator;
import org.keycloak.authentication.authenticators.broker.util.ExistingUserInfo;
import org.keycloak.authentication.authenticators.broker.util.SerializedBrokeredIdentityContext;
import org.keycloak.broker.provider.BrokeredIdentityContext;
import org.keycloak.credential.CredentialModel;
import org.keycloak.models.UserModel;
import org.keycloak.sessions.AuthenticationSessionModel;

import app.basair.keycloak.emailcode.EmailCodeAction;

/**
 * Signing in with Google, Apple or Meta when an account with that email already exists: link it and sign in,
 * no «account already exists» step (realm flow «qb first broker login», scripts/keycloak_realm.py).
 *
 * <p>Keycloak's own auto-link ({@link IdpAutoLinkAuthenticator}) keeps its checks here — the email was not
 * edited on the review page, it is the existing account's email, the provider vouches for it (the realm
 * trusts the provider's email, or the provider says it is verified) — but links even when the existing
 * account never confirmed that email: whoever registered someone else's address with a password would keep
 * that password on the real owner's account. Here the provider has just proved who owns the address, so an
 * unconfirmed account's credentials (its password, any 2FA or passkey) are removed and its email marked
 * confirmed before the link: the proven
 * owner wins. When a check fails the step is skipped, and the flow's «confirm the link» path takes over.
 */
public class VerifiedOwnerAutoLink extends IdpAutoLinkAuthenticator {

    /** What to do with an existing account found by email. */
    enum Decision { SKIP, LINK }

    static Decision decide(boolean profileEdited, String duplicateAttribute, String duplicateValue, String brokerEmail,
                           boolean trustEmail, boolean brokerEmailVerified) {
        if (profileEdited) return Decision.SKIP;
        if (!"email".equals(duplicateAttribute) || brokerEmail == null || !brokerEmail.equalsIgnoreCase(duplicateValue)) {
            return Decision.SKIP;
        }
        if (!trustEmail && !brokerEmailVerified) return Decision.SKIP;
        return Decision.LINK;
    }

    @Override
    protected void authenticateImpl(AuthenticationFlowContext context, SerializedBrokeredIdentityContext serialized,
                                    BrokeredIdentityContext broker) {
        AuthenticationSessionModel auth = context.getAuthenticationSession();
        boolean edited = "true".equals(auth.getAuthNote("UPDATE_PROFILE_EMAIL_CHANGED"))
                || "true".equals(auth.getAuthNote("UPDATE_PROFILE_USERNAME_CHANGED"));
        String info = auth.getAuthNote(EXISTING_USER_INFO);
        if (info == null) {
            context.attempted();
            return;
        }
        ExistingUserInfo existing = ExistingUserInfo.deserialize(info);
        Decision decision = decide(edited, existing.getDuplicateAttributeName(), existing.getDuplicateAttributeValue(),
                broker.getEmail(), Boolean.TRUE.equals(broker.getIdpConfig().isTrustEmail()), broker.isEmailVerified());
        if (decision == Decision.SKIP) {
            context.attempted();
            return;
        }
        UserModel user = getExistingUser(context.getSession(), context.getRealm(), auth);
        if (!user.isEmailVerified()) {
            // Every credential of an unconfirmed account (its password, and any 2FA or passkey) is whoever
            // registered it, not the address's owner.
            List<String> credentials = user.credentialManager()
                    .getStoredCredentialsStream()
                    .map(CredentialModel::getId)
                    .toList();
            credentials.forEach(id -> user.credentialManager().removeStoredCredentialById(id));
            user.setEmailVerified(true);
            user.removeRequiredAction(EmailCodeAction.ID);
        }
        context.setUser(user);
        context.success();
    }
}
