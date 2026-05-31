import { redirect } from 'next/navigation'
import { isDemoMode } from '@/lib/demo'
import LoginForm from './LoginForm'

export default async function LoginPage() {
  if (await isDemoMode()) redirect('/')
  return <LoginForm />
}
