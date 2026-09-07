import type {
  CanonicalAuthUser,
  MemberIdentityError,
  MemberIdentityErrorScope,
  MemberIdentityState,
} from "../data/memberTypes.js";
import type { MemberRepository } from "./memberRepository.js";

export type MemberIdentityStateListener = (state: MemberIdentityState) => void;
export type AuthStateUnsubscribe = () => void;

export interface AuthGateway {
  configureDurablePersistence(): Promise<void>;
  observeAuthState(
    onUser: (user: CanonicalAuthUser | null) => void,
    onError: (error: unknown) => void,
  ): AuthStateUnsubscribe;
  signInWithEmailPassword(email: string, password: string): Promise<void>;
  createAccountWithEmailPassword(email: string, password: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
}

const INITIALIZING_STATE: MemberIdentityState = {
  status: "initializing",
  authUser: null,
  member: null,
  error: null,
};

const SIGNED_OUT_STATE: MemberIdentityState = {
  status: "signedOut",
  authUser: null,
  member: null,
  error: null,
};

const AUTH_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  "auth/invalid-email": "Enter a valid email address.",
  "auth/invalid-credential": "The email or password is incorrect.",
  "auth/email-already-in-use": "An account already uses this email address.",
  "auth/weak-password": "Choose a stronger password.",
  "auth/popup-closed-by-user": "Google sign-in was closed before it finished.",
  "auth/popup-blocked": "The browser blocked the Google sign-in window.",
  "auth/network-request-failed": "The network is unavailable. Try again when connected.",
  "auth/too-many-requests": "Too many attempts were made. Try again later.",
  "auth/user-disabled": "This account is disabled.",
};

function errorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return "member/unknown";
}

export function normalizeMemberIdentityError(
  scope: MemberIdentityErrorScope,
  error: unknown,
): MemberIdentityError {
  const code = errorCode(error);
  return {
    scope,
    code,
    message:
      AUTH_ERROR_MESSAGES[code] ??
      (scope === "member"
        ? "Your account is signed in, but the StudioRich member profile could not be loaded."
        : "StudioRich sign-in is temporarily unavailable."),
  };
}

export class MemberIdentityActionError extends Error {
  readonly detail: MemberIdentityError;

  constructor(detail: MemberIdentityError) {
    super(detail.message);
    this.name = "MemberIdentityActionError";
    this.detail = detail;
  }
}

export class StudioRichMemberIdentityAuthority {
  private readonly listeners = new Set<MemberIdentityStateListener>();
  private state: MemberIdentityState = INITIALIZING_STATE;
  private unsubscribeAuth: AuthStateUnsubscribe | null = null;
  private startPromise: Promise<void> | null = null;
  private active = false;
  private lifecycleGeneration = 0;
  private authResolutionGeneration = 0;

  constructor(
    private readonly auth: AuthGateway,
    private readonly members: MemberRepository,
  ) {}

  getState(): MemberIdentityState {
    return this.state;
  }

  subscribe(listener: MemberIdentityStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  start(): Promise<void> {
    if (this.unsubscribeAuth) return Promise.resolve();
    if (this.startPromise) return this.startPromise;

    this.active = true;
    const generation = ++this.lifecycleGeneration;
    this.setState(INITIALIZING_STATE);

    const startOperation = (async () => {
      try {
        await this.auth.configureDurablePersistence();
        if (!this.active || generation !== this.lifecycleGeneration) return;

        this.unsubscribeAuth = this.auth.observeAuthState(
          (user) => void this.resolveAuthUser(user),
          (error) => this.handleAuthListenerError(error),
        );
      } catch (error) {
        if (!this.active || generation !== this.lifecycleGeneration) return;
        this.active = false;
        const detail = normalizeMemberIdentityError("session", error);
        this.setError(null, detail);
        throw new MemberIdentityActionError(detail);
      }
    });

    const trackedStartOperation = startOperation().finally(() => {
      if (this.startPromise === trackedStartOperation) this.startPromise = null;
    });
    this.startPromise = trackedStartOperation;

    return this.startPromise;
  }

  stop(): void {
    this.active = false;
    this.lifecycleGeneration += 1;
    this.authResolutionGeneration += 1;
    this.unsubscribeAuth?.();
    this.unsubscribeAuth = null;
    this.startPromise = null;
    this.setState(SIGNED_OUT_STATE);
  }

  signInWithEmailPassword(email: string, password: string): Promise<void> {
    return this.runAuthOperation("signIn", () =>
      this.auth.signInWithEmailPassword(email, password),
    );
  }

  createAccountWithEmailPassword(email: string, password: string): Promise<void> {
    return this.runAuthOperation("createAccount", () =>
      this.auth.createAccountWithEmailPassword(email, password),
    );
  }

  signInWithGoogle(): Promise<void> {
    return this.runAuthOperation("googleSignIn", () => this.auth.signInWithGoogle());
  }

  signOut(): Promise<void> {
    this.authResolutionGeneration += 1;
    return this.runAuthOperation("signOut", () => this.auth.signOut());
  }

  private async runAuthOperation(
    scope: MemberIdentityErrorScope,
    operation: () => Promise<void>,
  ): Promise<void> {
    if (!this.active || !this.unsubscribeAuth) {
      const detail: MemberIdentityError = {
        scope,
        code: "member/authority-not-started",
        message: "StudioRich member identity has not finished starting.",
      };
      this.setError(null, detail);
      throw new MemberIdentityActionError(detail);
    }

    this.setState(INITIALIZING_STATE);
    try {
      await operation();
    } catch (error) {
      const detail = normalizeMemberIdentityError(scope, error);
      this.setError(null, detail);
      throw new MemberIdentityActionError(detail);
    }
  }

  private async resolveAuthUser(authUser: CanonicalAuthUser | null): Promise<void> {
    const generation = ++this.authResolutionGeneration;

    if (!authUser) {
      this.setState(SIGNED_OUT_STATE);
      return;
    }

    this.setState({
      status: "initializing",
      authUser,
      member: null,
      error: null,
    });

    try {
      const member = await this.members.ensureMemberForAuthUser(authUser);
      if (!this.active || generation !== this.authResolutionGeneration) return;
      this.setState({
        status: "signedIn",
        authUser,
        member,
        error: null,
      });
    } catch (error) {
      if (!this.active || generation !== this.authResolutionGeneration) return;
      this.setError(authUser, normalizeMemberIdentityError("member", error));
    }
  }

  private handleAuthListenerError(error: unknown): void {
    this.authResolutionGeneration += 1;
    this.setError(null, normalizeMemberIdentityError("session", error));
  }

  private setError(authUser: CanonicalAuthUser | null, error: MemberIdentityError): void {
    this.setState({ status: "error", authUser, member: null, error });
  }

  private setState(state: MemberIdentityState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
