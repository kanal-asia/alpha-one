import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from '@tanstack/react-router'
import { Loader2, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { IconFacebook, IconGithub } from '@/assets/brand-icons'
import { useAuthStore } from '@/stores/auth-store'
import { sleep, cn } from '@/lib/utils'
import {
  startProductLogin,
  completeProductLogin,
  consumeProductLoginReturn,
} from './product-login'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'

const formSchema = z.object({
  email: z.string().email('Please enter your email.'),
  password: z
    .string()
    .min(1, 'Please enter your password.')
    .min(7, 'Password must be at least 7 characters long.'),
})

interface UserAuthFormProps extends React.HTMLAttributes<HTMLFormElement> {
  redirectTo?: string
}

// TASK-ALPHA-SUBSCRIPTION-002: mock sign-in gate. The legacy mock success
// path (mockUser + mock-access-token) must never silently grant access in a
// production build. It stays available ONLY in dev builds or when explicitly
// enabled with VITE_ALLOW_MOCK_AUTH=true (local development / automated UI
// tests). Packaged production builds fail closed with an actionable error.
export function isMockSignInAllowed(): boolean {
  if (import.meta.env.DEV === true) return true
  return import.meta.env.VITE_ALLOW_MOCK_AUTH === 'true'
}

export function UserAuthForm({
  className,
  redirectTo,
  ...props
}: UserAuthFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const navigate = useNavigate()
  const { auth } = useAuthStore()
  const [loginReturn] = useState(() =>
    typeof window === 'undefined' ? { code: null, error: null } : consumeProductLoginReturn()
  )
  const loginHandledRef = useRef(false)

  // TASK-ALPHA-SUBSCRIPTION-002A: complete a returning Google product login.
  // Guarded by ref (not just effect cleanup): the completion code is
  // single-use server-side, so a StrictMode double-invoke must not redeem
  // it twice — the second redemption would fail and clobber the success.
  useEffect(() => {
    if (loginHandledRef.current) return
    if (loginReturn.error !== null) {
      loginHandledRef.current = true
      toast.error('Google sign-in did not complete. Please try again.')
      return
    }
    if (loginReturn.code !== null) {
      loginHandledRef.current = true
      setIsGoogleLoading(true)
      completeProductLogin(loginReturn.code).then(
        (identity) => {
          setIsGoogleLoading(false)
          const targetPath = redirectTo || '/'
          navigate({ to: targetPath, replace: true })
          toast.success(`Welcome back${identity.email ? `, ${identity.email}` : ''}!`)
        },
        (err: unknown) => {
          setIsGoogleLoading(false)
          toast.error(err instanceof Error ? err.message : 'Google sign-in did not complete.')
        }
      )
    }
  }, [loginReturn, navigate, redirectTo])

  async function onGoogleSignIn(): Promise<void> {
    setIsGoogleLoading(true)
    try {
      // Redirects to Google; the callback returns here with a one-time code.
      await startProductLogin()
    } catch (err: unknown) {
      setIsGoogleLoading(false)
      toast.error(err instanceof Error ? err.message : 'Google sign-in is unavailable.')
    }
  }

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true)

    // Fail closed when no real provider is configured: never mint a session.
    if (!isMockSignInAllowed()) {
      setIsLoading(false)
      toast.error(
        'Sign-in is not configured in this build. Connect a supported identity provider to continue.'
      )
      return
    }

    toast.promise(sleep(2000), {
      loading: 'Signing in...',
      success: () => {
        setIsLoading(false)

        // Mock successful authentication with expiry computed at success time
        const mockUser = {
          accountNo: 'ACC001',
          email: data.email,
          role: ['user'],
          exp: Date.now() + 24 * 60 * 60 * 1000, // 24 hours from now
        }

        // Set user and access token
        auth.setUser(mockUser)
        auth.setAccessToken('mock-access-token')

        // Redirect to the stored location or default to dashboard
        const targetPath = redirectTo || '/'
        navigate({ to: targetPath, replace: true })

        return `Welcome back, ${data.email}!`
      },
      error: 'Error',
    })
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-3', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder='name@example.com' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem className='relative'>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <PasswordInput placeholder='********' {...field} />
              </FormControl>
              <FormMessage />
              <Link
                to='/forgot-password'
                className='absolute inset-e-0 -top-0.5 text-sm font-medium text-muted-foreground hover:opacity-75'
              >
                Forgot password?
              </Link>
            </FormItem>
          )}
        />
        <Button className='mt-2' disabled={isLoading}>
          {isLoading ? <Loader2 className='animate-spin' /> : <LogIn />}
          Sign in
        </Button>

        <div className='relative my-2'>
          <div className='absolute inset-0 flex items-center'>
            <span className='w-full border-t' />
          </div>
          <div className='relative flex justify-center text-xs uppercase'>
            <span className='bg-background px-2 text-muted-foreground'>
              Or continue with
            </span>
          </div>
        </div>

        <Button
          className='mt-2 w-full'
          type='button'
          variant='outline'
          disabled={isLoading || isGoogleLoading}
          onClick={() => void onGoogleSignIn()}
        >
          {isGoogleLoading ? <Loader2 className='animate-spin' /> : null}
          Continue with Google
        </Button>

        <div className='grid grid-cols-2 gap-2'>
          <Button variant='outline' type='button' disabled={isLoading}>
            <IconGithub className='h-4 w-4' /> GitHub
          </Button>
          <Button variant='outline' type='button' disabled={isLoading}>
            <IconFacebook className='h-4 w-4' /> Facebook
          </Button>
        </div>
      </form>
    </Form>
  )
}
