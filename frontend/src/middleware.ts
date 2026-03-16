import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  const isLoginPage =
    pathname === '/patient/login' ||
    pathname === '/caregiver/login' ||
    pathname === '/clinician/login'

  if (isLoginPage) {
    return supabaseResponse
  }

  if (!user) {
    if (pathname.startsWith('/patient')) {
      return NextResponse.redirect(new URL('/patient/login', request.url))
    }
    if (pathname.startsWith('/caregiver')) {
      return NextResponse.redirect(new URL('/caregiver/login', request.url))
    }
    if (pathname.startsWith('/clinician')) {
      return NextResponse.redirect(new URL('/clinician/login', request.url))
    }
    return supabaseResponse
  }

  // Extract role from the JWT payload (injected by custom_access_token_hook).
  // getUser() returns the server-side user object which does not include
  // custom claims — we must decode the access token directly.
  let role: string | undefined
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    try {
      const payload = JSON.parse(atob(session.access_token.split('.')[1]))
      role = payload.app_role as string | undefined
    } catch {
      role = undefined
    }
  }

  if (pathname.startsWith('/patient') && role !== 'patient') {
    return NextResponse.redirect(new URL('/patient/login', request.url))
  }
  if (pathname.startsWith('/caregiver') && role !== 'caregiver') {
    return NextResponse.redirect(new URL('/caregiver/login', request.url))
  }
  if (pathname.startsWith('/clinician') && role !== 'clinician') {
    return NextResponse.redirect(new URL('/clinician/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
