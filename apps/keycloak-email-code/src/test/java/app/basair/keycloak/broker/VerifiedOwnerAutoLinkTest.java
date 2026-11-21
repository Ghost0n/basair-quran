package app.basair.keycloak.broker;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

import app.basair.keycloak.broker.VerifiedOwnerAutoLink.Decision;

class VerifiedOwnerAutoLinkTest {

    @Test
    void linksTheSameEmailWhenTheProviderVouchesForIt() {
        assertEquals(Decision.LINK, VerifiedOwnerAutoLink.decide(false, "email", "reader@example.com", "Reader@Example.com", true, false));
        assertEquals(Decision.LINK, VerifiedOwnerAutoLink.decide(false, "email", "reader@example.com", "reader@example.com", false, true));
    }

    @Test
    void skipsWhenTheProviderDoesNotVouchForTheEmail() {
        assertEquals(Decision.SKIP, VerifiedOwnerAutoLink.decide(false, "email", "reader@example.com", "reader@example.com", false, false));
    }

    @Test
    void skipsWhenTheEmailWasEditedOrDiffers() {
        assertEquals(Decision.SKIP, VerifiedOwnerAutoLink.decide(true, "email", "reader@example.com", "reader@example.com", true, true));
        assertEquals(Decision.SKIP, VerifiedOwnerAutoLink.decide(false, "email", "reader@example.com", "other@example.com", true, true));
        assertEquals(Decision.SKIP, VerifiedOwnerAutoLink.decide(false, "email", "reader@example.com", null, true, true));
    }

    @Test
    void skipsADuplicateUsernameRatherThanEmail() {
        assertEquals(Decision.SKIP, VerifiedOwnerAutoLink.decide(false, "username", "reader", "reader@example.com", true, true));
    }
}
