import { useIsPasswordRevealed } from "keycloakify/tools/useIsPasswordRevealed";

import type { I18n } from "../i18n";

/** A password field with the show / hide eye at its end (either direction). */
export function PasswordInput(props: {
  i18n: I18n;
  id: string;
  name: string;
  autoComplete: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const { i18n, id, name, autoComplete, invalid = false, describedBy } = props;
  const { isPasswordRevealed, toggleIsPasswordRevealed } = useIsPasswordRevealed({ passwordInputId: id });

  return (
    <div className="qb-kc-input-group">
      <input
        id={id}
        className="qb-auth-input"
        name={name}
        type="password"
        dir="auto"
        autoComplete={autoComplete}
        aria-invalid={invalid}
        aria-describedby={describedBy}
      />
      <button
        type="button"
        className="qb-kc-reveal"
        aria-label={i18n.msgStr(isPasswordRevealed ? "hidePassword" : "showPassword")}
        aria-controls={id}
        aria-pressed={isPasswordRevealed}
        onClick={toggleIsPasswordRevealed}
      >
        <i className={isPasswordRevealed ? "qb-kc-eye is-off" : "qb-kc-eye"} aria-hidden="true" />
      </button>
    </div>
  );
}
