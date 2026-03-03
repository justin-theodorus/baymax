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

  // Extract role from JWT custom claims
  const jwt = user as unknown as { role?: string }
  const role = (user.app_metadata?.role as string) || (jwt.role as string)

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
