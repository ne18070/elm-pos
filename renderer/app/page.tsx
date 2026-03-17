import { redirect } from 'next/navigation';

// Root page redirects to POS (or login via AuthProvider)
export default function RootPage() {
  redirect('/pos');
}
