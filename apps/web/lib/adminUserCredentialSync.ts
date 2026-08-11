type CredentialPatchInput = {
  currentEmail?: unknown;
  nextEmail?: unknown;
  nextPassword?: unknown;
};

function email(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function authCredentialPatch(input: CredentialPatchInput) {
  const currentEmail = email(input.currentEmail);
  const nextEmail = email(input.nextEmail);
  const nextPassword = String(input.nextPassword || "");
  const emailChanged = Boolean(nextEmail && nextEmail !== currentEmail);
  const passwordChanged = Boolean(nextPassword);
  return {
    changed: emailChanged || passwordChanged,
    emailChanged,
    passwordChanged,
    payload: {
      ...(emailChanged ? { email: nextEmail, email_confirm: true } : {}),
      ...(passwordChanged ? { password: nextPassword } : {})
    }
  };
}
