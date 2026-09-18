import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="auth-shell flex min-h-screen items-center justify-center bg-background px-4">
      <div className="glass-panel shadow-hellblau fade-in-up w-full max-w-sm rounded-2xl p-8">
        <div className="mb-6 text-center">
          <h1 className="gradient-text-animated text-lg font-bold">Anmelden</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Immobilien- und Liegenschaftsmanagement
          </p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
