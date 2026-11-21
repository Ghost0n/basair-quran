package app.basair.keycloak.emailcode;

import org.keycloak.Config;
import org.keycloak.authentication.RequiredActionFactory;
import org.keycloak.authentication.RequiredActionProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;

/** Registers «qb-verify-email-code» (META-INF/services). */
public class EmailCodeActionFactory implements RequiredActionFactory {

    private static final EmailCodeAction INSTANCE = new EmailCodeAction();

    @Override
    public String getDisplayText() {
        return "Verify email with a code";
    }

    @Override
    public RequiredActionProvider create(KeycloakSession session) {
        return INSTANCE;
    }

    @Override
    public void init(Config.Scope config) {
    }

    @Override
    public void postInit(KeycloakSessionFactory factory) {
    }

    @Override
    public void close() {
    }

    @Override
    public String getId() {
        return EmailCodeAction.ID;
    }
}
