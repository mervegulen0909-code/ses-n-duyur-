import { describe, expect, it } from 'vitest';

import { authErrorMessageKey, isValidLeagueName, validateCredentials } from './form-validation';

describe('validateCredentials', () => {
  it.each(['', 'user', 'user@', '@example.com', 'user example.com'])(
    'rejects invalid email %j',
    (email) => {
      expect(validateCredentials(email, 'secret1')).toBe('invalidEmail');
    },
  );

  it('trims a valid email and enforces the Supabase six-character password minimum', () => {
    expect(validateCredentials(' user@example.com ', '12345')).toBe('passwordTooShort');
    expect(validateCredentials(' user@example.com ', '123456')).toBeNull();
  });
});

describe('isValidLeagueName', () => {
  it('requires at least three non-padding characters', () => {
    expect(isValidLeagueName('  ab  ')).toBe(false);
    expect(isValidLeagueName('  abc  ')).toBe(true);
  });
});

describe('authErrorMessageKey', () => {
  it('maps stable Supabase Auth error codes without exposing raw provider messages', () => {
    expect(authErrorMessageKey('invalid_credentials', 'login')).toBe('invalidCredentials');
    expect(authErrorMessageKey('email_not_confirmed', 'login')).toBe('emailNotConfirmed');
    expect(authErrorMessageKey('user_already_exists', 'signup')).toBe('accountExists');
  });

  it('uses a localized generic fallback for unknown provider errors', () => {
    expect(authErrorMessageKey(undefined, 'login')).toBe('signInFailed');
    expect(authErrorMessageKey('provider_changed', 'signup')).toBe('signUpFailed');
  });
});
