import { AuthGate } from '@/components/auth-gate';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
