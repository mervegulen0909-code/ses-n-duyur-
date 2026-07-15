export type CredentialValidationError = 'invalidEmail' | 'passwordTooShort';
export type AuthErrorMessageKey =
  | 'invalidCredentials'
  | 'emailNotConfirmed'
  | 'accountExists'
  | 'signInFailed'
  | 'signUpFailed';

export function validateCredentials(
  email: string,
  password: string,
): CredentialValidationError | null {
  const normalizedEmail = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return 'invalidEmail';
  if (password.length < 6) return 'passwordTooShort';
  return null;
}

export function isValidLeagueName(name: string): boolean {
  return name.trim().length >= 3;
}

export function authErrorMessageKey(
  code: string | undefined,
  mode: 'login' | 'signup',
): AuthErrorMessageKey {
  if (code === 'invalid_credentials') return 'invalidCredentials';
  if (code === 'email_not_confirmed') return 'emailNotConfirmed';
  if (code === 'user_already_exists') return 'accountExists';
  return mode === 'login' ? 'signInFailed' : 'signUpFailed';
}
