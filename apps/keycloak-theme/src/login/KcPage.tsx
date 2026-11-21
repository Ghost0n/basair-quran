import { Suspense, lazy } from "react";

import DefaultPage from "keycloakify/login/DefaultPage";

import { classes } from "./classes";
import { useI18n } from "./i18n";
import type { KcContext } from "./KcContext";
import Template from "./Template";
import "./theme.css";

// The account page's two tabs load with the page: a switch between them (inPlace.ts) never waits.
import Login from "./pages/Login";
import Register from "./pages/Register";
import UserProfileFormFields from "keycloakify/login/UserProfileFormFields";

const LoginEmailCode = lazy(() => import("./pages/LoginEmailCode"));

/**
 * The «qbasair» login theme. Sign-in and sign-up (one account page, two tabs) and the email code
 * have their own pages; every other page (password reset, 2FA, errors, …) is
 * Keycloakify's, inside our Template, its Keycloak classes mapped to the
 * web's (no PatternFly).
 */
export default function KcPage(props: { kcContext: KcContext }) {
  const { kcContext } = props;
  const { i18n } = useI18n({ kcContext });

  return (
    <Suspense>
      {(() => {
        switch (kcContext.pageId) {
          case "login.ftl":
            return <Login kcContext={kcContext} i18n={i18n} classes={classes} Template={Template} doUseDefaultCss={false} />;
          case "register.ftl":
            return (
              <Register
                kcContext={kcContext}
                i18n={i18n}
                classes={classes}
                Template={Template}
                doUseDefaultCss={false}
                UserProfileFormFields={UserProfileFormFields}
              />
            );
          case "login-email-code.ftl":
            return <LoginEmailCode kcContext={kcContext} i18n={i18n} classes={classes} Template={Template} doUseDefaultCss={false} />;
          default:
            return (
              <DefaultPage
                kcContext={kcContext}
                i18n={i18n}
                classes={classes}
                Template={Template}
                doUseDefaultCss={false}
                UserProfileFormFields={UserProfileFormFields}
                doMakeUserConfirmPassword={true}
              />
            );
        }
      })()}
    </Suspense>
  );
}
