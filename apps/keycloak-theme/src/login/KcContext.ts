import type { ExtendKcContext } from "keycloakify/login";

import type { KcEnvName, ThemeName } from "../kc.gen";

export type KcContextExtension = {
  themeName: ThemeName;
  properties: Record<KcEnvName, string> & {};
};

export type KcContextExtensionPerPage = {
  /** The email-code page (apps/keycloak-email-code EmailCodeAction: its form attributes). */
  "login-email-code.ftl": {
    qbCodeEmail: string;
    qbCodeLength: number;
    qbCodeMinutes: number;
    /** Seconds before another code may be sent. */
    qbCodeResendIn: number;
    qbCodeSendsLeft: number;
    /** Set after a wrong code. */
    qbCodeTriesLeft?: number;
  };
};

export type KcContext = ExtendKcContext<KcContextExtension, KcContextExtensionPerPage>;
